// Imports
import * as WSH from '~~/shared/websockets';
import { readToken } from '../utils/tokens';
import { publishPosition, subscribeToPositions, getLatestPositionsBySender } from '../lib/redis';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Keep track of connected peers by convoyId for broadcasting
const convoyPeers: Map<string, Set<any>> = new Map();
const observerPeers: Set<any> = new Set();

function sendPosition(peer: any, seq: number, data: string, convoyId?: string) {
	// data is base64 of the original position JSON. For observers, annotate with convoyId.
	let payloadBuf: Buffer;
	if (convoyId) {
		try {
			const decoded = Buffer.from(data, 'base64').toString('utf8');
			const obj = JSON.parse(decoded);
			obj.convoyId = convoyId;
			payloadBuf = Buffer.from(JSON.stringify(obj));
		} catch (e) {
			// fallback to original if something goes wrong
			payloadBuf = Buffer.from(data, 'base64');
		}
	} else {
		payloadBuf = Buffer.from(data, 'base64');
	}
	peer.send(WSH.encodeFrame(WSH.CWSMessageType.POSITION, 0, seq, new Uint8Array(payloadBuf)));
}

// Subscribe to Redis position messages and broadcast to local peers
subscribeToPositions((msg) => {
	try {
		const convoyPeersForId = convoyPeers.get(msg.convoyId);
		if (convoyPeersForId && convoyPeersForId.size > 0) {
			for (const p of convoyPeersForId) {
				try {
					if (p.context?.session?.sub === msg.sender) continue;
					sendPosition(p, Number(msg.seq), msg.data);
				} catch (e) {
					console.warn('[ws] failed to send position to convoy peer', e);
				}
			}
		}
		if (observerPeers.size > 0) {
			for (const p of observerPeers) {
				try {
					if (p.context?.session?.sub === msg.sender) continue;
					// annotate payload for observers with convoyId so clients know which convoy the sender belongs to
					sendPosition(p, Number(msg.seq), msg.data, msg.convoyId);
				} catch (e) {
					console.warn('[ws] failed to send position to observer peer', e);
				}
			}
		}
	} catch (e) {
		console.warn('[ws] error broadcasting redis position', e);
	}
});

async function replayPositions(peer: any, convoyId: string, excludeSub?: string) {
	try {
		const positions = await getLatestPositionsBySender(convoyId);
		for (const pos of positions) {
			if (excludeSub && pos.sender === excludeSub) continue;
			sendPosition(peer, pos.seq, pos.data);
		}
	} catch (e) {
		console.warn('[ws] failed to replay positions', e);
	}
}

// Websocket Handler
export default defineWebSocketHandler({
	open(peer) {
		peer.context.seq = new WSH.Sequence();
	},

	close(peer) {
		try {
			const session = peer.context.session as any | undefined;
			if (session?.mode === 'observer') {
				observerPeers.delete(peer);
				return;
			}
			if (session?.convoyId) {
				const set = convoyPeers.get(session.convoyId);
				if (set) {
					set.delete(peer);
					if (set.size === 0) convoyPeers.delete(session.convoyId);
				}
			}
		} catch {
			// ignore
		}
	},

	async message(peer, rawmessage) {
		const frame = WSH.decodeFrame(rawmessage.uint8Array());
		if (!frame) return;
		const sseq = peer.context.seq as WSH.Sequence;
		// Handle frame
		switch (frame.type) {
			// HELLO  - Ask for auth
			case WSH.CWSMessageType.HELLO: {
				if (!peer.context.session) peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_REQ, WSH.CWSFlag.PRIORITY, sseq.next()));
				return;
			}

			// AUTH_JWT - Authenticating using a JWT
			case WSH.CWSMessageType.AUTH_JWT: {
				// Read payload and validate token
				const token = frame.payload.toString();
				const isConvoyToken = await verifyToken(token, 'convoy:' + APP_DOMAIN);
				const isObserverToken = await verifyToken(token, 'convoy-observer:' + APP_DOMAIN);
				if (!isConvoyToken && !isObserverToken) {
					peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_ERROR, WSH.CWSFlag.PRIORITY, sseq.next()));
					return;
				}
				// Read token
				const tokenData = (await readToken(token)) as any | null;
				if (!tokenData) {
					peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_ERROR, WSH.CWSFlag.PRIORITY, sseq.next()));
					return;
				}
				const isObserverAuth = tokenData.sub === 'observer' || tokenData.aud === 'convoy-observer:' + APP_DOMAIN;
				// Setup session
				// TODO: displayName if username in use
				// TODO: announce user
				peer.context.session = {
					sub: tokenData.sub,
					mode: isObserverAuth ? 'observer' : (tokenData.mode ?? 'user'),
					username: tokenData.username ?? (isObserverAuth ? 'observateur' : 'user'),
					displayname: tokenData.displayname ?? (isObserverAuth ? 'Observateur' : undefined),
					role: tokenData.role ?? (isObserverAuth ? undefined : 'user'),
					convoyId: isObserverAuth ? undefined : tokenData.convoyId,
					joinedAt: tokenData.joinedAt ?? Date.now(),
				};
				// Register peer
				try {
					if (isObserverAuth) {
						observerPeers.add(peer);
					} else if (peer.context.session.convoyId) {
						const set = convoyPeers.get(peer.context.session.convoyId) ?? new Set();
						set.add(peer);
						convoyPeers.set(peer.context.session.convoyId, set);
					}
				} catch (e) {
					console.warn('[ws] failed to register peer', e);
				}
				// OK.
				peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_OK, WSH.CWSFlag.PRIORITY, sseq.next(), new TextEncoder().encode(JSON.stringify(peer.context.session))));
				if (!isObserverAuth && peer.context.session.convoyId) await replayPositions(peer, peer.context.session.convoyId, peer.context.session.sub);
				return;
			}

			// Handle keep alive ping
			case WSH.CWSMessageType.PING: {
				peer.send(WSH.encodeFrame(WSH.CWSMessageType.PONG, 0, frame.sequence));
				return;
			}

			// Handle new position sync
			case WSH.CWSMessageType.POSITION: {
				if (!peer.context.session) {
					peer.send(WSH.encodeFrame(WSH.CWSMessageType.NACK, 0, sseq.next()));
					return;
				}
				const convoyId = peer.context.session.convoyId as string;
				const sender = peer.context.session.sub as string;
				try {
					await publishPosition(convoyId, frame.sequence, sender, frame.payload);
				} catch (e) {
					console.warn('[ws] publishPosition failed', e);
				}
				peer.send(WSH.encodeFrame(WSH.CWSMessageType.POSITION_ACK, WSH.CWSFlag.ACK_REQUIRED, frame.sequence));
				return;
			}
		}
	},
});

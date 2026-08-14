// Imports
import * as WSH from '~~/shared/websockets';
import { readToken } from '../utils/tokens';
import { publishPosition, subscribeToPositions, getLatestPositionsBySender } from '../lib/redis';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Keep track of connected peers by convoyId for broadcasting
const convoyPeers: Map<string, Set<any>> = new Map();

function sendPosition(peer: any, seq: number, data: string) {
	const payload = Buffer.from(data, 'base64');
	peer.send(WSH.encodeFrame(WSH.CWSMessageType.POSITION, 0, seq, new Uint8Array(payload)));
}

// Subscribe to Redis position messages and broadcast to local peers
subscribeToPositions((msg) => {
	try {
		const peers = convoyPeers.get(msg.convoyId);
		if (!peers || peers.size === 0) return;
		for (const p of peers) {
			try {
				if (p.context?.session?.sub === msg.sender) continue;
				sendPosition(p, Number(msg.seq), msg.data);
			} catch (e) {
				console.warn('[ws] failed to send position to peer', e);
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
			case WSH.CWSMessageType.HELLO:
				if (!peer.context.session) peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_REQ, WSH.CWSFlag.PRIORITY, sseq.next()));
				return;

			// AUTH_JWT - Authenticating using a JWT
			case WSH.CWSMessageType.AUTH_JWT:
				// Read payload and validate token
				const token = frame.payload.toString();
				// Invalid token
				if (!(await verifyToken(token, 'convoy:' + APP_DOMAIN))) {
					peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_ERROR, WSH.CWSFlag.PRIORITY, sseq.next()));
					return;
				}
				// Read token
				const tokenData = (await readToken(token)) as any | null;
				if (!tokenData) {
					peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_ERROR, WSH.CWSFlag.PRIORITY, sseq.next()));
					return;
				}
				// Setup session
				// TODO: displayName if username in use
				// TODO: announce user
				peer.context.session = {
					sub: tokenData.sub,
					mode: tokenData.mode,
					username: tokenData.username,
					role: tokenData.role,
					convoyId: tokenData.convoyId,
					joinedAt: tokenData.joinedAt,
				};
				// Register peer
				try {
					if (peer.context.session.convoyId) {
						const set = convoyPeers.get(peer.context.session.convoyId) ?? new Set();
						set.add(peer);
						convoyPeers.set(peer.context.session.convoyId, set);
					}
				} catch (e) {
					console.warn('[ws] failed to register peer for convoy', e);
				}
				// OK.
				peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_OK, WSH.CWSFlag.PRIORITY, sseq.next(), new TextEncoder().encode(JSON.stringify(peer.context.session))));
				await replayPositions(peer, peer.context.session.convoyId, peer.context.session.sub);
				return;
			}

			// Handle keep alive ping
			case WSH.CWSMessageType.PING:
				peer.send(WSH.encodeFrame(WSH.CWSMessageType.PONG, 0, frame.sequence));
				return;

			// Handle new position sync
			case WSH.CWSMessageType.POSITION:
				if (!peer.context.session) {
					peer.send(WSH.encodeFrame(WSH.CWSMessageType.NACK, 0, sseq.next()));
					return;
				}
				{
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

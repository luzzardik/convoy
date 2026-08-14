// Imports
import * as WSH from '~~/shared/websockets';
import { readToken } from '../utils/tokens';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Websocket Handler
export default defineWebSocketHandler({
	open(peer) {
		peer.context.seq = new WSH.Sequence();
	},

	async message(peer, rawmessage) {
		// Validate and decode frame
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
				// OK.
				peer.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_OK, WSH.CWSFlag.PRIORITY, sseq.next(), new TextEncoder().encode(JSON.stringify(peer.context.session))));
				return;
		}
	},
});

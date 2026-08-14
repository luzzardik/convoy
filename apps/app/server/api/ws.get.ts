// Imports
import * as WSH from '~~/shared/websockets';

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
				break;

			// AUTH_JWT - Authenticating using a JWT
			case WSH.CWSMessageType.AUTH_JWT:
				// TODO
				break;
		}
	},
});

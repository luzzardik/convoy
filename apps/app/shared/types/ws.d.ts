import type { Sequence, ConvoyWSSession } from '../websockets';

declare module 'crossws' {
	interface PeerContext {
		seq: Sequence;
		session?: ConvoyWSSession | undefined;
	}
}

export {};

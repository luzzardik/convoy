import type { Sequence } from '../websockets';

declare module 'crossws' {
	interface PeerContext {
		seq: Sequence;
		session?:
			| {
					sub: string;
					mode: 'user' | 'organizer';
					username: string;
					role: 'user' | 'regulator' | 'head' | 'opener' | 'sweep';
					convoyId: string;
					joinedAt: number;
			  }
			| undefined;
	}
}

export {};

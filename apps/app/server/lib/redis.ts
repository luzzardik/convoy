// Imports
import Redis from 'ioredis';

// Redis configuration
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const STREAM_MAXLEN = 500;
const REPLAY_COUNT = 100;

// Pubsub clients
const pub = new Redis(REDIS_URL),
	sub = new Redis(REDIS_URL);

// PositionMessage
export type PositionMessage = {
	convoyId: string;
	seq: number;
	sender: string;
	data: string; // base64
};

// StoredPosition
export type StoredPosition = {
	seq: number;
	sender: string;
	data: string; // base64
};

// Position listeners
const listeners: Array<(msg: PositionMessage) => void> = [];

// Subscribe to positions
sub
	.psubscribe('positions:*')
	.then(() => {
		console.debug('[redis] psubscribed to positions:*');
	})
	.catch((e) => console.warn('[redis] psubscribe failed', e));

// On new PB message
sub.on('pmessage', (_pattern, channel, message) => {
	try {
		const payload = JSON.parse(message) as PositionMessage;
		listeners.forEach((l) => l(payload));
	} catch (e) {
		console.warn('[redis] failed to parse position message', e);
	}
});

// Parse stream fields
function parseStreamFields(fields: string[]): StoredPosition | null {
	const map: Record<string, string> = {};
	for (let i = 0; i < fields.length; i += 2) {
		map[fields[i]!] = fields[i + 1]!;
	}
	if (!map.seq || !map.sender || !map.data) return null;
	return { seq: Number(map.seq), sender: map.sender, data: map.data };
}

// Publish position
export async function publishPosition(convoyId: string, seq: number, sender: string, data: Uint8Array) {
	const b64 = Buffer.from(data).toString('base64');
	const streamKey = `positions:${convoyId}`;
	try {
		await pub.xadd(streamKey, 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'seq', String(seq), 'sender', sender, 'data', b64);
	} catch (e) {
		console.warn('[redis] xadd failed', e);
	}
	try {
		await pub.publish(streamKey, JSON.stringify({ convoyId, seq, sender, data: b64 }));
	} catch (e) {
		console.warn('[redis] publish failed', e);
	}
}

/** Latest position per sender from the Redis stream (newest first). */
export async function getLatestPositionsBySender(convoyId: string, count = REPLAY_COUNT): Promise<StoredPosition[]> {
	const streamKey = `positions:${convoyId}`;
	try {
		const entries = await pub.xrevrange(streamKey, '+', '-', 'COUNT', count);
		const latestBySender = new Map<string, StoredPosition>();
		for (const [, fields] of entries) {
			const pos = parseStreamFields(fields);
			if (!pos || latestBySender.has(pos.sender)) continue;
			latestBySender.set(pos.sender, pos);
		}
		return [...latestBySender.values()];
	} catch (e) {
		console.warn('[redis] xrevrange failed', e);
		return [];
	}
}

export function subscribeToPositions(handler: (msg: PositionMessage) => void) {
	listeners.push(handler);
}

export default {
	pub,
	sub,
	publishPosition,
	getLatestPositionsBySender,
	subscribeToPositions,
};

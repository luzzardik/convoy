// ** Byte Frame format **
// VERSION   1 byte
// MSG_TYPE  1 byte
// FLAGS     1 byte
// SEQUENCE  4 bytes
// LEN       2 bytes
// PAYLOAD   LEN bytes

export const CWS_VERSION = 1;
export const CWS_HEADER_SIZE = 9;

// Message Types Enum
export enum CWSMessageType {
	// Handshake & Auth
	HELLO = 0x01,
	AUTH_REQ = 0x02,
	AUTH_JWT = 0x03,
	AUTH_OK = 0x04,
	AUTH_ERROR = 0x05,

	// Keep alive
	PING = 0x10,
	PONG = 0x11,

	// Position update
	POSITION = 0x20,
	POSITION_ACK = 0x21,

	// Acknowledgment
	ACK = 0x30,
	NACK = 0x31,
}

// Flags Enum
export enum CWSFlag {
	ACK_REQUIRED = 0x01,
	PRIORITY = 0x02,
}

// Acknowledgment / error codes
export enum CWSErrorCode {
	INVALID_FRAME = 0x01,
	INVALID_VERSION = 0x02,
	INVALID_MESSAGE = 0x03,
	INVALID_PAYLOAD = 0x04,
	UNAUTHORIZED = 0x05,
	FORBIDDEN = 0x06,
	NOT_FOUND = 0x07,
	RATE_LIMITED = 0x08,
	CONFLICT = 0x09,
	SERVER_ERROR = 0x0a,
}

// Validation error codes
export enum CWSValidationError {
	INVALID_FRAME = 0x01,
	INVALID_VERSION = 0x02,
	INVALID_MESSAGE = 0x03,
	INVALID_FLAGS = 0x04,
	INVALID_LENGTH = 0x05,
}

// Validation result interface
export interface CWSValidationResult {
	valid: boolean;
	error?: CWSValidationError;

	version?: number;
	type?: CWSMessageType;
	flags?: number;
	sequence?: number;
	length?: number;
}

// Valid message types set
const VALID_MESSAGE_TYPES = new Set<number>(Object.values(CWSMessageType).filter((value): value is number => typeof value === 'number'));

// Valid flags
const VALID_FLAGS = CWSFlag.ACK_REQUIRED | CWSFlag.PRIORITY;

// Validate binary
export function validateBinary(buffer: Uint8Array | ArrayBuffer): CWSValidationResult {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

	// Header must exist
	if (bytes.byteLength < CWS_HEADER_SIZE) {
		return {
			valid: false,
			error: CWSValidationError.INVALID_FRAME,
		};
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	// Validate version
	const version = view.getUint8(0);

	if (version !== CWS_VERSION) {
		return {
			valid: false,
			error: CWSValidationError.INVALID_VERSION,
			version,
		};
	}

	// Validate type
	const type = view.getUint8(1);

	if (!VALID_MESSAGE_TYPES.has(type)) {
		return {
			valid: false,
			error: CWSValidationError.INVALID_MESSAGE,
			version,
			type,
		};
	}

	// Read flags
	const flags = view.getUint8(2);

	// Reject unknown flag bits
	if ((flags & ~VALID_FLAGS) !== 0) {
		return {
			valid: false,
			error: CWSValidationError.INVALID_FLAGS,
			version,
			type: type as CWSMessageType,
			flags,
		};
	}

	// Read SEQ + LEN
	//
	// DataView defaults to big-endian when littleEndian is omitted.
	const sequence = view.getUint32(3);
	const length = view.getUint16(7);

	// LEN must describe exactly the remaining payload
	if (length !== bytes.byteLength - CWS_HEADER_SIZE) {
		return {
			valid: false,
			error: CWSValidationError.INVALID_LENGTH,
			version,
			type: type as CWSMessageType,
			flags,
			sequence,
			length,
		};
	}

	return {
		valid: true,
		version,
		type: type as CWSMessageType,
		flags,
		sequence,
		length,
	};
}

// Frame
export interface CWSFrame {
	version: number;
	type: CWSMessageType;
	flags: number;
	sequence: number;
	payload: Uint8Array;
}

// Frame decoder
export function decodeFrame(buffer: Uint8Array | ArrayBuffer): CWSFrame | null {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

	const validation = validateBinary(bytes);

	if (!validation.valid) {
		return null;
	}

	return {
		version: validation.version!,
		type: validation.type!,
		flags: validation.flags!,
		sequence: validation.sequence!,
		payload: bytes.subarray(CWS_HEADER_SIZE),
	};
}

// Encode frame
export function encodeFrame(type: CWSMessageType, flags: number, sequence: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
	if (!VALID_MESSAGE_TYPES.has(type)) {
		throw new Error('Invalid message type');
	}

	if ((flags & ~VALID_FLAGS) !== 0) {
		throw new Error('Invalid flags');
	}

	if (payload.length > 0xffff) {
		throw new Error('Payload too large');
	}

	const buffer = new ArrayBuffer(CWS_HEADER_SIZE + payload.length);

	const view = new DataView(buffer);

	view.setUint8(0, CWS_VERSION);
	view.setUint8(1, type);
	view.setUint8(2, flags);
	view.setUint32(3, sequence >>> 0);
	view.setUint16(7, payload.length);

	new Uint8Array(buffer).set(payload, CWS_HEADER_SIZE);

	return new Uint8Array(buffer);
}

// Sequence
export class Sequence {
	private value = 0;

	next(): number {
		const sequence = this.value;
		this.value = (this.value + 1) >>> 0;
		return sequence;
	}
}

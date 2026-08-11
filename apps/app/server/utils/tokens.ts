// Imports
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { importSPKI, exportJWK, JWK } from 'jose';
import jwt from 'jsonwebtoken';

// Env. variables
const { JWT_SECRET, USE_JWT_KEYS_REPOSITORY, JWT_KEYS_REPOSITORY } = process.env;

// Load key from JWKS repository
async function loadKey(keyPath: string): Promise<{ fileName: string; key: string }> {
	return new Promise((resolve, reject) => {
		fs.readFile(keyPath, {}, (e, data) => {
			if (e) return reject(e);
			const key = data.toString();
			return resolve({ fileName: path.basename(keyPath), key });
		});
	});
}

// Can use JWKS ?
const canUseJWKS = () => USE_JWT_KEYS_REPOSITORY == 'true' && JWT_KEYS_REPOSITORY;

// Discover keys
type RepoKeyPair = { kid: string; date: string; public?: string; private?: string; jwkPublic?: JWK };
export async function discoverKeys(): Promise<RepoKeyPair[]> {
	// Can use JWKS ?
	if (!canUseJWKS()) return [];
	// Find PEMs
	const KEYS_DIRECTORY = path.resolve(JWT_KEYS_REPOSITORY!);
	const filesList = fs.readdirSync(KEYS_DIRECTORY).filter((f) => f.endsWith('.pem'));
	const files = await Promise.all(filesList.map((f) => loadKey(path.join(KEYS_DIRECTORY, f))));
	// Build pairs
	const pairs: Record<string, RepoKeyPair> = {};
	for (let file of files) {
		// Split file name
		const splitFileName = file.fileName.split('.');
		if (splitFileName.length !== 3) continue;
		// Get details
		const [rawKid, typ] = splitFileName;
		const kid = crypto.createHash('md5').update(rawKid!).digest('base64url');
		if (!pairs[kid]) pairs[kid] = { kid, date: rawKid! };
		// Populate
		switch (typ) {
			case 'pbk':
				pairs[kid].public = file.key;
				const jwks_key = await importSPKI(file.key, 'RS256');
				const jwks_jwk = await exportJWK(jwks_key);
				jwks_jwk.use = 'sig';
				jwks_jwk.alg = 'RS256';
				jwks_jwk.kid = kid;
				pairs[kid].jwkPublic = jwks_jwk;
				break;
			case 'pvk':
				pairs[kid].private = file.key;
				break;
			default:
				break;
		}
	}
	// Return pairs
	return Object.values(pairs);
}

// Get active signing key
export async function getActiveSigningKeyPair(pairs: RepoKeyPair[]) {
	const pairsWithPrivateKeys = pairs.filter((f) => !!f.private);
	const activeKey = pairsWithPrivateKeys.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))[0];
	return activeKey;
}

// Get private key
export async function getJWTSignKey(): Promise<string | RepoKeyPair | undefined> {
	// JWKS
	if (canUseJWKS()) return await getActiveSigningKeyPair(await discoverKeys());
	// Simple secret
	return JWT_SECRET;
}

// Get public key
export async function findJWTVerifyKey(kid: string): Promise<string | RepoKeyPair | undefined> {
	// SPVK key
	if (kid == 'spvk' && canUseJWKS()) throw 'key_not_found_or_unusable';
	if (kid == 'spvk' && !canUseJWKS()) return JWT_SECRET;
	// JWKS
	const keys = await discoverKeys();
	const key = keys.find((p) => p.kid == kid);
	if (!key) throw 'key_not_found_or_unusable';
	return key;
}

// Create token
export async function createToken(content: Record<string, string | number>) {
	// Get private key
	const privateKey = await getJWTSignKey();
	if (privateKey === undefined || (typeof privateKey !== 'string' && privateKey.private == null)) throw 'token_sign_key_unavailable';
	// Sign JWT
	return jwt.sign(content, typeof privateKey == 'string' ? privateKey : privateKey.private!, {
		keyid: typeof privateKey == 'string' ? 'spvk' : privateKey.kid,
		algorithm: typeof privateKey == 'string' ? 'HS256' : 'RS256',
	});
}

// Validate token
export async function verifyToken(token: string | undefined, audience: string | null = null) {
	try {
		if (typeof token !== 'string') return false;
		const payload = jwt.decode(token, { complete: true });
		if (!payload || typeof payload == 'string' || !payload.header?.kid) return false;
		const key = await findJWTVerifyKey(payload.header.kid);
		if (!key || (typeof key == 'object' && !key.public)) return false;
		jwt.verify(token, typeof key == 'string' ? key : key.public!, {
			audience: audience ?? undefined,
		});
		return true;
	} catch (e) {
		return false;
	}
}

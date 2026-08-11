// Imports
import argon from 'argon2';

// Env. variable
const { ALLOW_INSECURE_SECRETS } = process.env;

// Validate env. password
export default async function validateEnvPassword(plain: string, digest: string) {
	if (!digest || !plain) return false;
	if (!ALLOW_INSECURE_SECRETS && !digest.startsWith('$argon2')) return false;
	if (!digest.startsWith('argon2')) return digest === plain;
	return argon.verify(digest, plain);
}

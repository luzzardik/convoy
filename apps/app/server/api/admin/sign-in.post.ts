// Imports
import { createToken } from '~~/server/utils/tokens';
import validateEnvPassword from '~~/server/utils/validateEnvPassword';

// Environment variables
const { ADMIN_PASSWORD, ALLOW_INSECURE_SECRETS, APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	// Validate request
	const body = await readBody(event);
	if (!body.password) return replyWithError(event, 'bad_request', 400);
	// Check server conditions
	if (!ADMIN_PASSWORD || (!ALLOW_INSECURE_SECRETS && !ADMIN_PASSWORD.startsWith('$argon2')) || !APP_DOMAIN) return replyWithError(event, 'server_not_ready', 501);
	// Check password
	if (!(await validateEnvPassword(body.password, ADMIN_PASSWORD))) return replyWithError(event, 'invalid_credentials', 403);
	// Create a token
	const token = await createToken({
		aud: 'convoy-admin:' + APP_DOMAIN,
		iss: 'convoy-app:' + APP_DOMAIN,
		exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
		sub: 'admin',
		// TODO: jku (JWKS repo)
	});
	// TODO: this is irrevocable, fix it.
	// Save it as a HTTP-only cookie
	const isSecureContext = !!APP_DOMAIN?.startsWith('https://') || process.env.NODE_ENV === 'production';
	setCookie(event, 'cast', token, { httpOnly: true, secure: isSecureContext, sameSite: 'lax' });
	// OK.
	return { ok: true };
});

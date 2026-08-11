// Imports
import { createToken } from '~~/server/utils/tokens';
import validateEnvPassword from '~~/server/utils/validateEnvPassword';

// Environment variables
const { OBSERVER_PASSWORD, ALLOW_INSECURE_SECRETS, APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	// Validate request
	const body = await readBody(event);
	if (!body.password) return replyWithError(event, 'bad_request', 400);
	// Check server conditions
	if (!OBSERVER_PASSWORD || (!ALLOW_INSECURE_SECRETS && !OBSERVER_PASSWORD.startsWith('$argon2')) || !APP_DOMAIN) return replyWithError(event, 'server_not_ready', 501);
	// Check password
	if (!(await validateEnvPassword(body.password, OBSERVER_PASSWORD))) return replyWithError(event, 'invalid_credentials', 403);
	// Create a token
	const token = await createToken({
		aud: 'convoy-observer:' + APP_DOMAIN,
		iss: 'convoy-app:' + APP_DOMAIN,
		exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
		sub: 'observer',
		// TODO: jku (JWKS repo)
	});
	// TODO: this is irrevocable, fix it.
	// Save it as a HTTP-only cookie
	setCookie(event, 'cost', token, { httpOnly: true, secure: true });
	// OK.
	return { ok: true };
});

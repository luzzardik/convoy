// Imports
import { ConvoyStatus, prisma } from '@convoy/db';
import argon from 'argon2';
import xss from 'xss';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	// Get convoy
	const convoy = await prisma.convoy.findFirst({
		where: { OR: [{ id: getRouterParam(event, 'id') }, { accessCode: getRouterParam(event, 'id') }] },
	});
	if (!convoy) return replyWithError(event, 'convoy_not_found', 404);
	// Can join ?
	if (convoy.status !== ConvoyStatus.READY && convoy.status !== ConvoyStatus.ACTIVE) return replyWithError(event, 'convoy_unavailable', 409);
	// Read body
	const body = await readBody(event);
	if (!body) return replyWithError(event, 'bad_request', 400);
	// Username
	// TODO: deal with username duplicate?
	if (typeof body.username !== 'string') return replyWithError(event, 'username_required', 400);
	const username = xss(body.username).trim();
	if (username.length == 0) return replyWithError(event, 'username_required', 400);
	// Is user mode ?
	if (body.mode === 'user') {
		// Create token
		// TODO: maybe save the user actually
		const token = await createToken({
			aud: 'convoy:' + APP_DOMAIN,
			iss: 'convoy-app:' + APP_DOMAIN,
			exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
			sub: crypto.randomUUID(), // TODO: maybe fingerprint the browser ?
			mode: 'user',
			username,
			role: 'user',
			convoyId: convoy.id,
			joinedAt: Date.now(),
		});
		// Return token
		return { token };
	}
	// Unknown mode ?
	if (body.mode !== 'organizer') return replyWithError(event, 'invalid_mode', 400);
	// Confirm password
	const { organizerPassword, organizerRole } = body;
	if (!organizerPassword || !(await argon.verify(convoy.organizerPasswordHash, organizerPassword))) return replyWithError(event, 'invalid_credentials', 401);
	// Validate role
	if (!['regulator', 'head', 'opener', 'sweep'].includes(organizerRole)) return replyWithError(event, 'invalid_organizer_role', 400);
	// Create token
	// TODO: maybe save the user actually
	const token = await createToken({
		aud: 'convoy:' + APP_DOMAIN,
		iss: 'convoy-app:' + APP_DOMAIN,
		exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
		sub: crypto.randomUUID(), // TODO: maybe fingerprint the browser ?
		mode: 'organizer',
		username,
		role: organizerRole,
		convoyId: convoy.id,
		joinedAt: Date.now(),
	});
	// Return token
	return token;
});

// Imports
import { ConvoyPOI, ConvoyStatus, prisma } from '@convoy/db';
import xss from 'xss';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	// Validate session
	const isConnected = await verifyToken(getCookie(event, 'cast'), 'convoy-admin:' + APP_DOMAIN);
	if (!isConnected) return replyWithError(event, 'unauthenticated', 403);
	// Get convoy
	const convoy = await prisma.convoy.findFirst({
		where: { id: getRouterParam(event, 'id') },
		include: { segments: true },
	});
	if (!convoy) return replyWithError(event, 'convoy_not_found', 404);
	// Is valid new status ?
	const body = await readBody(event);
	if (!body || !(['ARCHIVED', 'DRAFT', 'READY'] as ConvoyStatus[]).includes(body.status as ConvoyStatus)) return replyWithError(event, 'bad_request', 400);
	// Update status
	await prisma.convoy.update({
		where: { id: convoy.id },
		data: { status: body.status },
	});
	// OK.
	return { ok: true };
});

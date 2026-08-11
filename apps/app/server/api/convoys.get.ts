// Imports
import { DTO, prisma } from '@convoy/db';
import parseInclusions from '../utils/parseInclusions';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	// Validate session
	const isConnected = await verifyToken(getCookie(event, 'cast'), 'convoy-admin:' + APP_DOMAIN);
	if (!isConnected) return replyWithError(event, 'unauthenticated', 403);
	// Get convoys
	const inclusions = parseInclusions(event);
	// TODO: introduce Pagination?
	const convoys = await prisma.convoy.findMany({
		include: {
			segments: inclusions.includes('segments') ? { include: { poi: inclusions.includes('segments.poi') } } : undefined,
		},
	});
	// OK.
	return convoys.map((c) => DTO.formatConvoy(c));
});

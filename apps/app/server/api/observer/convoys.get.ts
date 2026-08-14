// Imports
import { DTO, prisma } from '@convoy/db';
import parseInclusions from '~~/server/utils/parseInclusions';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	// Validate session
	const isConnected = await verifyToken(getCookie(event, 'cost'), 'convoy-observer:' + APP_DOMAIN);
	if (!isConnected) return replyWithError(event, 'unauthenticated', 403);
	// Get active convoys
	const inclusions = parseInclusions(event);
	const convoys = await prisma.convoy.findMany({
		where: {
			status: { in: ['READY', 'ACTIVE'] as any },
		},
		include: {
			segments: inclusions.includes('segments') ? { include: { poi: inclusions.includes('segments.poi') } } : undefined,
		},
		orderBy: [{ status: 'desc' }, { name: 'asc' }],
	});
	// OK.
	return convoys.map((c) => DTO.formatConvoy(c));
});

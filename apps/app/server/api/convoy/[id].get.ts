// Imports
import { DTO, prisma } from '@convoy/db';
import parseInclusions from '~~/server/utils/parseInclusions';
import replyWithError from '~~/server/utils/replyWithError';

// Event handler
export default defineEventHandler(async (event) => {
	// Check request
	const requestedId = getRouterParam(event, 'id');
	if (!requestedId) return replyWithError(event, 'bad_request', 400);
	// Handle inclusions
	const inclusions = parseInclusions(event);
	// Fetch convoy by code or ID
	const convoy = await prisma.convoy.findFirst({
		where: { OR: [{ id: requestedId }, { accessCode: requestedId }] },
		include: {
			segments: inclusions.includes('segments') ? { include: { poi: inclusions.includes('segments.poi') } } : undefined,
		},
	});
	if (!convoy) return replyWithError(event, 'convoy_not_found', 404);
	// OK.
	return DTO.formatConvoy(convoy);
});

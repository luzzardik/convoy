// Imports
import { ConvoyPOI, prisma } from '@convoy/db';
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
	// Get update map
	const updateMap = await readBody(event);
	if (!updateMap) return replyWithError(event, 'bad_request', 400);
	// Deletions
	if (Array.isArray(updateMap.delete)) {
		const deleteKeys = updateMap.delete.filter((f) => typeof f == 'string');
		await prisma.convoySegment.deleteMany({
			where: { convoyId: convoy.id, id: { in: deleteKeys } },
		});
	}
	// Names and orders updates
	if (Array.isArray(updateMap.update)) {
		let runningUpdates = [];
		for (let update of updateMap.update) {
			if (!update.id || (!update.name && !update.order)) continue;
			runningUpdates.push(
				prisma.convoySegment.update({
					where: { id: update.id, convoyId: convoy.id },
					data: {
						name: typeof update.name == 'string' ? xss(update.name) : undefined,
						order: typeof update.order == 'number' ? update.order : undefined,
					},
				})
			);
		}
		await Promise.all(runningUpdates);
	}
	// Fix order
	const segments = await prisma.convoySegment.findMany({ where: { convoyId: convoy.id }, orderBy: { order: 'asc' } });
	await prisma.$transaction(
		segments.map((segment, index) =>
			prisma.convoySegment.update({
				where: { id: segment.id },
				data: {
					order: index,
				},
			})
		)
	);
	// OK.
	return { ok: true };
});

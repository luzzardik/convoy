// Imports
import { DTO, prisma } from '@convoy/db';
import { CreateConvoyBody } from '~~/shared/validation';
import validateBody from '../utils/validateBody';
import randomId from '../utils/randomId';
import xss from 'xss';
import argon2 from 'argon2';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	// Validate session
	const isConnected = await verifyToken(getCookie(event, 'cast'), 'convoy-admin:' + APP_DOMAIN);
	if (!isConnected) return replyWithError(event, 'unauthenticated', 403);
	// Validate body
	const unparsedBody = await readBody(event);
	const validationResult = validateBody(CreateConvoyBody, unparsedBody, false);
	if (validationResult) return replyWithError(event, validationResult, 400);
	const body = CreateConvoyBody.parse(unparsedBody);
	// Check or generate access code
	const accessCode = (body.accessCode ?? randomId(8)).toUpperCase();
	const accessCodeConflict = await prisma.convoy.findFirst({
		where: { accessCode },
	});
	if (accessCodeConflict) return replyWithError(event, 'access_code_in_use', 409);
	// Create convoy
	const convoy = await prisma.convoy.create({
		data: {
			accessCode,
			name: xss(body.name),
			organizerPasswordHash: await argon2.hash(body.organizerPassword),
		},
	});
	// OK.
	return DTO.formatConvoy(convoy);
});

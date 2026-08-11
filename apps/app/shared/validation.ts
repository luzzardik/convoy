// Imports
import z from 'zod/v4';

// CreateConvoyBody
export const CreateConvoyBody = z.object(
	{
		name: z.string('invalid_name').nonempty('invalid_name').trim(),
		accessCode: z.string('invalid_access_code').min(6, 'access_code_too_short').max(8, 'access_code_too_long').trim().optional(),
		organizerPassword: z.string('invalid_organizer_password').nonempty('invalid_organizer_password'),
	},
	'bad_request'
);

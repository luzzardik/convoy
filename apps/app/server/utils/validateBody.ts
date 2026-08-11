// Imports
import { ZodType, ZodError } from 'zod/v4';

// Validate raw body
export default function validateBody(schema: ZodType<any>, data: any, includePath: boolean) {
	try {
		schema.parse(data);
		return null;
	} catch (err) {
		if (err instanceof ZodError) {
			const errors = err.issues.map((e) => (includePath ? e.path.join('.') + ':' : '') + e.message);
			return errors;
		}
		return 'unexpected_issue';
	}
}

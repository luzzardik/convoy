import { ZodError } from 'zod/v4';

export default function useZod(schema: any) {
	return (data: any) => {
		try {
			schema.parse(data);
			return [];
		} catch (err) {
			if (err instanceof ZodError) {
				const errors = err.issues.map((e) => e.path.join('.') + ':' + e.message);
				return errors;
			}
			return ['unexpected_issue'];
		}
	};
}

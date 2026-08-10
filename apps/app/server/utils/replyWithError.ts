// Status text map
export const StatusTextMap: Record<number, string> = {
	200: 'OK',
	404: 'Not Found',
	403: 'Forbidden',
	401: 'Unauthorized',
};

// Reply with errors
export default function replyWithError(event: any, errors: string[] | string, statusCode: number, statusText: string | null = null) {
	setResponseStatus(event, statusCode, statusText ?? StatusTextMap[statusCode]);
	return Array.isArray(errors) ? { errors } : { error: errors };
}

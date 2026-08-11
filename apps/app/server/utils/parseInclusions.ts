export default function parseInclusions(event: any) {
	const query = getQuery(event).include;
	if (!query) return [];
	return Array.isArray(query) ? query.filter((q) => typeof q == 'string') : typeof query == 'string' ? query.split(',') : [];
}

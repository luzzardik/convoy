export default function formatDistance(meters: number, locale = 'fr-FR'): string {
	const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: meters < 1000 ? 0 : 1 });
	return meters < 1000 ? `${formatter.format(meters)} m` : `${formatter.format(meters / 1000)} km`;
}

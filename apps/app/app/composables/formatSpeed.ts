export default function formatSpeed(speedKmh: number, locale = 'fr-FR'): string {
	return `${new Intl.NumberFormat(locale, {
		maximumFractionDigits: 1,
	}).format(speedKmh)} km/h`;
}

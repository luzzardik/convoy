export default function formatDuration(minutes: number, locale = 'fr-FR'): string {
	const totalMinutes = Math.round(minutes);

	if (totalMinutes < 60) {
		return `${totalMinutes.toLocaleString(locale)} min`;
	}

	const hours = Math.floor(totalMinutes / 60);
	const remainingMinutes = totalMinutes % 60;

	if (remainingMinutes === 0) {
		return `${hours.toLocaleString(locale)} h`;
	}

	return `${hours.toLocaleString(locale)} h ${remainingMinutes.toLocaleString(locale)} min`;
}

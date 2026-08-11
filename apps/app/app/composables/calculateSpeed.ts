export default function calculateSpeed(distanceInMeters: number, durationInMinutes: number): number {
	if (durationInMinutes <= 0) {
		return 0;
	}

	// m/min → km/h
	return (distanceInMeters / durationInMinutes) * 0.06;
}

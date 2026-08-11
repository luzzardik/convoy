import maplibregl from 'maplibre-gl';
import type { Convoy, ConvoySegment } from '@convoy/db';

export default function centerOnConvoy(convoy: Convoy & { segments: ConvoySegment[] }) {
	if (!convoy?.segments.length) return;
	const bounds = new maplibregl.LngLatBounds();
	for (const segment of convoy.segments) {
		if (!segment || !segment.geometry) continue;
		const geometry = segment.geometry as { type: string; coordinates: [number, number][] };
		if (geometry.type !== 'LineString') continue;
		for (const coordinate of geometry.coordinates) bounds.extend(coordinate);
	}
	if (bounds.isEmpty()) return;
	const map = useMglMap().map;
	if (!map) return;
	map.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 14 });
}

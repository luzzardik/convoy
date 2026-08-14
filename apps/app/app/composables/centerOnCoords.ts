import maplibregl from 'maplibre-gl';
import type { Convoy, ConvoySegment } from '@convoy/db';

export default function centerOnCoords(coords: [number, number]) {
	if (!import.meta.client) return;
	if (!coords || !Array.isArray(coords) || coords.length != 2) return;
	const bounds = new maplibregl.LngLatBounds();
	bounds.extend(coords);
	if (bounds.isEmpty()) return;
	const map = useMglMap().map;
	if (!map) return;
	map.fitBounds(bounds, { padding: 120, duration: 800, maxZoom: 14 });
}

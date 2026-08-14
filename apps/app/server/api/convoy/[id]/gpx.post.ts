// Imports
import { ConvoyPOI, prisma } from '@convoy/db';
import { XMLParser } from 'fast-xml-parser';

// APP_DOMAIN
const { APP_DOMAIN } = process.env;

// asArray
const asArray = <T>(val: T | T[] | undefined): T[] => {
	if (!val) return [];
	return Array.isArray(val) ? val : [val];
};

// GpxPoint
interface GpxPoint {
	'@_lat': string;
	'@_lon': string;
	name?: string;
}

// ParsedGpxSegment
interface ParsedGpxSegment {
	order: number;
	name: string;
	geometry: GeoJSON.LineString;
	lengthMeters: number;
	durationMin: number;
	poi: Partial<ConvoyPOI>;
}

// parsePoints
const parsePoints = (pts: GpxPoint | GpxPoint[] | undefined): Array<{ lat: number; lon: number; name?: string }> => {
	return asArray(pts).map((pt) => ({
		lat: parseFloat(pt['@_lat']),
		lon: parseFloat(pt['@_lon']),
		name: pt.name,
	}));
};

// estimateDutaionMin
export const estimateDurationMin = (lengthM: number, speedKmh = 50): number => (lengthM / 1000 / speedKmh) * 60;

// toRad
const toRad = (deg: number): number => (deg * Math.PI) / 180;

// haversineDistance
export const haversineDistance = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number => {
	const R = 6371000;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// polylineLengthMeters
export const polylineLengthMeters = (coords: [number, number][]): number => {
	let total = 0;
	for (let i = 0; i < coords.length - 1; i++) {
		total += haversineDistance(coords[i]!, coords[i + 1]!);
	}
	return total;
};

// Handle event
export default defineEventHandler(async (event) => {
	// Validate session
	const isConnected = await verifyToken(getCookie(event, 'cast'), 'convoy-admin:' + APP_DOMAIN);
	if (!isConnected) return replyWithError(event, 'unauthenticated', 403);
	// Get convoy
	const convoy = await prisma.convoy.findFirst({
		where: { id: getRouterParam(event, 'id') },
		include: { segments: true },
	});
	if (!convoy) return replyWithError(event, 'convoy_not_found', 404);
	// Handle form data
	const form = await readMultipartFormData(event);
	if (!form) return replyWithError(event, 'invalid_request', 400);
	// Get file
	const file = form.find((part) => part.name == 'file');
	if (!file?.data) return replyWithError(event, 'file_missing', 400);
	// Basic size limit
	if (file.data.length > 10 * 1024 * 1024) return replyWithError(event, 'file_too_large', 413);
	// Setup parsing XML
	const xml = file.data.toString('utf8');
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
	});
	// Parse GPX
	let gpx: any;
	try {
		gpx = parser.parse(xml);
	} catch (e) {
		return replyWithError(event, 'unparsable_gpx', 400);
	}
	// Make sure this is actually GPX
	if (!gpx.gpx) return replyWithError(event, 'unparsable_gpx', 400);
	// Check GPX namespace
	const root = gpx.gpx;
	const namespace = root['@_xmlns'];
	if (namespace && namespace !== 'http://www.topografix.com/GPX/1/0' && namespace !== 'http://www.topografix.com/GPX/1/1') return replyWithError(event, 'unparsable_gpx', 400);
	// Parse segments
	const tracks = asArray(root.trk);
	const segments: ParsedGpxSegment[] = [];
	let order = 0;
	for (const trk of tracks) {
		const trksegs = asArray(trk.trkseg);
		for (const seg of trksegs) {
			const points = parsePoints(seg.trkpt);
			if (points.length < 2) continue;
			const coords = points.map((p) => [p.lon, p.lat] as [number, number]);
			const last = points[points.length - 1]!;
			const lengthMeters = polylineLengthMeters(coords);
			const segIndex = order + 1;
			const poiLabel = last.name ?? `POI ${segIndex}`;
			segments.push({
				order: order++,
				name: trk.name ?? poiLabel,
				geometry: { type: 'LineString', coordinates: coords },
				lengthMeters,
				durationMin: estimateDurationMin(lengthMeters),
				poi: {
					lat: last.lat,
					lon: last.lon,
					label: trk.name ?? poiLabel,
				},
			});
		}
	}
	// Parse routes
	const routes = asArray(root.rte);
	for (const rte of routes) {
		const points = parsePoints(rte.rtept);
		if (points.length < 2) continue;
		const coords = points.map((p) => [p.lon, p.lat] as [number, number]);
		const last = points[points.length - 1]!;
		const lengthMeters = polylineLengthMeters(coords);
		const segIndex = order + 1;
		const poiLabel = last.name ?? rte.name ?? `POI ${segIndex}`;
		segments.push({
			order: order++,
			name: rte.name ?? poiLabel,
			geometry: { type: 'LineString', coordinates: coords },
			lengthMeters,
			durationMin: estimateDurationMin(lengthMeters),
			poi: {
				lat: last.lat,
				lon: last.lon,
				label: poiLabel,
			},
		});
	}
	// Replace mode
	const behavior = form.find((f) => f.name == 'behavior') ?? ('replace' as 'append' | 'replace');
	const shouldAppend = behavior == 'append';
	if (!shouldAppend) await prisma.convoySegment.deleteMany({ where: { convoyId: convoy.id } });
	// Create database segments
	const startOrder = shouldAppend ? convoy.segments.reduce((max, s) => Math.max(max, s.order), -1) + 1 : 0;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i]!;
		const globalPoiIndex = startOrder + i + 1;
		const poiLabel = /^POI \d+$/.test(seg.poi.label!) ? `POI ${globalPoiIndex}` : seg.poi.label!;
		await prisma.convoySegment.create({
			data: {
				convoyId: convoy.id,
				order: startOrder + i,
				name: seg.name,
				geometry: seg.geometry as object,
				lengthInMeters: seg.lengthMeters,
				durationInMinutes: seg.durationMin,
				poi: {
					create: {
						lat: seg.poi.lat!,
						lon: seg.poi.lon!,
						label: poiLabel,
					},
				},
			},
		});
	}
	// OK.
	return { ok: true };
});

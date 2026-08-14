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

// FIXME: there's a bug where the starting point is duplicated somehow

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
			const trkName = trk.name;
			// find indices of points that are POIs (have a name)
			const poiIdxs = points.map((p, i) => (p.name ? i : -1)).filter((i) => i >= 0);
			if (poiIdxs.length === 0) {
				// fallback: use last point as POI (original behavior)
				const coords = points.map((p) => [p.lon, p.lat] as [number, number]);
				const last = points[points.length - 1]!;
				const lengthMeters = polylineLengthMeters(coords);
				const segIndex = order + 1;
				const poiLabel = last.name ?? `POI ${segIndex}`;
				segments.push({
					order: order++,
					name: trkName ?? poiLabel,
					geometry: { type: 'LineString', coordinates: coords },
					lengthMeters,
					durationMin: estimateDurationMin(lengthMeters),
					poi: {
						lat: last.lat,
						lon: last.lon,
						label: trkName ?? poiLabel,
					},
				});
			} else {
				// explode into sub-segments that end at each POI
				let prev = 0;
				for (const idx of poiIdxs) {
					let start = prev;
					let end = idx;
					// ensure at least two points in the subsegment
					if (end - start < 1) {
						if (idx + 1 < points.length) end = idx + 1;
						else if (start - 1 >= 0) start = start - 1;
						else {
							prev = idx + 1;
							continue;
						}
					}
					const slice = points.slice(start, end + 1);
					if (slice.length < 2) {
						prev = idx + 1;
						continue;
					}
					const coords = slice.map((p) => [p.lon, p.lat] as [number, number]);
					const poi = points[idx]!;
					const lengthMeters = polylineLengthMeters(coords);
					const segIndex = order + 1;
					const poiLabel = poi.name ?? trkName ?? `POI ${segIndex}`;
					segments.push({
						order: order++,
						name: trkName ?? poiLabel,
						geometry: { type: 'LineString', coordinates: coords },
						lengthMeters,
						durationMin: estimateDurationMin(lengthMeters),
						poi: {
							lat: poi.lat,
							lon: poi.lon,
							label: poiLabel,
						},
					});
					prev = idx + 1;
				}
				// if there are trailing points after last POI, create a final segment ending at last point
				if (prev < points.length - 1) {
					const slice = points.slice(prev);
					if (slice.length >= 2) {
						const coords = slice.map((p) => [p.lon, p.lat] as [number, number]);
						const last = points[points.length - 1]!;
						const lengthMeters = polylineLengthMeters(coords);
						const segIndex = order + 1;
						const poiLabel = last.name ?? trkName ?? `POI ${segIndex}`;
						segments.push({
							order: order++,
							name: trkName ?? poiLabel,
							geometry: { type: 'LineString', coordinates: coords },
							lengthMeters,
							durationMin: estimateDurationMin(lengthMeters),
							poi: {
								lat: last.lat,
								lon: last.lon,
								label: trkName ?? poiLabel,
							},
						});
					}
				}
			}
		}
	}
	// Parse routes
	const routes = asArray(root.rte);
	for (const rte of routes) {
		const points = parsePoints(rte.rtept);
		if (points.length < 2) continue;
		const rteName = rte.name;
		const poiIdxs = points.map((p, i) => (p.name ? i : -1)).filter((i) => i >= 0);
		if (poiIdxs.length === 0) {
			const coords = points.map((p) => [p.lon, p.lat] as [number, number]);
			const last = points[points.length - 1]!;
			const lengthMeters = polylineLengthMeters(coords);
			const segIndex = order + 1;
			const poiLabel = last.name ?? rteName ?? `POI ${segIndex}`;
			segments.push({
				order: order++,
				name: rteName ?? poiLabel,
				geometry: { type: 'LineString', coordinates: coords },
				lengthMeters,
				durationMin: estimateDurationMin(lengthMeters),
				poi: {
					lat: last.lat,
					lon: last.lon,
					label: poiLabel,
				},
			});
		} else {
			let prev = 0;
			for (const idx of poiIdxs) {
				let start = prev;
				let end = idx;
				if (end - start < 1) {
					if (idx + 1 < points.length) end = idx + 1;
					else if (start - 1 >= 0) start = start - 1;
					else {
						prev = idx + 1;
						continue;
					}
				}
				const slice = points.slice(start, end + 1);
				if (slice.length < 2) {
					prev = idx + 1;
					continue;
				}
				const coords = slice.map((p) => [p.lon, p.lat] as [number, number]);
				const poi = points[idx]!;
				const lengthMeters = polylineLengthMeters(coords);
				const segIndex = order + 1;
				const poiLabel = poi.name ?? rteName ?? `POI ${segIndex}`;
				segments.push({
					order: order++,
					name: rteName ?? poiLabel,
					geometry: { type: 'LineString', coordinates: coords },
					lengthMeters,
					durationMin: estimateDurationMin(lengthMeters),
					poi: {
						lat: poi.lat,
						lon: poi.lon,
						label: poiLabel,
					},
				});
				prev = idx + 1;
			}
			if (prev < points.length - 1) {
				const slice = points.slice(prev);
				if (slice.length >= 2) {
					const coords = slice.map((p) => [p.lon, p.lat] as [number, number]);
					const last = points[points.length - 1]!;
					const lengthMeters = polylineLengthMeters(coords);
					const segIndex = order + 1;
					const poiLabel = last.name ?? rteName ?? `POI ${segIndex}`;
					segments.push({
						order: order++,
						name: rteName ?? poiLabel,
						geometry: { type: 'LineString', coordinates: coords },
						lengthMeters,
						durationMin: estimateDurationMin(lengthMeters),
						poi: {
							lat: last.lat,
							lon: last.lon,
							label: rteName ?? poiLabel,
						},
					});
				}
			}
		}
	}
	// Parse waypoints (wpt) and attach to segments if close enough
	const rawWpts = asArray(root.wpt);
	const waypoints = rawWpts.map((w) => ({ lat: parseFloat(w['@_lat']), lon: parseFloat(w['@_lon']), name: w.name }));
	const WAYPOINT_MARGIN_METERS = process.env.WAYPOINT_MARGIN_METERS ? parseFloat(process.env.WAYPOINT_MARGIN_METERS) : 15;

	// helper: convert lon/lat to local planar meters using equirectangular approx
	const toXY = (lon: number, lat: number, refLat: number) => {
		const x = ((lon * Math.PI) / 180) * 6371000 * Math.cos((refLat * Math.PI) / 180);
		const y = ((lat * Math.PI) / 180) * 6371000;
		return { x, y };
	};

	// project point onto segment and compute distance and along-distance
	const projectOnSegment = (p: { lat: number; lon: number }, a: [number, number], b: [number, number], refLat: number) => {
		const pa = toXY(a[0], a[1], refLat);
		const pb = toXY(b[0], b[1], refLat);
		const pp = toXY(p.lon, p.lat, refLat);
		const vx = pb.x - pa.x;
		const vy = pb.y - pa.y;
		const wx = pp.x - pa.x;
		const wy = pp.y - pa.y;
		const vv = vx * vx + vy * vy;
		let t = vv === 0 ? 0 : (vx * wx + vy * wy) / vv;
		if (t < 0) t = 0;
		if (t > 1) t = 1;
		const cx = pa.x + t * vx;
		const cy = pa.y + t * vy;
		const dx = pp.x - cx;
		const dy = pp.y - cy;
		const dist = Math.sqrt(dx * dx + dy * dy);
		// convert cx,cy back to lon/lat approximately
		const lat = (cy / 6371000) * (180 / Math.PI);
		const lon = (cx / (6371000 * Math.cos((refLat * Math.PI) / 180))) * (180 / Math.PI);
		return { t, dist, proj: [lon, lat] as [number, number] };
	};

	// compute cumulative distances along coords
	const cumulative = (coords: [number, number][]) => {
		const cum: number[] = [0];
		for (let i = 0; i < coords.length - 1; i++) cum.push(cum[i] + haversineDistance(coords[i], coords[i + 1]));
		return cum;
	};

	// assign waypoints to nearest segment if within margin
	const assigned: Map<number, Array<{ wpt: { lat: number; lon: number; name?: string }; along: number; proj: [number, number]; dist: number }>> = new Map();
	for (const w of waypoints) {
		if (!w) continue;
		let best: { segIdx: number; dist: number; along: number; proj: [number, number] } | null = null;
		for (let s = 0; s < segments.length; s++) {
			const seg = segments[s]!;
			const coords = seg.geometry.coordinates as [number, number][];
			if (!coords || coords.length < 2) continue;
			const refLat = coords.reduce((acc, c) => acc + c[1], 0) / coords.length;
			const cum = cumulative(coords);
			for (let i = 0; i < coords.length - 1; i++) {
				const res = projectOnSegment(w, coords[i]!, coords[i + 1]!, refLat);
				const segLen = cum[i + 1] - cum[i];
				const along = cum[i] + res.t * segLen;
				if (best == null || res.dist < best.dist) {
					best = { segIdx: s, dist: res.dist, along, proj: res.proj };
				}
			}
		}
		if (best && best.dist <= WAYPOINT_MARGIN_METERS) {
			if (!assigned.has(best.segIdx)) assigned.set(best.segIdx, []);
			assigned.get(best.segIdx)!.push({ wpt: w, along: best.along, proj: best.proj, dist: best.dist });
		}
	}

	// rebuild segments, splitting those that have assigned waypoints
	const newSegments: ParsedGpxSegment[] = [];
	for (let s = 0; s < segments.length; s++) {
		const seg = segments[s]!;
		const coords = seg.geometry.coordinates as [number, number][];
		const assignedForSeg = assigned.get(s) ?? [];
		if (assignedForSeg.length === 0) {
			newSegments.push(seg);
			continue;
		}
		// sort by along distance
		assignedForSeg.sort((a, b) => a.along - b.along);
		// build slices
		const cum = cumulative(coords);
		let cursor = 0; // index in coords
		let current: [number, number][] = [coords[0]!];
		for (const item of assignedForSeg) {
			// find k where cum[k] <= along <= cum[k+1]
			let k = 0;
			while (k < cum.length - 1 && !(cum[k] <= item.along && item.along <= cum[k + 1])) k++;
			// append coords up to k
			for (let i = Math.max(cursor + 1, 1); i <= k; i++) current.push(coords[i]!);
			// append projection point
			current.push(item.proj);
			// push segment ending at waypoint
			const lengthMeters = polylineLengthMeters(current);
			newSegments.push({
				order: 0, // will be re-assigned later
				name: item.wpt.name ?? seg.name,
				geometry: { type: 'LineString', coordinates: current },
				lengthMeters,
				durationMin: estimateDurationMin(lengthMeters),
				poi: { lat: item.wpt.lat, lon: item.wpt.lon, label: item.wpt.name ?? seg.name },
			});
			// reset current to start at projection
			current = [item.proj];
			cursor = k;
		}
		// trailing piece
		for (let i = Math.max(cursor + 1, 1); i < coords.length; i++) current.push(coords[i]!);
		if (current.length >= 2) {
			const lengthMeters = polylineLengthMeters(current);
			newSegments.push({
				order: 0,
				name: seg.name,
				geometry: { type: 'LineString', coordinates: current },
				lengthMeters,
				durationMin: estimateDurationMin(lengthMeters),
				poi: seg.poi, // keep original poi for trailing
			});
		}
	}
	// replace segments with newSegments and reassign order
	segments.length = 0;
	for (let i = 0; i < newSegments.length; i++) {
		segments.push({ ...newSegments[i]!, order: i });
	}
	// If there is a waypoint (wpt) close to a segment's POI, prefer the waypoint (use its coordinates and name)
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i]!;
		if (!seg.poi || seg.poi.lat == null || seg.poi.lon == null) continue;
		let nearest: { wpt: { lat: number; lon: number; name?: string }; dist: number } | null = null;
		for (const w of waypoints) {
			const d = haversineDistance([seg.poi.lon!, seg.poi.lat!], [w.lon, w.lat]);
			if (nearest == null || d < nearest.dist) nearest = { wpt: w, dist: d };
		}
		if (nearest && nearest.dist <= WAYPOINT_MARGIN_METERS) {
			seg.name = nearest.wpt.name ?? seg.name;
			seg.poi = { lat: nearest.wpt.lat, lon: nearest.wpt.lon, label: nearest.wpt.name ?? seg.poi.label };
		}
	}

	// Replace mode
	const behavior = form.find((f) => f.name == 'behavior') ?? ('replace' as 'append' | 'replace');
	const shouldAppend = behavior == 'append';
	if (!shouldAppend) await prisma.convoySegment.deleteMany({ where: { convoyId: convoy.id } });
	// Create database segments
	// Normalize existing convoy segment orders to ensure 0-indexing when appending.
	let startOrder = 0;
	if (shouldAppend) {
		if (!convoy.segments || convoy.segments.length === 0) {
			startOrder = 0;
		} else {
			const orders = convoy.segments.map((s) => (s.order == null ? 0 : s.order));
			const minOrder = Math.min(...orders);
			const maxOrder = Math.max(...orders);
			// If existing orders are 1-based (minOrder > 0), shift new start back so new segments continue 0-based numbering.
			const offset = minOrder > 0 ? minOrder : 0;
			startOrder = maxOrder + 1 - offset;
		}
	} else {
		startOrder = 0;
	}
	let nextPoiNumber = startOrder + 1;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i]!;
		// Decide final POI label: renumber only autogenerated POI labels, keep custom names but don't consume numbers.
		let finalPoiLabel: string;
		if (!seg.poi || !seg.poi.label) {
			finalPoiLabel = `POI ${nextPoiNumber++}`;
		} else if (/^POI \d+$/.test(seg.poi.label)) {
			finalPoiLabel = `POI ${nextPoiNumber++}`;
		} else {
			finalPoiLabel = seg.poi.label!;
		}
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
						label: finalPoiLabel,
					},
				},
			},
		});
	}
	// OK.
	return { ok: true };
});

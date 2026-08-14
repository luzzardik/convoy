import { ref, computed, watch, onMounted, onBeforeUnmount, type Ref } from 'vue';

// Import project types if available (prisma client types)
import type { Convoy, ConvoySegment } from '@convoy/db';

// Constants (kept similar to the original implementation)
const OFF_ROUTE_THRESHOLD_M = 50;
const POINT_REACHED_THRESHOLD_M = 20;
const RECALC_COOLDOWN_MS = 10_000;
const STEP_PASSED_THRESHOLD_M = 15;
const DEFAULT_SPEED_KMH = 50;

// Basic haversine distance (meters)
const toRad = (deg: number) => (deg * Math.PI) / 180;
export const haversineDistance = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number => {
	const R = 6371000;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Find nearest point on polyline (array of [lon, lat]) — returns distance (m) and nearest point
export const nearestPointOnPolyline = (pt: [number, number], poly: [number, number][]) => {
	let bestDist = Infinity;
	let bestPoint: [number, number] | null = null;

	for (let i = 0; i < poly.length - 1; i++) {
		const A = poly[i] as [number, number];
		const B = poly[i + 1] as [number, number];
		// project pt onto AB in simple lon/lat space (approximation)
		const vx = B[0] - A[0];
		const vy = B[1] - A[1];
		const wx = pt[0] - A[0];
		const wy = pt[1] - A[1];
		const len2 = vx * vx + vy * vy;
		const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
		const proj: [number, number] = [A[0] + t * vx, A[1] + t * vy];
		const d = haversineDistance(pt, proj);
		if (d < bestDist) {
			bestDist = d;
			bestPoint = proj;
		}
	}

	return { point: bestPoint ?? poly[0], distance: bestDist };
};

// Minimal NavStep type to mirror OSRM step
export type NavStep = {
	location: [number, number]; // [lon, lat]
	type: string;
	modifier?: string;
	name: string;
	distance: number; // meters
};

async function fetchRouteSteps(points: [[number, number], [number, number]], osrmUrl: string): Promise<NavStep[]> {
	// points: [user, dest]
	const [a, b] = points;
	const url = `${osrmUrl.replace(/\/$/, '')}/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false&geometries=geojson&steps=true`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`OSRM error ${res.status}`);
	const json = await res.json();
	const steps: NavStep[] = [];
	const routes = json.routes ?? [];
	if (!routes.length) return steps;
	for (const leg of routes[0].legs ?? []) {
		for (const s of leg.steps ?? []) {
			const m = (s.maneuver ?? s.maneuver) || {};
			steps.push({
				location: (m.location as [number, number]) ?? (s.location as [number, number]) ?? a,
				type: m.type ?? s.type ?? 'continue',
				modifier: m.modifier,
				name: s.name ?? '',
				distance: s.distance ?? 0,
			});
		}
	}
	return steps;
}

async function fetchRouteWithSteps(points: [[number, number], [number, number]], osrmUrl: string): Promise<{ geoJSON: any; steps: NavStep[] }> {
	const [a, b] = points;
	const url = `${osrmUrl.replace(/\/$/, '')}/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson&steps=true`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`OSRM error ${res.status}`);
	const json = await res.json();
	const geoJSON = json.routes?.[0]?.geometry ?? null;
	const steps = await fetchRouteSteps(points, osrmUrl);
	return { geoJSON, steps };
}

export type UseRouteNavigationOptions = {
	osrmUrl: string;
	onOffRoute?: (distance: number) => void;
	onOsrmError?: (message: string) => void;
};

export function useRouteNav(routeRef: Ref<(Convoy & { segments: ConvoySegment[] }) | null>, userLocationRef: Ref<[number, number] | null>, options: UseRouteNavigationOptions) {
	const { osrmUrl, onOffRoute, onOsrmError } = options;

	const lastRecalc = ref(0);
	const lastNextPointId = ref<string | null>(null);
	const lastNavFetchKey = ref<string | null>(null);
	const mounted = ref(true);
	const visitedPointIdsRef = ref(new Set<string>());
	const passedStepIndicesRef = ref(new Set<number>());
	const recalcPassedStepIndicesRef = ref(new Set<number>());
	const wasOffRouteRef = ref(false);

	onMounted(() => {
		mounted.value = true;
	});
	onBeforeUnmount(() => {
		mounted.value = false;
	});

	const visitedPointIds = ref(new Set<string>());
	const recalcGeoJSON = ref<any | null>(null);
	const recalcNavSteps = ref<NavStep[]>([]);
	const recalcPassedStepIndices = ref(new Set<number>());
	const validatedPoint = ref<any | null>(null);
	const navSteps = ref<NavStep[]>([]);
	const passedStepIndices = ref(new Set<number>());
	const offRouteDistance = ref<number | null>(null);
	const osrmError = ref<string | null>(null);
	const osrmLoading = ref(false);

	watch(
		() => routeRef.value?.id,
		() => {
			// reset state when route changes
			visitedPointIdsRef.value = new Set();
			passedStepIndicesRef.value = new Set();
			recalcPassedStepIndicesRef.value = new Set();
			wasOffRouteRef.value = false;
			lastNavFetchKey.value = null;

			visitedPointIds.value = new Set();
			recalcGeoJSON.value = null;
			recalcNavSteps.value = [];
			recalcPassedStepIndices.value = new Set();
			validatedPoint.value = null;
			navSteps.value = [];
			passedStepIndices.value = new Set();
			offRouteDistance.value = null;
			osrmError.value = null;
			osrmLoading.value = false;
			lastRecalc.value = 0;
			lastNextPointId.value = null;
		}
	);

	const sortedPoints = computed(() => {
		// Build points from segments: assume each segment may have a POI with lat/lon stored under segment.poi
		const route = routeRef.value;
		if (!route) return [] as any[];
		const points: { id: string; order: number; latitude: number; longitude: number; label?: string }[] = [];
		// if route has explicit points, prefer them
		// @ts-ignore
		if ((route as any).points?.length) {
			// @ts-ignore
			return [...(route as any).points].sort((a: any, b: any) => a.order - b.order);
		}

		// otherwise, use segments' POI (if present)
		for (const seg of [...route.segments].sort((a, b) => a.order - b.order)) {
			// segment POI may be under seg.poi with lat/lon
			// @ts-ignore
			const poi = (seg as any).poi;
			if (poi && typeof poi.lat === 'number' && typeof poi.lon === 'number') {
				points.push({ id: (poi as any).id ?? `${seg.id}-poi`, order: seg.order, latitude: poi.lat, longitude: poi.lon, label: poi.label ?? seg.name ?? `POI ${seg.order + 1}` });
			}
		}
		return points;
	});

	const nextPoint = computed(() => {
		const pts = sortedPoints.value;
		const set = visitedPointIds.value;
		return pts.find((p) => !set.has(p.id)) ?? null;
	});

	const nextPointLabel = computed(() => {
		const np = nextPoint.value;
		if (!np) return null;
		const idx = sortedPoints.value.findIndex((p: any) => p.id === np.id);
		return (np.label?.trim && np.label.trim()) || `POI ${idx + 1}`;
	});

	const routeGeoJSON = computed(() => {
		const apiRoute = routeRef.value;
		if (!apiRoute?.segments?.length) return null;
		const features: any[] = [];
		for (const seg of [...apiRoute.segments].sort((a, b) => a.order - b.order)) {
			// expect seg.geometry to be GeoJSON or seg.gpsCoordinates
			// @ts-ignore
			const coords: [number, number][] = (seg.geometry?.coordinates as any) ?? seg.gpsCoordinates?.map((c: any) => [c.lon, c.lat]) ?? [];
			if (coords.length >= 2) {
				features.push({ type: 'Feature', properties: { segmentId: seg.id }, geometry: { type: 'LineString', coordinates: coords } });
			}
		}
		if (!features.length) return null;
		return { type: 'FeatureCollection', features };
	});

	const routePolyline = computed(() => (routeGeoJSON.value?.features.flatMap((f: any) => f.geometry.coordinates) ?? []) as [number, number][]);

	const distanceToNextM = computed(() => {
		const user = userLocationRef.value;
		const np = nextPoint.value;
		if (!user || !np) return null;
		return haversineDistance(user, [np.longitude, np.latitude]);
	});

	const estimatedMinutesRemaining = computed(() => {
		const apiRoute = routeRef.value;
		const np = nextPoint.value;
		if (!apiRoute?.segments?.length || !np) return null;
		const nextIdx = sortedPoints.value.findIndex((p: any) => p.id === np.id);
		const remainingIds = new Set(sortedPoints.value.slice(nextIdx).map((p: any) => p.id));
		const total = apiRoute.segments.filter((seg) => remainingIds.has((seg as any).startPointId ?? `${seg.id}-poi`)).reduce((sum, seg) => sum + ((seg as any).durationInMinutes ?? (seg as any).duration ?? 0), 0);
		return total || null;
	});

	const totalRemainingM = computed(() => {
		const apiRoute = routeRef.value;
		const np = nextPoint.value;
		if (!apiRoute?.segments?.length || !np) return null;
		const nextIdx = sortedPoints.value.findIndex((p: any) => p.id === np.id);
		const remainingIds = new Set(sortedPoints.value.slice(nextIdx).map((p: any) => p.id));
		const totalM = apiRoute.segments.filter((seg) => remainingIds.has((seg as any).startPointId ?? `${seg.id}-poi`)).reduce((sum, seg) => sum + ((seg as any).lengthInMeters ?? (seg as any).lengthM ?? 0), 0);
		return totalM;
	});

	const isOffRoute = computed(() => offRouteDistance.value != null);

	const currentInstruction = computed(() => {
		const user = userLocationRef.value;
		if (!user) return null;
		const steps = isOffRoute.value && recalcNavSteps.value.length ? recalcNavSteps.value : navSteps.value;
		const passed = isOffRoute.value && recalcNavSteps.value.length ? recalcPassedStepIndices.value : passedStepIndices.value;
		if (steps.length) {
			const idx = steps.findIndex((_, i) => !passed.has(i));
			if (idx >= 0) {
				const upcoming = steps[idx]!;
				return { type: upcoming.type, modifier: upcoming.modifier, name: upcoming.name, distanceM: haversineDistance(user, upcoming.location) };
			}
		}
		if (nextPoint.value) {
			return { type: 'continue', name: nextPoint.value.label || 'Prochain point', distanceM: haversineDistance(user, [nextPoint.value.longitude, nextPoint.value.latitude]) };
		}
		return null;
	});

	function handleOsrmFailure(err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		if (mounted.value) {
			osrmError.value = message;
			osrmLoading.value = false;
		}
		onOsrmError?.(message);
	}

	// Watch user location and next point to request steps
	watch([userLocationRef, nextPoint], async ([user]) => {
		const np = nextPoint.value;
		if (!user || !np) return;

		const fetchKey = `${np.id}:${user[0].toFixed(3)},${user[1].toFixed(3)}`;
		if (lastNavFetchKey.value === fetchKey) return;
		lastNavFetchKey.value = fetchKey;

		let alive = true;
		osrmLoading.value = true;
		osrmError.value = null;

		try {
			const steps = await fetchRouteSteps([user, [np.longitude, np.latitude]], osrmUrl);
			if (!alive || !mounted.value) return;
			osrmLoading.value = false;
			if (!steps.length) {
				osrmError.value = 'Aucune instruction de navigation disponible';
				return;
			}
			passedStepIndicesRef.value = new Set([0]);
			navSteps.value = steps;
			passedStepIndices.value = new Set([0]);
			osrmError.value = null;
		} catch (err) {
			if (!alive) return;
			handleOsrmFailure(err);
		}

		return () => {
			alive = false;
		};
	});

	// Helper to mark passed steps
	const markPassedSteps = (user: [number, number], steps: NavStep[], passedRef: Ref<Set<number>>, setPassed: (s: Set<number>) => void) => {
		steps.forEach((step, i) => {
			if (passedRef.value.has(i)) return;
			const dist = haversineDistance(user, step.location);
			if (dist < STEP_PASSED_THRESHOLD_M) {
				passedRef.value = new Set([...passedRef.value, i]);
				setPassed(new Set(passedRef.value));
			}
		});
	};

	// Watch user location for reaching points, off-route detection and recalculation
	watch([userLocationRef, sortedPoints, () => navSteps.value.length, () => recalcNavSteps.value.length, routePolyline], async ([user]) => {
		if (!user) return;

		let firstReachedPoint: any = null;
		for (const point of sortedPoints.value) {
			if (visitedPointIdsRef.value.has(point.id)) continue;
			const dist = haversineDistance(user, [point.longitude, point.latitude]);
			if (dist < POINT_REACHED_THRESHOLD_M) {
				visitedPointIdsRef.value = new Set([...visitedPointIdsRef.value, point.id]);
				if (!firstReachedPoint) firstReachedPoint = point;
			}
		}
		if (firstReachedPoint) {
			visitedPointIds.value = new Set(visitedPointIdsRef.value);
			validatedPoint.value = firstReachedPoint;
		}

		markPassedSteps(user, navSteps.value, passedStepIndicesRef, (s) => (passedStepIndices.value = s));
		if (recalcNavSteps.value.length) {
			markPassedSteps(user, recalcNavSteps.value, recalcPassedStepIndicesRef, (s) => (recalcPassedStepIndices.value = s));
		}

		if (!routePolyline.value.length || !nextPoint.value) return;

		if (nextPoint.value.id !== lastNextPointId.value) {
			lastNextPointId.value = nextPoint.value.id;
			lastRecalc.value = 0;
			lastNavFetchKey.value = null;
			recalcGeoJSON.value = null;
			recalcNavSteps.value = [];
			recalcPassedStepIndicesRef.value = new Set();
			recalcPassedStepIndices.value = new Set();
		}

		const { distance } = nearestPointOnPolyline(user, routePolyline.value);
		const offRoute = distance > OFF_ROUTE_THRESHOLD_M;
		offRouteDistance.value = offRoute ? distance : null;

		if (offRoute) {
			if (!wasOffRouteRef.value) {
				wasOffRouteRef.value = true;
				onOffRoute?.(distance);
			}
			const now = Date.now();
			if (now - lastRecalc.value > RECALC_COOLDOWN_MS) {
				lastRecalc.value = now;
				const dest: [number, number] = [nextPoint.value.longitude, nextPoint.value.latitude];
				try {
					const result = await fetchRouteWithSteps([user, dest], osrmUrl);
					if (!mounted.value) return;
					recalcPassedStepIndicesRef.value = new Set([0]);
					recalcGeoJSON.value = result.geoJSON;
					recalcNavSteps.value = result.steps;
					recalcPassedStepIndices.value = new Set([0]);
				} catch (err) {
					handleOsrmFailure(err);
				}
			}
		} else {
			wasOffRouteRef.value = false;
			recalcGeoJSON.value = null;
			recalcNavSteps.value = [];
			recalcPassedStepIndicesRef.value = new Set();
			recalcPassedStepIndices.value = new Set();
		}
	});

	const etaMinutesFromSpeed = computed(() => {
		if (distanceToNextM.value == null) return null;
		return (distanceToNextM.value / 1000 / DEFAULT_SPEED_KMH) * 60;
	});

	return {
		sortedPoints,
		nextPoint,
		nextPointLabel,
		routeGeoJSON,
		recalcGeoJSON,
		visitedPointIds,
		validatedPoint,
		setValidatedPoint: (p: any | null) => (validatedPoint.value = p),
		distanceToNextM,
		estimatedMinutesRemaining,
		totalRemainingM,
		currentInstruction,
		offRouteDistance,
		etaMinutesFromSpeed,
		osrmError,
		osrmLoading,
		isOffRoute,
	} as const;
}

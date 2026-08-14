<template>
	<div ref="rootRef" class="h-screen w-screen flex flex-col bg-background">
		<header class="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
				<div>
					<p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">Convoy</p>
					<h1 class="font-heading text-2xl font-bold">Observatoire</h1>
				</div>
				<div class="flex items-center gap-2">
				        <Button variant="ghost" @click="toggleFullscreen" v-if="!fullscreenActive">Plein écran</Button>
				        <Button variant="ghost" @click="toggleFullscreen" v-else>Quitter plein écran</Button>
				        <Button variant="outline" @click="signOut">Déconnexion</Button>
				    </div>
			</div>
		</header>

		<main>
			<!-- Fullscreen mode: map + top banner + right-side auto-scrolling participants -->
			<div v-if="fullscreenActive" class="relative h-[calc(100vh-73px)] w-full bg-background">
				<!-- Top banner showing convoy name only -->
				<div class="absolute left-0 right-0 top-0 z-20 flex items-center justify-center border-b bg-background/90 py-3">
					<h2 class="font-heading text-xl font-semibold">{{ selectedConvoy?.name ?? 'Observatoire' }}</h2>
					<div class="absolute right-4 flex items-center gap-2">
						<button class="btn" :class="followMode === 'head' ? 'opacity-100' : 'opacity-60'" @click.prevent="followMode = 'head'" title="Suivre tête">Tête</button>
						<button class="btn" :class="followMode === 'vehicles' ? 'opacity-100' : 'opacity-60'" @click.prevent="followMode = 'vehicles'" title="Suivre véhicules">Véhicules</button>
						<button class="btn" :class="followMode === 'overview' ? 'opacity-100' : 'opacity-60'" @click.prevent="followMode = 'overview'" title="Vue d'ensemble">Overview</button>
					</div>
				</div>

				<ClientOnly>
					<MglMap :mapStyle="MAP_STYLE" :center="MAP_CENTER" :zoom="9" class="h-full w-full">
						<MglNavigationControl :showCompass="false" />
						<template v-for="convoy in activeConvoys" :key="convoy.id">
							<template v-for="segment in convoy.segments" :key="segment.id">
								<MglGeoJsonSource :source-id="`${convoy.id}-${segment.id}`" :data="segment.geometry">
									<MglLineLayer :layer-id="`${convoy.id}-${segment.id}`" :paint="{ 'line-color': selectedConvoy?.id === convoy.id ? '#2563eb' : '#94a3b8', 'line-width': selectedConvoy?.id === convoy.id ? 4 : 3 }" />
								</MglGeoJsonSource>
							</template>
						</template>
						<template v-for="vehicle in connectedVehicles" :key="vehicle.sub">
							<MglMarker :coordinates="[vehicle.lon, vehicle.lat]">
								<template #marker>
									<div class="relative size-7">
										<div class="absolute inset-1 flex items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-lg" :class="roleColorClass(vehicle.role)">{{ (vehicle.name || 'A').charAt(0).toUpperCase() }}</div>
									</div>
								</template>
							</MglMarker>
						</template>
					</MglMap>
				</ClientOnly>

				<!-- Right side participants overlay -->
				<div class="absolute right-4 top-16 z-30 h-[calc(100vh-140px)] w-40 overflow-hidden rounded-lg bg-card/90 shadow-lg">
					<div ref="participantListRef" class="h-full overflow-y-auto p-2 space-y-2">
						<div v-for="vehicle in connectedVehicles" :key="vehicle.sub" class="rounded-lg border bg-card px-2.5 py-2 text-sm">
							<div class="flex items-center justify-between gap-2">
								<div>
									<div class="font-medium">{{ vehicle.name }}</div>
									<div class="text-xs text-muted-foreground">{{ convoyNameForVehicle(vehicle) }}</div>
								</div>
								<div class="flex items-center gap-2">
									<span class="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white" :class="roleColorClass(vehicle.role)">{{ vehicle.role || 'participant' }}</span>
									<span v-if="isOffTrack(vehicle)" class="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-semibold text-white">Hors tracé</span>
								</div>
							</div>
							<div class="mt-1 text-xs text-muted-foreground">{{ vehicle.lat.toFixed(5) }}, {{ vehicle.lon.toFixed(5) }}</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Normal (sidebar) mode -->
			<div class="grid h-[calc(100vh-73px)] grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)]">
				<aside :class="['border-r bg-muted/10', fullscreenActive ? 'hidden' : 'block']">
					<div class="border-b px-4 py-3">
						<h2 class="font-heading text-lg font-semibold">Convois actifs</h2>
					</div>
					<div v-if="loading" class="p-4 text-sm text-muted-foreground">Chargement des convois…</div>
					<div v-else-if="!activeConvoys.length" class="p-4 text-sm text-muted-foreground">Aucun convoi n'est actuellement actif.</div>
					<div v-else class="space-y-3 p-3">
						<button
							v-for="convoy in activeConvoys"
							:key="convoy.id"
							:type="button"
							class="w-full rounded-xl border bg-card p-3 text-left transition hover:border-primary hover:bg-accent/30"
							:class="selectedConvoy?.id === convoy.id ? 'border-primary bg-primary/5' : ''"
							@click="selectedConvoyId = convoy.id"
						>
							<div class="flex items-center justify-between gap-2">
								<span class="font-heading text-base font-semibold">{{ convoy.name }}</span>
								<span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">{{ formatConvoyStatus(convoy.status) }}</span>
							</div>
							<div class="mt-2 text-sm text-muted-foreground">
								<span>{{ convoy.accessCode }}</span>
								<span class="mx-2">•</span>
								<span>{{ convoy.segments.length }} segments</span>
							</div>
							<div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
								<span>{{ formatDistance(totalDistance(convoy)) }}</span>
								<span>•</span>
								<span>{{ formatDuration(totalDuration(convoy)) }}</span>
							</div>
						</button>
					</div>
					<div class="border-t px-4 py-3">
						<div class="flex items-center justify-between">
							<h3 class="font-heading text-base font-semibold">Véhicules connectés</h3>
							<span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{{ connectedVehicles.length }}</span>
						</div>
						<div v-if="!connectedVehicles.length" class="mt-3 text-sm text-muted-foreground">Aucun véhicule ne transmet pour le moment.</div>
						<div v-else class="mt-3 space-y-2">
							<div v-for="vehicle in connectedVehicles" :key="vehicle.sub" class="rounded-lg border bg-card px-2.5 py-2 text-sm">
								<div class="flex items-center justify-between gap-2">
									<div>
										<div class="font-medium">{{ vehicle.name }}</div>
										<div class="text-xs text-muted-foreground">{{ convoyNameForVehicle(vehicle) }}</div>
									</div>
									<div class="flex items-center gap-2">
										<span class="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white" :class="roleColorClass(vehicle.role)">{{ vehicle.role || 'participant' }}</span>
										<span v-if="isOffTrack(vehicle)" class="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-semibold text-white">Hors tracé</span>
									</div>
								</div>
								<div class="mt-1 text-xs text-muted-foreground">{{ vehicle.lat.toFixed(5) }}, {{ vehicle.lon.toFixed(5) }}</div>
							</div>
						</div>
					</div>
				</aside>

				<section class="relative h-full min-h-0">
					<div v-if="selectedConvoy" class="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur-sm">
						<div>
							<h2 class="font-heading text-xl font-semibold">{{ selectedConvoy.name }}</h2>
							<p class="text-sm text-muted-foreground">{{ selectedConvoy.accessCode }}</p>
						</div>
						<div class="flex items-center gap-3 text-sm text-muted-foreground">
							<span>{{ formatDistance(totalDistance(selectedConvoy)) }}</span>
							<span>•</span>
							<span>{{ formatDuration(totalDuration(selectedConvoy)) }}</span>
						</div>
					</div>

					<ClientOnly v-if="!fullscreenActive">
						<MglMap :mapStyle="MAP_STYLE" :center="MAP_CENTER" :zoom="9" class="h-full w-full">
							<MglNavigationControl :showCompass="false" />
							<template v-for="convoy in activeConvoys" :key="convoy.id">
								<template v-for="segment in convoy.segments" :key="segment.id">
									<MglGeoJsonSource :source-id="`${convoy.id}-${segment.id}`" :data="segment.geometry">
										<MglLineLayer :layer-id="`${convoy.id}-${segment.id}`" :paint="{ 'line-color': selectedConvoy?.id === convoy.id ? '#2563eb' : '#94a3b8', 'line-width': selectedConvoy?.id === convoy.id ? 4 : 3 }" />
										<MglMarker v-if="segment.poi" :coordinates="[segment.poi.lon, segment.poi.lat]">
											<template #marker>
												<div class="relative flex flex-col items-center pointer-events-none">
													<div class="relative z-10 flex size-7 items-center justify-center rounded-full border-2 border-white bg-primary text-[0.7rem] font-bold text-primary-foreground shadow-lg">{{ segment.order + 1 }}</div>
													<div v-if="segment.name" class="relative z-10 mt-1 max-w-40 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-background px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow">{{ segment.name }}</div>
												</div>
											</template>
										</MglMarker>
									</MglGeoJsonSource>
								</template>
							</template>
							<template v-for="vehicle in connectedVehicles" :key="vehicle.sub">
								<MglMarker :coordinates="[vehicle.lon, vehicle.lat]">
									<template #marker>
										<div class="relative size-7">
											<div class="absolute inset-1 flex items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-lg" :class="roleColorClass(vehicle.role)">{{ (vehicle.name || 'A').charAt(0).toUpperCase() }}</div>
										</div>
									</template>
								</MglMarker>
							</template>
						</MglMap>
					</ClientOnly>
				</section>
				</div>

		</main>
	</div>
</template>

<script setup lang="ts">
import type { Convoy, ConvoyPOI, ConvoySegment } from '@convoy/db';
import * as WSH from '~~/shared/websockets';

type ObserverConvoy = Convoy & { segments: (ConvoySegment & { poi: ConvoyPOI | null })[] };
type RemoteVehicle = WSH.PositionPayload & { name: string; role?: string };

type WsStatus = 'connecting' | 'connected' | 'disconnected';

useSeoMeta({ title: 'Observatoire - Convoy' });
definePageMeta({ requireSession: 'observer' });

const MAP_CENTER: [number, number] = [-0.008, 46.5406];
const MAP_STYLE: any = {
	version: 8,
	sources: {
		osm: {
			type: 'raster',
			tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
			tileSize: 256,
			attribution: '© OpenStreetMap',
		},
	},
	layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const POSITION_STALE_MS = 15_000;
const wsStatus = ref<WsStatus>('disconnected');
const observerToken = ref<string | null>(null);
const remoteVehicles = ref<Record<string, RemoteVehicle>>({});
const activeConvoys = ref<ObserverConvoy[]>([]);
const selectedConvoyId = ref<string | null>(null);
const loading = ref(true);

// Fullscreen follow modes: 'head' | 'vehicles' | 'overview'
const followMode = ref<'head' | 'vehicles' | 'overview'>('head');
import maplibregl from 'maplibre-gl';

const selectedConvoy = computed(() => {
	if (!activeConvoys.value.length) return null;
	return activeConvoys.value.find((convoy) => convoy.id === selectedConvoyId.value) ?? activeConvoys.value[0] ?? null;
});

const connectedVehicles = computed(() => Object.values(remoteVehicles.value).filter((vehicle) => Date.now() - vehicle.ts < POSITION_STALE_MS));

function roleColorClass(role?: string) {
	switch (role) {
		case 'regulator':
			return 'bg-yellow-500';
		case 'head':
			return 'bg-red-500';
		case 'opener':
			return 'bg-green-500';
		case 'sweep':
			return 'bg-blue-500';
		default:
			return 'bg-primary';
	}
}

function totalDistance(convoy: ObserverConvoy) {
	return convoy.segments.reduce((sum, segment) => sum + Number(segment.lengthInMeters || 0), 0);
}

function totalDuration(convoy: ObserverConvoy) {
	return convoy.segments.reduce((sum, segment) => sum + Number(segment.durationInMinutes || 0), 0);
}

watch(selectedConvoy, () => {
	if (!selectedConvoy.value) return;
	nextTick(() => {
		centerOnConvoy(selectedConvoy.value as any);
		if (fullscreenActive.value) applyFollowMode();
	});
});

watch(connectedVehicles, () => {
	if (fullscreenActive.value) applyFollowMode();
});

async function fetchObserverConvoys() {
	loading.value = true;
	try {
		const _q = await fetch('/api/observer/convoys?include=segments,segments.poi').then((_q) => _q.json());
		if (_q.error || _q.errors) throw _q.errors || [_q.error];
		activeConvoys.value = Array.isArray(_q) ? _q : [];
		if (!selectedConvoyId.value && activeConvoys.value.length) selectedConvoyId.value = activeConvoys.value[0].id;
		if (selectedConvoyId.value && !activeConvoys.value.some((convoy) => convoy.id === selectedConvoyId.value)) {
			selectedConvoyId.value = activeConvoys.value[0]?.id ?? null;
		}
	} catch (e) {
		console.error('Unable to load observer convoy list:', e);
		activeConvoys.value = [];
	} finally {
		loading.value = false;
	}
}

let websocket: WebSocket | undefined;
let cseq: WSH.Sequence | undefined;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
let shouldReconnect = true;
let staleInterval: ReturnType<typeof setInterval> | undefined;

// Fullscreen participant list auto-scroll
const rootRef = ref<HTMLElement | null>(null);
const fullscreenActive = ref(false);
const participantListRef = ref<HTMLElement | null>(null);
let participantScrollInterval: ReturnType<typeof setInterval> | undefined;
const SCROLL_STEP_PX = 1; // pixels per tick
const SCROLL_TICK_MS = 50; // ms per tick

function startParticipantAutoScroll() {
	stopParticipantAutoScroll();
	if (!participantListRef.value) return;
	const el = participantListRef.value;
	participantScrollInterval = setInterval(() => {
		if (!el) return;
		if (el.scrollHeight <= el.clientHeight) return;
		el.scrollTop += SCROLL_STEP_PX;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
			// loop back to top
			el.scrollTop = 0;
		}
	}, SCROLL_TICK_MS);
}

function stopParticipantAutoScroll() {
	if (participantScrollInterval) {
		clearInterval(participantScrollInterval);
		participantScrollInterval = undefined;
	}
}

async function toggleFullscreen() {
	// Use the Fullscreen API and only set fullscreenActive when the browser has changed state
	try {
		if (!document.fullscreenElement) {
			if (rootRef.value && rootRef.value.requestFullscreen) {
				await rootRef.value.requestFullscreen();
			}
		} else {
			if (document.exitFullscreen) await document.exitFullscreen();
		}
	} catch (e) {
		console.warn('Fullscreen request failed', e);
	}
}

function onFullscreenChange() {
	const isFs = document.fullscreenElement === rootRef.value;
	fullscreenActive.value = !!isFs;
	nextTick(() => {
		if (fullscreenActive.value) startParticipantAutoScroll();
		else stopParticipantAutoScroll();
	});
}

function applyRemoteVehicle(payload: WSH.PositionPayload) {
	const name = WSH.positionDisplayName(payload);
	remoteVehicles.value = {
		...remoteVehicles.value,
		[payload.sub]: {
			...payload,
			name,
			role: payload.role ?? 'user',
		},
	};
	// If fullscreen and following live vehicles, trigger follow update
	if (fullscreenActive.value) {
		applyFollowMode();
	}
}

function pruneStaleVehicles() {
	const now = Date.now();
	remoteVehicles.value = Object.fromEntries(
		Object.entries(remoteVehicles.value).filter(([, vehicle]) => now - vehicle.ts < POSITION_STALE_MS),
	);
	if (fullscreenActive.value) applyFollowMode();
}

function vehiclesForSelectedConvoy() {
	if (!selectedConvoy.value) return [] as RemoteVehicle[];
	return Object.values(remoteVehicles.value).filter((v) => v.convoyId === selectedConvoy.value?.id);
}

function headVehicle() {
	return Object.values(remoteVehicles.value).find((v) => v.role === 'head' && v.convoyId === selectedConvoy.value?.id) ?? null;
}

function applyFollowMode() {
	const map = useMglMap().map;
	if (!map) return;
	if (!selectedConvoy.value) return;

	if (followMode.value === 'head') {
		const head = headVehicle();
		if (head) {
			map.easeTo({ center: [head.lon, head.lat], zoom: 18, duration: 400 });
			return;
		}
		// fallback to vehicles
		followMode.value = 'vehicles';
	}

	if (followMode.value === 'vehicles') {
		const vehicles = vehiclesForSelectedConvoy();
		if (vehicles.length) {
			const bounds = new maplibregl.LngLatBounds();
			for (const v of vehicles) bounds.extend([v.lon, v.lat]);
			if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 100, duration: 500, maxZoom: 18 });
			return;
		}
		// fallback to overview
		followMode.value = 'overview';
	}

	if (followMode.value === 'overview') {
		// reuse centerOnConvoy behavior: fit bounds on segments
		const bounds = new maplibregl.LngLatBounds();
		for (const segment of selectedConvoy.value.segments) {
			if (!segment || !segment.geometry) continue;
			const geometry = segment.geometry as { type: string; coordinates: [number, number][] };
			if (geometry.type !== 'LineString') continue;
			for (const coordinate of geometry.coordinates) bounds.extend(coordinate);
		}
		if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 120, duration: 800, maxZoom: 15 });
		return;
	}
}

// Helpers to associate vehicles with convoys and detect off-track state
function findConvoyForVehicle(vehicle: RemoteVehicle) {
	if (!vehicle.convoyId) return null;
	return activeConvoys.value.find((c) => c.id === vehicle.convoyId) ?? null;
}

function convoyNameForVehicle(vehicle: RemoteVehicle) {
	const c = findConvoyForVehicle(vehicle);
	return c ? c.name : (vehicle.convoyId ?? '—');
}

const OFF_TRACK_THRESHOLD_M = 100; // meters
function toRad(v: number) {
	return (v * Math.PI) / 180;
}

function pointToSegmentDistanceMeters(pointLat: number, pointLon: number, lat1: number, lon1: number, lat2: number, lon2: number) {
	// Equirectangular projection for small distances
	const R = 6371000; // earth radius
	const lat1r = toRad(lat1);
	const lat2r = toRad(lat2);
	const latPr = toRad(pointLat);
	const meanLat = (lat1r + lat2r) / 2;

	const x1 = toRad(lon1) * Math.cos(meanLat);
	const x2 = toRad(lon2) * Math.cos(meanLat);
	const xp = toRad(pointLon) * Math.cos(meanLat);

	const y1 = lat1r;
	const y2 = lat2r;
	const yp = latPr;

	const vx = x2 - x1;
	const vy = y2 - y1;
	const wx = xp - x1;
	const wy = yp - y1;
	const c1 = vx * wx + vy * wy;
	const c2 = vx * vx + vy * vy;
	let t = c2 <= 0 ? 0 : c1 / c2;
	t = Math.max(0, Math.min(1, t));
	const projx = x1 + t * vx;
	const projy = y1 + t * vy;
	const distRad = Math.sqrt((projx - xp) * (projx - xp) + (projy - yp) * (projy - yp));
	return distRad * R;
}

function minDistanceToSegmentsMeters(vehicle: RemoteVehicle, convoy: ObserverConvoy) {
	if (!convoy || !convoy.segments) return Infinity;
	let min = Infinity;
	for (const seg of convoy.segments) {
		const coords = seg.geometry?.coordinates;
		if (!Array.isArray(coords)) continue;
		// coords may be a flat array of coordinate pairs or nested; normalize to pairs array
		let line: any[] = coords;
		if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
			// nested, flatten one level
			line = coords.flat();
		}
		for (let i = 0; i < line.length - 1; i++) {
			const [lon1, lat1] = line[i];
			const [lon2, lat2] = line[i + 1];
			const d = pointToSegmentDistanceMeters(vehicle.lat, vehicle.lon, lat1, lon1, lat2, lon2);
			if (d < min) min = d;
			if (min <= 0) return 0;
		}
	}
	return min;
}

function isOffTrack(vehicle: RemoteVehicle) {
	const convoy = findConvoyForVehicle(vehicle);
	if (!convoy) return false;
	const d = minDistanceToSegmentsMeters(vehicle, convoy);
	return d > OFF_TRACK_THRESHOLD_M;
}

function handleWsMessage(event: MessageEvent) {
	const frame = WSH.decodeFrame(event.data);
	if (!frame) return;
	if (frame.type === WSH.CWSMessageType.AUTH_REQ && websocket && observerToken.value) {
		websocket.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_JWT, WSH.CWSFlag.ACK_REQUIRED | WSH.CWSFlag.PRIORITY, cseq!.next(), new TextEncoder().encode(observerToken.value)));
		return;
	}
	if (frame.type === WSH.CWSMessageType.POSITION) {
		const payload = WSH.parsePositionPayload(frame.payload);
		if (payload) applyRemoteVehicle(payload);
		return;
	}
	if (frame.type === WSH.CWSMessageType.AUTH_OK) {
		wsStatus.value = 'connected';
		return;
	}
	if (frame.type === WSH.CWSMessageType.AUTH_ERROR || frame.type === WSH.CWSMessageType.PONG) {
		if (frame.type === WSH.CWSMessageType.AUTH_ERROR) wsStatus.value = 'disconnected';
		return;
	}
}

function createWebSocket() {
	if (!observerToken.value || !shouldReconnect) return;
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = undefined;
	}
	cseq = new WSH.Sequence();
	websocket = new WebSocket('/api/ws');
	websocket.binaryType = 'arraybuffer';
	wsStatus.value = 'connecting';
	websocket.addEventListener('open', () => {
		websocket!.send(WSH.encodeFrame(WSH.CWSMessageType.HELLO, 0, cseq!.next()));
	});
	websocket.addEventListener('message', handleWsMessage);
	websocket.addEventListener('close', () => {
		wsStatus.value = 'disconnected';
		websocket = undefined;
		cseq = undefined;
		if (shouldReconnect) reconnectTimeout = setTimeout(createWebSocket, 2000);
	});
}

function signOut() {
	if (import.meta.client) {
		document.cookie = 'cost=; Max-Age=0; Path=/; SameSite=Lax';
		localStorage.removeItem('convoy-observer-token');
		shouldReconnect = false;
		if (reconnectTimeout) clearTimeout(reconnectTimeout);
		websocket?.close();
	}
	navigateTo('/observer/sign-in', { replace: true });
}

onMounted(() => {
	observerToken.value = localStorage.getItem('convoy-observer-token');
	if (!observerToken.value) {
		navigateTo('/observer/sign-in', { replace: true });
		return;
	}
	shouldReconnect = true;
	createWebSocket();
	fetchObserverConvoys();
	staleInterval = setInterval(pruneStaleVehicles, 5000);
	// fullscreenchange handling
	document.addEventListener('fullscreenchange', onFullscreenChange);
	// if user reloads while fullscreen was active, resume auto-scroll (state initialised by onFullscreenChange)
	if (document.fullscreenElement === rootRef.value) {
		fullscreenActive.value = true;
		startParticipantAutoScroll();
	}
});

onUnmounted(() => {
	shouldReconnect = false;
	if (reconnectTimeout) clearTimeout(reconnectTimeout);
	if (staleInterval) clearInterval(staleInterval);
	websocket?.close();
	document.removeEventListener('fullscreenchange', onFullscreenChange);
	stopParticipantAutoScroll();
});
</script>

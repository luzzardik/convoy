<template>
	<!-- Map -->
	<div class="border rounded-lg overflow-hidden w-screen h-screen z-1">
		<ClientOnly>
			<MglMap :mapStyle="MAP_STYLE" :center="MAP_CENTER" :zoom="9">
				<MglNavigationControl :showCompass="false" />
				<!-- Route GeoJSON (primary) -->
				<MglGeoJsonSource v-if="routeGeoJSON" source-id="route-geojson" :data="routeGeoJSON">
					<MglLineLayer layer-id="route-geojson" :paint="{ 'line-color': '#000000', 'line-width': 5 }" />
				</MglGeoJsonSource>
				<!-- Recalculated route (off-route) -->
				<MglGeoJsonSource v-if="recalcGeoJSON" source-id="recalc-geojson" :data="recalcGeoJSON">
					<MglLineLayer layer-id="recalc-geojson" :paint="{ 'line-color': '#000000', 'line-width': 4, 'line-dasharray': [2, 2] }" />
				</MglGeoJsonSource>
				<template v-if="convoy" v-for="segment in convoy.segments">
					<!-- TODO: poi highlight + pulse -->
					<MglMarker v-if="segment.poi" :coordinates="[segment.poi.lon, segment.poi.lat]">
						<template v-slot:marker>
							<div class="relative flex flex-col items-center pointer-events-none">
								<div class="relative z-1 size-8 rounded-full bg-primary text-primary-foreground border-3 border-white shadow flex items-center justify-center font-bold text-[1rem] leading-0">{{ segment.order + 1 }}</div>
								<div v-if="segment.name" class="relative z-1 max-w-sm py-0.5 px-1.5 bg-primary-foreground text-primary font-bold text-center nowrap overflow-hidden ellipsis shadow rounded">{{ segment.name }}</div>
							</div>
						</template>
					</MglMarker>
					<MglMarker v-if="$geo.coords?.value && $geo.coords?.value?.longitude && $geo.coords?.value?.latitude" :coordinates="[$geo.coords.value.longitude, $geo.coords.value.latitude]">
						<template v-slot:marker>
							<div class="relative size-7">
								<div class="absolute rounded-full bg-primary/5 animate-pulse" style="inset: -6px"></div>
								<div class="absolute rounded-full bg-primary border-3 border-primary-foreground shadow-lg" style="inset: 4px"></div>
								<div v-if="$geo.coords.value.heading" class="absolute -top-2 left-1/2 size-0 -ml-1.5 border-l-6 border-r-6 border-l-transparent border-r-transparent border-b-10 border-b-primary shadow-2xl" :style="`transform: rotate(${$geo.coords.value.heading}deg); transform-origin: 50% calc(100% + 14px);`"></div>
							</div>
						</template>
					</MglMarker>
				</template>

				<!-- Remote peer positions -->
				<template v-for="(rp, sub) in remotePositions" :key="sub">
					<MglMarker :coordinates="[rp.lon, rp.lat]">
						<template v-slot:marker>
							<div class="relative size-7">
								<div class="absolute rounded-full bg-primary border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold" style="inset: 2px">{{ (rp.name || 'A').charAt(0).toUpperCase() }}</div>
								<div v-if="rp.heading" class="absolute -top-1.5 left-1/2 size-0 -ml-1 border-l-4 border-r-4 border-l-transparent border-r-transparent border-b-7 border-b-primary" :style="`transform: rotate(${rp.heading}deg); transform-origin: 50% calc(100% + 10px);`"></div>
							</div>
						</template>
					</MglMarker>
				</template>
			</MglMap>
		</ClientOnly>
	</div>
	<!-- Directions -->
	<div class="z-10 absolute bottom-0 left-0 bg-background text-foreground w-full p-4 border-t-4 border-primary">
		<!-- Websocket status -->
		<div class="mb-2 bg-gray-100 text-gray-800 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-if="preparing"><Loader2Icon class="animate-spin size-4" /> Préparation en cours...</div>
		<div class="mb-2 bg-red-100 text-red-800 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-else-if="websocketStatus == 'disconnected'"><PlugZap2Icon class="size-4" /> Connexion perdue.</div>
		<div class="mb-2 bg-orange-100 text-orange-800 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-else-if="websocketStatus == 'connecting'"><PlugZap2Icon class="size-4" /> Connexion en cours...</div>
		<div class="mb-2 bg-indigo-100 text-indigo-800 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-else-if="websocketStatus == 'authenticating'"><Loader2Icon class="animate-spin size-4" /> Identification auprès du serveur...</div>
		<!-- Off route issue -->
		<div class="mb-2 bg-red-100 text-red-800 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-if="isOffRoute"><MapPinXInsideIcon class="size-4" /> Hors tracé ({{ formatDistance(offRouteDistance) }}).</div>
		<!-- Directions -->
		<div class="divide-y">
			<div class="flex items-center gap-4 pb-4">
				<component :is="instructionsFormatted.icon" class="size-10 text-primary" />
				<div>
					<div class="text-sm">{{ instructionsFormatted.distance }}</div>
					<div class="font-bold text-lg text-primary">{{ instructionsFormatted.name }}</div>
					<div class="text-xs">{{ instructionsFormatted.modifier }}</div>
				</div>
			</div>
			<div class="flex items-center divide-x gap-4 py-4">
				<div class="flex-1">
					<div class="uppercase text-xs text-muted-foreground">Prochain point de passage</div>
					<div class="flex items-baseline gap-2">
						<div class="text-lg font-bold">{{ nextPointLabel ?? '-' }}</div>
						<div class="text-sm text-muted-foreground">· {{ distanceToNextM ? formatDistance(distanceToNextM) : '-' }}</div>
					</div>
				</div>
				<div class="flex-1">
					<div class="uppercase text-xs text-muted-foreground">Arrivée</div>
					<div class="flex items-baseline gap-2">
						<div class="text-lg font-bold">{{ etaMinutesFromSpeed ? formatDuration(etaMinutesFromSpeed) : estimatedMinutesRemaining ? formatDuration(estimatedMinutesRemaining) : '-' }}</div>
						<div class="text-sm text-muted-foreground">· {{ totalRemainingM ? formatDistance(totalRemainingM) : '-' }}</div>
					</div>
				</div>
			</div>
		</div>
		<!-- Footer -->
		<div v-if="convoy || wsSession" class="text-xs text-muted-foreground divide-x flex items-center justify-center">
			<span class="px-2" v-if="convoy">{{ convoy.name }}</span>
			<span class="px-2" v-if="wsSession && (wsSession.displayname || wsSession.username)">{{ wsSession.displayname || wsSession.username }}</span>
			<span class="px-2" v-if="wsSession && wsSession.mode == 'organizer'">Organisateur ({{ wsSession.role }})</span>
		</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import type { Convoy, ConvoySegment, ConvoyPOI } from '@convoy/db';
import { Loader2Icon, PlugZap2Icon, MapPinXInsideIcon } from '@lucide/vue';
import * as WSH from '~~/shared/websockets';
import { useGeolocation } from '@vueuse/core';
import { useRouteNav } from '../composables/useRouteNav';

// Page meta
useSeoMeta({ title: 'Convoi - Convoy' });

// Map base center
const MAP_CENTER: [number, number] = [-0.008, 46.5406];

// Map style
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

// Geolocation
const $geo = useGeolocation();
const updateCoords = debounce(() => {
	// TODO: disable tp if navigating around
	if (!$geo.coords.value?.longitude || !$geo.coords.value?.latitude) return;
	centerOnCoords([$geo.coords.value.longitude, $geo.coords.value.latitude]);
}, 1000);
let ucInterval = setInterval(() => updateCoords(), 500);

// Convoy
type CompleteConvoy = Convoy & { segments: (ConvoySegment & { poi: ConvoyPOI })[] };
const convoy = ref<CompleteConvoy | null>(null);

// Navigation composable (OSRM)
const userLoc = computed(() => {
	if (!$geo.coords.value?.longitude || !$geo.coords.value?.latitude) return null;
	return [$geo.coords.value.longitude, $geo.coords.value.latitude] as [number, number];
});
const _osrmUrlRaw = useRuntimeConfig().public?.osrmUrl ?? import.meta.env.VITE_OSRM_URL ?? '/api/osrm';
const osrmUrl = _osrmUrlRaw.startsWith('/') || _osrmUrlRaw.startsWith('http') ? _osrmUrlRaw : '/' + _osrmUrlRaw;
const { routeGeoJSON, recalcGeoJSON, currentInstruction, nextPointLabel, distanceToNextM, offRouteDistance, estimatedMinutesRemaining, totalRemainingM, etaMinutesFromSpeed, isOffRoute } = useRouteNav(convoy, userLoc, {
	osrmUrl,
	onOffRoute: (d) => console.debug('[route] off-route', d),
	onOsrmError: (m) => console.warn('[route] osrm', m),
});
const instructionsFormatted = useOSRMInstruction(currentInstruction as any, nextPointLabel, distanceToNextM);

// Websocket constants
const POSITION_STALE_MS = 15_000;
const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 60_000;
const RECONNECT_DELAY_MS = 2_000;

// Websocket management
const websocketStatus = ref<'connecting' | 'authenticating' | 'connected' | 'disconnected'>('disconnected');
const wsToken = ref<string>();
const wsSession = ref<WSH.ConvoyWSSession | null>(null);
let websocket: WebSocket | undefined;
let cseq: WSH.Sequence | undefined;
let shouldReconnect = true;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

// Positions
const remotePositions = ref<Record<string, { lon: number; lat: number; heading?: number; ts: number; name?: string }>>({});
let posInterval: ReturnType<typeof setInterval> | undefined;
let pingInterval: ReturnType<typeof setInterval> | undefined;
let staleInterval: ReturnType<typeof setInterval> | undefined;
let lastPong = Date.now();

function applyRemotePosition(payload: WSH.PositionPayload) {
	if (wsSession.value && payload.sub === wsSession.value.sub) return;
	remotePositions.value = {
		...remotePositions.value,
		[payload.sub]: {
			lon: payload.lon,
			lat: payload.lat,
			heading: payload.heading,
			ts: payload.ts,
			name: WSH.positionDisplayName(payload),
		},
	};
}

function pruneStalePositions() {
	const now = Date.now();
	const next = { ...remotePositions.value };
	let changed = false;
	for (const [sub, pos] of Object.entries(next)) {
		if (now - pos.ts > POSITION_STALE_MS) {
			delete next[sub];
			changed = true;
		}
	}
	if (changed) remotePositions.value = next;
}

function clearWsIntervals() {
	if (posInterval) clearInterval(posInterval);
	if (pingInterval) clearInterval(pingInterval);
	if (staleInterval) clearInterval(staleInterval);
	posInterval = pingInterval = staleInterval = undefined;
}

function startPositionSync() {
	clearWsIntervals();
	lastPong = Date.now();

	posInterval = setInterval(() => {
		if (!websocket || websocket.readyState !== WebSocket.OPEN || !wsSession.value) return;
		if (!$geo.coords.value?.longitude || !$geo.coords.value?.latitude) return;
		const payload = WSH.encodePositionPayload({
			sub: wsSession.value.sub,
			lon: $geo.coords.value.longitude,
			lat: $geo.coords.value.latitude,
			heading: $geo.coords.value.heading ?? undefined,
			ts: Date.now(),
			displayname: wsSession.value.displayname,
			username: wsSession.value.username,
		});
		try {
			websocket.send(WSH.encodeFrame(WSH.CWSMessageType.POSITION, WSH.CWSFlag.ACK_REQUIRED, cseq!.next(), payload));
		} catch (e) {
			console.warn('[Websocket] failed to send position', e);
		}
	}, 1000);

	pingInterval = setInterval(() => {
		if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
		if (Date.now() - lastPong > PONG_TIMEOUT_MS) {
			websocket.close();
			return;
		}
		try {
			websocket.send(WSH.encodeFrame(WSH.CWSMessageType.PING, 0, cseq!.next()));
		} catch (e) {
			console.warn('[Websocket] failed to send ping', e);
		}
	}, PING_INTERVAL_MS);

	staleInterval = setInterval(pruneStalePositions, 5000);
}

function handleWsMessage(rawmessage: MessageEvent) {
	const frame = WSH.decodeFrame(rawmessage.data);
	if (!frame) return;

	switch (frame.type) {
		case WSH.CWSMessageType.AUTH_REQ:
			websocket!.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_JWT, WSH.CWSFlag.ACK_REQUIRED | WSH.CWSFlag.PRIORITY, cseq!.next(), new TextEncoder().encode(wsToken.value)));
			break;

		case WSH.CWSMessageType.AUTH_ERROR:
			shouldReconnect = false;
			navigateTo('/');
			break;

		case WSH.CWSMessageType.AUTH_OK:
			wsSession.value = JSON.parse(new TextDecoder().decode(frame.payload));
			websocketStatus.value = 'connected';
			fetch('/api/convoy/' + wsSession.value!.convoyId + '?include=segments,segments.poi')
				.then((_q) => _q.json())
				.then((convoyData) => {
					convoy.value = convoyData as CompleteConvoy;
					centerOnConvoy(convoy.value);
				})
				.catch((e) => console.warn('[Websocket] failed to fetch convoy', e));
			startPositionSync();
			break;

		case WSH.CWSMessageType.POSITION: {
			const payload = WSH.parsePositionPayload(frame.payload);
			if (payload) applyRemotePosition(payload);
			break;
		}

		case WSH.CWSMessageType.POSITION_ACK:
			break;

		case WSH.CWSMessageType.PONG:
			lastPong = Date.now();
			break;
	}
}

function onWsClose() {
	websocketStatus.value = 'disconnected';
	websocket = undefined;
	cseq = undefined;
	clearWsIntervals();
	if (!shouldReconnect) return;
	reconnectTimeout = setTimeout(createWebsocket, RECONNECT_DELAY_MS);
}

function createWebsocket() {
	if (!wsToken.value || !shouldReconnect) return;
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = undefined;
	}
	cseq = new WSH.Sequence();
	websocket = new WebSocket('/api/ws');
	websocket.binaryType = 'arraybuffer';
	websocketStatus.value = 'connecting';
	websocket.addEventListener('open', () => {
		console.log('[Websocket] Connection opened');
		preparing.value = false;
		websocketStatus.value = 'authenticating';
		websocket!.send(WSH.encodeFrame(WSH.CWSMessageType.HELLO, 0, cseq!.next()));
	});
	websocket.addEventListener('message', handleWsMessage);
	websocket.addEventListener('error', (error) => console.error('[Websocket] error', error));
	websocket.addEventListener('close', onWsClose);
}

function closeWebsocket() {
	shouldReconnect = false;
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = undefined;
	}
	clearWsIntervals();
	if (websocket) {
		websocket.removeEventListener('close', onWsClose);
		websocket.close();
	}
	websocket = undefined;
	cseq = undefined;
}

// Initialize
const preparing = ref(true);
onMounted(() => {
	shouldReconnect = true;
	// Convoy Token
	const cvytk = localStorage.getItem('cvytk');
	if (!cvytk) return navigateTo('/');
	// Connect to Websocket
	wsToken.value = cvytk;
	createWebsocket();
	$geo.resume();
});
onUnmounted(() => {
	closeWebsocket();
	clearInterval(ucInterval);
	$geo.pause();
});
</script>

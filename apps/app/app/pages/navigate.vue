<template>
	<!-- Map -->
	<div class="border rounded-lg overflow-hidden w-screen h-screen z-1">
		<ClientOnly>
			<MglMap :mapStyle="MAP_STYLE" :center="MAP_CENTER" :zoom="9">
				<MglNavigationControl :showCompass="false" />
				<template v-if="convoy" v-for="segment in convoy.segments">
					<MglGeoJsonSource :source-id="segment.id" :data="segment.geometry">
						<MglLineLayer :layer-id="segment.id" :paint="{ 'line-color': '#000000', 'line-width': 4 }" />
						<!-- TODO: member marker <MglMarker v-if="segment.poi" :coordinates="[segment.poi.lon, segment.poi.lat]">
  							<template v-slot:marker>
  								<div class="size-6 border-2 border-white rounded-full flex items-center justify-center text-white text-sm font-bold shadow bg-primary">T</div>
  							</template>
  							</MglMarker>-->
						<!-- TODO: poi highlight + pulse -->
						<MglMarker v-if="segment.poi" :coordinates="[segment.poi.lon, segment.poi.lat]">
							<template v-slot:marker>
								<div class="relative flex flex-col items-center pointer-events-none">
									<div class="relative z-1 size-8 rounded-full bg-primary text-primary-foreground border-3 border-white shadow flex items-center justify-center font-bold text-[1rem] leading-0">{{ segment.order + 1 }}</div>
									<div v-if="segment.name" class="relative z-1 max-w-sm py-0.5 px-1.5 bg-primary-foreground text-primary font-bold text-center nowrap overflow-hidden ellipsis shadow rounded">{{ segment.name }}</div>
								</div>
							</template>
						</MglMarker>
					</MglGeoJsonSource>
				</template>
			</MglMap>
		</ClientOnly>
	</div>
	<!-- Directions -->
	<div class="z-10 absolute bottom-0 left-0 bg-background text-foreground w-full p-4 border-t-4 border-primary">
		<!-- Websocket status -->
		<div class="mb-2 bg-gray-100 border border-gray-300 text-gray-700 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-if="preparing"><Loader2Icon class="animate-spin size-4" /> Préparation en cours...</div>
		<div class="mb-2 bg-red-100 border border-red-300 text-red-700 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-else-if="websocketStatus == 'disconnected'"><PlugZap2Icon class="size-4" /> Connexion perdue.</div>
		<div class="mb-2 bg-orange-100 border border-orange-300 text-orange-700 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-else-if="websocketStatus == 'connecting'"><PlugZap2Icon class="size-4" /> Connexion en cours...</div>
		<div class="mb-2 bg-indigo-100 border border-indigo-300 text-indigo-700 text-sm py-1.5 px-2 rounded text-center flex items-center justify-center gap-2" v-else-if="websocketStatus == 'authenticating'"><Loader2Icon class="animate-spin size-4" /> Identification auprès du serveur...</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import type { Convoy, ConvoySegment, ConvoyPOI } from '@convoy/db';
import { Loader2Icon, PlugZap2Icon } from '@lucide/vue';
import { cs } from 'zod/v4/locales';
import * as WSH from '~~/shared/websockets';

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

// Convoy
type CompleteConvoy = Convoy & { segments: (ConvoySegment & { poi: ConvoyPOI })[] };
const convoy = ref<CompleteConvoy | null>(null);

// Websocket
const websocketStatus = ref<'connecting' | 'authenticating' | 'connected' | 'disconnected'>('disconnected');
const wsToken = ref<string>();
let websocket: WebSocket | undefined, cseq: WSH.Sequence | undefined;
function createWebsocket() {
	if (!wsToken.value) return;
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
	websocket.addEventListener('message', (rawmessage) => {
		console.log('[Websocket] Incoming message');
		// Validate and decode frame
		const frame = WSH.decodeFrame(rawmessage.data);
		if (!frame) return console.error('[Websocket] Received incorrect frame.');
		console.log('[Websocket] Frame decoded', 'typ', frame.type, 'flags', frame.flags, 'seq', frame.sequence);
		// Handle frame
		switch (frame.type) {
			// Auth required
			case WSH.CWSMessageType.AUTH_REQ:
				websocket!.send(WSH.encodeFrame(WSH.CWSMessageType.AUTH_JWT, WSH.CWSFlag.ACK_REQUIRED | WSH.CWSFlag.PRIORITY, cseq!.next(), new TextEncoder().encode(wsToken.value)));
				break;
		}
	});
	websocket.addEventListener('error', (error) => {
		console.error('[Websocket] Something went wrong', error);
	});
	websocket.addEventListener('close', (e) => {
		console.log('[Websocket] Disconnected.');
		websocketStatus.value = 'disconnected';
		if (!e.wasClean) {
			console.log('[Websocket] Not clean. Reconnecting...');
			closeWebsocket();
			createWebsocket();
		}
	});
}
function closeWebsocket() {
	if (websocket) websocket.close();
	if (websocket) websocket = undefined;
	cseq = undefined;
}

// Initialize
const preparing = ref(true);
onMounted(() => {
	// Convoy Token
	const cvytk = localStorage.getItem('cvytk');
	if (!cvytk) return navigateTo('/');
	// Connect to Websocket
	wsToken.value = cvytk;
	createWebsocket();
});
</script>

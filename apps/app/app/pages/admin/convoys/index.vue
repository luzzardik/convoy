<template>
	<div class="flex items-start h-full w-full">
		<div class="w-3/12 p-4 border-r h-full">
			<div class="flex items-center justify-between">
				<h1 class="font-heading text-xl">Convois</h1>
				<Button as-child>
					<NuxtLink to="/admin/convoys/new"><PlusIcon /> Nouveau convoi</NuxtLink>
				</Button>
			</div>
			<div class="space-y-3 mt-4">
				<NuxtLink class="block border rounded p-2" v-for="convoy in convoys" :to="`/admin/convoys/${convoy.id}`" @mouseenter="() => hoverConvoy(convoy.id, true)" @mouseleave="() => hoverConvoy(convoy.id, false)">
					<div class="font-heading text-lg">{{ convoy.name }}</div>
					<div class="text-sm text-muted-foreground">{{ formatConvoyStatus(convoy.status) }} - {{ convoy.accessCode }}</div>
				</NuxtLink>
			</div>
		</div>
		<div class="w-9/12 h-full">
			<ClientOnly>
				<MglMap :mapStyle="MAP_STYLE" :center="MAP_CENTER" :zoom="10" ref="map">
					<MglNavigationControl :showCompass="false" />
					<template v-if="hoveredConvoy">
						<template v-for="segment in hoveredConvoy.segments">
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
					</template>
				</MglMap>
			</ClientOnly>
		</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import type { Map } from 'maplibre-gl';
import type { Convoy, ConvoyPOI, ConvoySegment } from '@convoy/db';
import { PlusIcon } from '@lucide/vue';

// Page meta
useSeoMeta({ title: 'Convois - Administration Convoy' });
definePageMeta({
	requireSession: 'admin',
	layout: 'admin',
});

// Map
const map = ref<Map>();

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

// Hover convoy
const hoverConvoyId = ref<string | null>(null);
const hoveredConvoy = computed(() => {
	if (!hoverConvoyId.value) return null;
	const convoy = convoys.value.find((c) => c.id == hoverConvoyId.value);
	if (!convoy) return null;
	return convoy;
});
function hoverConvoy(convoyId: string, hover: boolean) {
	if (!hover && hoverConvoyId.value !== convoyId) return;
	hoverConvoyId.value = hover ? convoyId : null;
}
watch(hoverConvoyId, () => {
	if (!hoverConvoyId.value || !hoveredConvoy.value || !map.value) return;
	nextTick(() => {
		centerOnConvoy(hoveredConvoy.value);
	});
});

// Convoys
const convoys = ref<(Convoy & { segments: (ConvoySegment & { poi: ConvoyPOI })[] })[]>([]);
const convoysLoading = ref(true);
async function fetchConvoys() {
	convoysLoading.value = true;
	try {
		let _q = await fetch('/api/convoys?include=segments,segments.poi').then((_q) => _q.json());
		if (_q.error || _q.errors) throw _q.errors || [_q.error];
		convoys.value = _q;
	} catch (e) {
		// TODO
	} finally {
		convoysLoading.value = false;
	}
}
onMounted(() => {
	fetchConvoys();
});
</script>

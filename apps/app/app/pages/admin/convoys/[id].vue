<template>
	<div class="max-w-5xl px-8 mx-auto py-8 space-y-3" v-if="convoy">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="font-heading text-xl font-semibold">{{ convoy.name }}</h1>
				<h2 class="text-muted-foreground">{{ convoy.accessCode }}</h2>
			</div>
			<div class="flex items-center gap-1">
				<Button size="icon" variant="outline" asChild>
					<NuxtLink to="/admin/convoys"> <ArrowLeftCircleIcon /> </NuxtLink>
				</Button>
				<Button variant="destructive" size="icon"><Trash2Icon /></Button>
			</div>
		</div>
		<div class="border rounded p-3">
			<h2 class="font-medium">Import du fichier GPX</h2>
			<div class="flex items-center mt-2">
				<RadioGroup default-value="replace" v-model="gpxBehavior">
					<div class="flex items-center space-x-2">
						<RadioGroupItem id="r1" value="replace" />
						<Label for="r1">Remplacer les segments</Label>
					</div>
					<div class="flex items-center space-x-2">
						<RadioGroupItem id="r2" value="add" />
						<Label for="r2">Ajouter comme nouveaux segments</Label>
					</div>
				</RadioGroup>
				<input type="file" class="hidden" ref="gpxFile" accept=".gpx" @change="importGPX" />
				<Button @click="openImportGPX">Importer GPX</Button>
			</div>
		</div>
		<div class="border rounded-lg overflow-hidden w-full aspect-video">
			<ClientOnly>
				<MglMap :mapStyle="MAP_STYLE" :center="MAP_CENTER" :zoom="9">
					<MglNavigationControl :showCompass="false" />
					<template v-for="segment in convoy.segments">
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
		<!-- TODO: allow to setup global or per segment speed and recalculate duration -->
		<div class="border rounded p-3">
			<div class="flex items-center justify-between">
				<h2 class="font-medium">Segments ({{ convoy.segments.length }})</h2>
				<Button size="sm" @click="saveSegments">Sauvegarder</Button>
			</div>
			<div class="space-y-2 mt-2">
				<div :class="['border rounded p-2 px-2.5 flex items-center gap-3', segmentsToDelete.includes(segment.id) ? 'opacity-70' : '']" v-for="segment in orderedSegments">
					<div class="bg-primary rounded-full size-8 text-primary-foreground font-bold flex items-center justify-center">{{ segment.order + 1 }}</div>
					<div class="flex-1">
						<Input type="text" class="w-full" v-model="segment.name" />
						<div class="text-xs text-muted-foreground mt-1">{{ formatDistance(segment.lengthInMeters) }} · {{ formatDuration(segment.durationInMinutes) }} à {{ formatSpeed(calculateSpeed(segment.lengthInMeters, segment.durationInMinutes)) }}</div>
					</div>
					<div class="flex items-center gap-1">
						<Button size="icon" variant="secondary" @click="moveSegment(segment.id, -1)" :disabled="segment.order == 0"><ArrowUpIcon /></Button>
						<Button size="icon" variant="secondary" @click="moveSegment(segment.id, 1)" :disabled="segment.order + 1 == convoy.segments.length"><ArrowDownIcon /></Button>
						<Button size="icon" variant="destructive" @click="markSegmentForDeletion(segment.id)"><Trash2Icon /></Button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import type { Convoy, ConvoyPOI, ConvoySegment } from '@convoy/db';
import { ArrowDownIcon, ArrowLeftCircleIcon, ArrowUpIcon, Trash2Icon } from '@lucide/vue';
const $route = useRoute();

// Page meta
useSeoMeta({ title: 'Convoi - Administration Convoy' });
definePageMeta({
	requireSession: 'admin',
	layout: 'admin',
});

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

// Convoys
const convoy = ref<(Convoy & { segments: (ConvoySegment & { poi: ConvoyPOI })[] }) | null>(null);
const convoyLoading = ref(true);
async function fetchConvoy() {
	convoyLoading.value = true;
	try {
		let _q = await fetch(`/api/convoy/${$route.params.id}?include=segments,segments.poi`).then((_q) => _q.json());
		if (_q.error || _q.errors) throw _q.errors || [_q.error];
		convoy.value = _q;
	} catch (e) {
		// TODO
	} finally {
		convoyLoading.value = false;
	}
}
onMounted(() => {
	fetchConvoy();
});
watch(convoy, () => {
	nextTick(() => {
		centerOnConvoy(convoy.value as any);
	});
});

// GPX import
const gpxBehavior = ref<'add' | 'replace'>('replace');
const gpxFile = ref<HTMLInputElement>();
const gpxLoading = ref(false);
function openImportGPX() {
	gpxFile.value?.click();
}
async function importGPX() {
	if (!convoy.value) {
		if (gpxFile.value) gpxFile.value.value = '';
		return;
	}
	// Get file
	if (!gpxFile.value || !gpxFile.value.files || !gpxFile.value.files[0]) return;
	const file = gpxFile.value.files[0];
	// Create form data
	gpxLoading.value = true;
	const formData = new FormData();
	formData.append('file', file);
	formData.append('behavior', gpxBehavior.value);
	// Send file
	try {
		const _q = await fetch(`/api/convoy/${convoy.value.id}/gpx`, { method: 'POST', body: formData }).then((_q) => _q.json());
		if (_q.error || _q.errors) throw _q.errors || [_q.error];
		await fetchConvoy();
	} catch (e) {
		// TODO: better UI/UX
		alert("Une erreur est survenue pendant l'import du GPX.");
	} finally {
		gpxLoading.value = false;
	}
}

// Move segment
const orderedSegments = computed(() => convoy.value?.segments.sort((a, b) => a.order - b.order) ?? []);
function moveSegment(segmentId: string, offset: number) {
	if (!convoy.value) return;
	const segment = convoy.value.segments.find((s) => s.id == segmentId);
	if (!segment) return;
	const targetPosition = Math.max(0, Math.min(convoy.value.segments.length - 1, segment.order + offset));
	if (targetPosition == segment.order) return;
	const targetSegment = convoy.value.segments.find((s) => s.order == targetPosition);
	if (!targetSegment) return;
	targetSegment.order = segment.order;
	segment.order = targetPosition;
}

// Segments to delete
const segmentsToDelete = ref<string[]>([]);
watch(convoy, () => (segmentsToDelete.value = []));
function markSegmentForDeletion(segmentId: string) {
	if (segmentsToDelete.value.includes(segmentId)) segmentsToDelete.value = segmentsToDelete.value.filter((s) => s !== segmentId);
	else segmentsToDelete.value = [...segmentsToDelete.value, segmentId];
}

// Save segments
async function saveSegments() {
	if (!convoy.value) return;
	// Build segments update map
	let segmentsUpdateMap = {
		delete: segmentsToDelete.value,
		update: convoy.value.segments.map((s) => ({ id: s.id, name: s.name, order: s.order })),
	};
	// Send updates
	try {
		await fetch(`/api/convoy/${convoy.value.id}/segments`, { method: 'POST', body: JSON.stringify(segmentsUpdateMap), headers: { 'Content-Type': 'application/json' } }).then((_q) => _q.json());
	} catch (e) {
		// TODO
	}
	// OK.
	await fetchConvoy();
}
</script>

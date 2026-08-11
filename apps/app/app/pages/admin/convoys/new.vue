<template>
	<div class="h-screen w-screen flex items-center justify-center">
		<div class="flex flex-col items-center w-sm space-y-6">
			<div class="size-16 rounded bg-primary text-primary-foreground flex items-center justify-center">
				<RoadIcon class="size-10" />
			</div>
			<div class="text-center">
				<h1 class="text-2xl font-heading font-bold text-primary">Nouveau convoi</h1>
			</div>
			<div class="space-y-4 w-full">
				<div class="space-y-2">
					<Label>Nom</Label>
					<Input type="text" @keyup.enter="createConvoy" v-model="data.name" />
					<div v-if="errorsMap.name" class="text-destructive text-sm">{{ errorsMap.name[0] ?? 'Une erreur est survenue.' }}</div>
				</div>
				<div class="space-y-2">
					<Label>Code d'accès (optionnel, 6-8 car.)</Label>
					<Input type="text" @keyup.enter="createConvoy" v-model="data.accessCode" />
					<div v-if="errorsMap.accessCode" class="text-destructive text-sm">{{ errorsMap.accessCode[0] ?? 'Une erreur est survenue.' }}</div>
				</div>
				<div class="space-y-2">
					<Label>Mot de passe organisateur</Label>
					<Input type="password" @keyup.enter="createConvoy" v-model="data.organizerPassword" />
					<div v-if="errorsMap.organizerPassword" class="text-destructive text-sm">{{ errorsMap.organizerPassword[0] ?? 'Une erreur est survenue.' }}</div>
				</div>
				<Button class="w-full" v-if="!loading" @click="createConvoy">Créer le convoi</Button>
				<Button class="w-full" disabled v-else><Loader2Icon class="animate-spin" /> Création...</Button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import { RoadIcon, Loader2Icon } from '@lucide/vue';
import { CreateConvoyBody } from '~~/shared/validation';

// Page meta
useSeoMeta({ title: 'Créer un convoi - Administration Convoy' });
definePageMeta({
	requireSession: 'admin',
	layout: 'admin',
});

// Convoy creation
const loading = ref(false);
const errors = ref<string[]>([]);
const errorsMap = useErrorMap(errors, {}, 'name');
const validate = useZod(CreateConvoyBody);
const data = reactive({
	name: '',
	accessCode: '',
	organizerPassword: '',
});
async function createConvoy() {
	// Validate data
	const formData = JSON.parse(JSON.stringify(data));
	if (!formData.accessCode) delete formData.accessCode;
	errors.value = validate(formData);
	if (errors.value.length > 0) return;
	// Run query
	loading.value = true;
	try {
		let _q = await fetch('/api/convoys', { method: 'POST', body: JSON.stringify(formData), headers: { 'Content-Type': 'application/json' } }).then((_q) => _q.json());
		if (_q.error || _q.errors) throw _q.errors ?? [_q.error];
		navigateTo('/admin/convoys/' + _q.id);
	} catch (e) {
		errors.value = Array.isArray(e) ? e : typeof e == 'string' ? [e] : ['unexpected_issue'];
		loading.value = false;
	}
}
</script>

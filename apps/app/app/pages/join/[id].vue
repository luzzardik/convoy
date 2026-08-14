<template>
	<div class="h-screen w-screen flex items-center justify-center" v-if="convoy">
		<div class="flex flex-col items-center w-sm space-y-6">
			<div class="size-16 rounded bg-primary text-primary-foreground flex items-center justify-center active:shadow-lg" @pointerdown="startHold" @pointerup="endHold" @pointerleave="endHold" @pointercancel="endHold">
				<CarIcon class="size-10" />
			</div>
			<div class="text-center">
				<h1 class="text-2xl font-heading font-bold text-primary">{{ convoy.name }}</h1>
				<h2>Choissisez votre pseudo</h2>
			</div>
			<div class="space-y-2 w-full">
				<Input type="text" placeholder="Pseudonyme" v-model="username" @keyup.enter="joinConvoy" />
				<Input v-if="organizerMode" type="password" placeholder="Mot de passe organisateur" v-model="organizerPassword" @keyup.enter="joinConvoy" />
				<Select v-if="organizerMode" v-model="organizerRole">
					<SelectTrigger class="w-full">
						<SelectValue placeholder="Rôle d'organisateur" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="regulator">Régulateur</SelectItem>
						<SelectItem value="head">Tête de convoi</SelectItem>
						<SelectItem value="opener">Ouvreuse</SelectItem>
						<SelectItem value="sweep">Balais</SelectItem>
					</SelectContent>
				</Select>
				<Button v-if="!joining" class="w-full" size="lg" @click="joinConvoy">{{ organizerMode ? 'Entrer en mode organisateur' : 'Entrer dans le convoi' }}</Button>
				<Button class="w-full" v-else disabled size="lg">Connexion...</Button>
				<div v-if="convoyError" class="text-destructive text-sm">{{ useErrorCode(convoyError) ?? 'Une erreur est survenue.' }}</div>
			</div>
		</div>
	</div>
	<!-- Organizer modal -->
	<Modal v-if="showOrganizerModal">
		<div class="py-1 px-3 border-b font-bold">Mode Organisateur</div>
		<div class="p-4">
			<div class="mb-2">Le mode Organisateur est réservé à l'équipe gérant le convoi et donne accès à des fonctionnalités supplémentaires.</div>

			<div class="flex items-center justify-end gap-2 mt-4">
				<Button variant="outline" size="sm" @click="showOrganizerModal = false">Annuler</Button>
				<Button variant="default" size="sm" @click="setupOrganizerMode">Accepter</Button>
			</div>
		</div>
	</Modal>
</template>

<script setup lang="ts">
// Imports
import type { Convoy } from '@convoy/db';
import { CarIcon } from '@lucide/vue';
const $route = useRoute();

// Convoy
const convoy = ref<Convoy | null>(null);
const convoyLoading = ref(true);
async function fetchConvoy() {
	convoyLoading.value = true;
	try {
		let _q = await fetch(`/api/convoy/${$route.params.id}`).then((_q) => _q.json());
		if (_q.error || _q.errors) throw _q.errors || [_q.error];
		convoy.value = _q;
	} catch (e) {
		navigateTo('/');
		// TODO: better
	} finally {
		convoyLoading.value = false;
	}
}
onMounted(() => {
	fetchConvoy();
});

// Username
const username = ref<string>('');
const organizerMode = ref<boolean>($route.query.organizer == 'true');
const organizerPassword = ref<string>('');
const organizerRole = ref<'head' | 'opener' | 'sweep' | 'regulator'>('regulator');
const convoyError = ref<string | null>(null);
const joining = ref(false);
async function joinConvoy() {
	// Validate data
	convoyError.value = null;
	if (!username.value.trim().length) convoyError.value = 'username_required';
	if (organizerMode.value && !organizerPassword.value.length) convoyError.value = 'organizer_password_required';
	if (convoyError.value) return;
	joining.value = true;
	// Create data
	const data = {
		mode: organizerMode.value ? 'organizer' : 'user',
		username: username.value.trim(),
		organizerRole: organizerMode.value ? organizerRole.value : undefined,
		organizerPassword: organizerMode.value ? organizerPassword.value : undefined,
	};
	// Request token
	try {
		let _q = await fetch(`/api/convoy/${$route.params.id}/join`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }).then((_q) => _q.json());
		if (_q.error || _q.errors) throw _q.errors ? _q.errors[0] : _q.error;
		// TODO: save token
		navigateTo('/navigate');
	} catch (e) {
		console.error('Something went wrong whilst exchanging convoy token', e);
		convoyError.value = typeof e == 'string' ? e : 'unexpected_issue';
		joining.value = false;
		return;
	}
}

// Hold for organizer mode
const showOrganizerModal = ref(false);
let holdTimeout: ReturnType<typeof setTimeout> | undefined;
function startHold() {
	holdTimeout = setTimeout(() => {
		showOrganizerModal.value = true;
	}, 2500);
}
function endHold() {
	if (holdTimeout) {
		clearTimeout(holdTimeout);
		holdTimeout = undefined;
	}
}
function setupOrganizerMode() {
	organizerMode.value = true;
	showOrganizerModal.value = false;
}
</script>

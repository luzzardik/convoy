<template>
	<div class="h-screen w-screen flex items-center justify-center">
		<div class="flex flex-col items-center w-sm space-y-6">
			<div class="size-16 rounded bg-primary text-primary-foreground flex items-center justify-center">
				<UserSearchIcon class="size-10" />
			</div>
			<div class="text-center">
				<h1 class="text-2xl font-heading font-bold text-primary">Convoy</h1>
				<h2>Observatoire</h2>
			</div>
			<div class="space-y-2 w-full">
				<Input type="password" placeholder="Mot de passe observateur" v-model="observerPassword" @keyup.enter="signAsObserver" />
				<Button class="w-full" size="lg" @click="signAsObserver" v-if="!observerLoading">S'identifier</Button>
				<Button class="w-full" disabled size="lg" v-else><Loader2Icon class="animate-spin" /> Identification en cours...</Button>
				<div v-if="observerError" class="text-destructive text-sm">{{ observerError ?? 'Une erreur est survenue.' }}</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import { Loader2Icon, UserSearchIcon } from '@lucide/vue';
const $sess = useSessionStore();

// Page meta
useSeoMeta({ title: 'Observatoire - Convoy' });

// Session check
onMounted(() => {
	$sess.fetch().then(() => {
		// Only redirect to observer dashboard if both server session exists AND the client-side observer token
		// is present (the token is required for websocket auth). This prevents redirect loops when cookie-only
		// server sessions exist but localStorage token is missing.
		const token = import.meta.client ? localStorage.getItem('convoy-observer-token') : null;
		if ($sess.has('observer') && token) navigateTo('/observer');
	});
});

// Observer sign in
const observerPassword = ref('');
const observerLoading = ref(false);
const observerError = ref<string | null>(null);
async function signAsObserver() {
	// Is loading ?
	if (observerLoading.value) return;
	observerLoading.value = true;
	observerError.value = null;

	// Is observer password populated ?
	if (observerPassword.value.trim().length == 0) {
		observerError.value = useErrorCode('observer_password_required');
		observerLoading.value = false;
		return;
	}

	// Sign in
	try {
		let _q = await fetch(`/api/observer/sign-in`, { method: 'POST', body: JSON.stringify({ password: observerPassword.value }), headers: { 'Content-Type': 'application/json' } }).then((_q) => _q.json());
		if (_q.error) throw _q.error;
		if (_q.token) localStorage.setItem('convoy-observer-token', _q.token);
		navigateTo('/observer');
	} catch (e) {
		console.error('An error occured whilst connecting to observer panel:', e);
		observerError.value = useErrorCode(typeof e == 'string' ? e : 'unexpected_issue');
		observerLoading.value = false;
	}
}
</script>

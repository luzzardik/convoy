<template>
	<div class="h-screen w-screen flex items-center justify-center">
		<div class="flex flex-col items-center w-sm space-y-6">
			<div class="size-16 rounded bg-primary text-primary-foreground flex items-center justify-center">
				<UserKeyIcon class="size-10" />
			</div>
			<div class="text-center">
				<h1 class="text-2xl font-heading font-bold text-primary">Convoy</h1>
				<h2>Administration</h2>
			</div>
			<div class="space-y-2 w-full">
				<Input type="password" placeholder="Mot de passe administrateur" v-model="adminPassword" @keyup.enter="signAsAdmin" />
				<Button class="w-full" size="lg" @click="signAsAdmin" v-if="!adminLoading">S'identifier</Button>
				<Button class="w-full" size="lg" disabled v-else><Loader2Icon class="animate-spin" /> Identification en cours...</Button>
				<div v-if="adminError" class="text-destructive text-sm">{{ adminError ?? 'Une erreur est survenue.' }}</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import { Loader2Icon, UserKeyIcon } from '@lucide/vue';
const $sess = useSessionStore();

// Page meta
useSeoMeta({ title: 'Administration - Convoy' });

// Session check
onMounted(() => {
	$sess.fetch().then(() => {
		if ($sess.has('admin')) navigateTo('/admin');
	});
});

// Admin sign in
const adminPassword = ref('');
const adminLoading = ref(false);
const adminError = ref<string | null>(null);
async function signAsAdmin() {
	// Is loading ?
	if (adminLoading.value) return;

	// Is admin password populated ?
	if (adminPassword.value.trim().length == 0) {
		adminError.value = useErrorCode('admin_password_required');
		return;
	}

	// Sign in
	try {
		let _q = await fetch(`/api/admin/sign-in`, { method: 'POST', body: JSON.stringify({ password: adminPassword.value }), headers: { 'Content-Type': 'application/json' } }).then((_q) => _q.json());
		if (_q.error) throw _q.error;
		navigateTo('/admin');
	} catch (e) {
		console.error('An error occured whilst connecting to admin panel:', e);
		adminError.value = useErrorCode(typeof e == 'string' ? e : 'unexpected_issue');
		adminLoading.value = false;
	}
}
</script>

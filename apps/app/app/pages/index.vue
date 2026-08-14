<template>
	<div class="h-screen w-screen flex items-center justify-center">
		<div class="flex flex-col items-center w-sm space-y-6">
			<div class="size-16 rounded bg-primary text-primary-foreground flex items-center justify-center">
				<CarIcon class="size-10" />
			</div>
			<div class="text-center">
				<h1 class="text-2xl font-heading font-bold text-primary">Convoy</h1>
				<h2>Rejoindre un convoi</h2>
			</div>
			<div class="space-y-2 w-full">
				<Input type="text" placeholder="Code du convoi" v-model="convoyCode" @keyup.enter="joinConvoy" />
				<Button class="w-full" size="lg" @click="joinConvoy">Rejoindre</Button>
				<div v-if="convoyError" class="text-destructive text-sm">{{ convoyError ?? 'Une erreur est survenue.' }}</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// Imports
import { CarIcon } from '@lucide/vue';

// Convoy joining
const convoyCode = ref('');
const convoyLoading = ref(false);
const convoyError = ref<string | null>(null);
async function joinConvoy() {
	// Is loading ?
	if (convoyLoading.value) return;

	// Is convoy code populated ?
	if (convoyCode.value.trim().length == 0) {
		convoyError.value = useErrorCode('convoy_code_required');
		return;
	}

	// Fetch convoy
	try {
		let _q = await fetch(`/api/convoy/${convoyCode.value}`).then((_q) => _q.json());
		if (_q.error) throw _q.error;
		// Can join?
		if (_q.status !== 'READY' && _q.status !== 'ACTIVE') {
			convoyError.value = useErrorCode('convoy_unavailable');
			convoyLoading.value = false;
			return;
		}
		// Send to join page
		navigateTo('/join/' + convoyCode.value);
	} catch (e) {
		console.error('An error occured whilst verifying convoy:', e);
		convoyError.value = useErrorCode(typeof e == 'string' ? e : 'unexpected_issue');
		convoyLoading.value = false;
	}
}
</script>

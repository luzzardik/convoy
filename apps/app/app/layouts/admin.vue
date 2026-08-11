<template>
	<div class="bg-primary h-12 w-full flex items-center px-3 gap-1">
		<div class="flex items-center gap-2 text-primary-foreground mr-10">
			<div class="size-9 flex items-center justify-center bg-secondary text-secondary-foreground rounded">
				<CarIcon class="size-6" />
			</div>
			<div>
				<div class="font-heading font-bold -mt-0.5">Convoy</div>
				<div class="text-sm -mt-1.5">Administration</div>
			</div>
		</div>
		<Button v-for="item in nav" :variant="item.active ? 'secondary' : 'ghost-primary'" :size="item.name == '' ? 'icon' : 'default'" :class="{ 'pointer-events-none': item.active }" asChild>
			<NuxtLink :to="item.href" class="flex items-center gap-1"><component :is="item.icon" /> {{ item.name }}</NuxtLink>
		</Button>
	</div>
	<div style="height: calc(100vh - calc(12 * var(--spacing)))" class="w-full overflow-auto">
		<slot />
	</div>
</template>

<script setup lang="ts">
// Imports
import { CarFrontIcon, CarIcon, LayoutDashboardIcon } from '@lucide/vue';
const $route = useRoute();

// Nav
const nav = computed(() => {
	return [
		{ icon: LayoutDashboardIcon, name: '', href: '/admin', active: false },
		{ icon: CarFrontIcon, name: 'Convois', href: '/admin/convoys', active: false },
	].map((r) => {
		r.active = $route.matched.some((m) => m.path == r.href);
		return r;
	});
});
</script>

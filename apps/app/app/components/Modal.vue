<template>
	<div class="bg-black/20 backdrop-blur h-screen w-screen fixed top-0 left-0 z-10">
		<div :class="['mt-12 mx-auto bg-background rounded-lg shadow border max-h-[80vh] overflow-auto animate-in fade-in zoom-in', props.wide === true ? 'max-w-[80%]' : 'max-w-124']">
			<slot />
		</div>
	</div>
</template>

<script setup>
const props = defineProps(['wide']);
</script>

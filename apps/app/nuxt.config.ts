// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite';
export default defineNuxtConfig({
	// Developement & Nuxt configuration
	compatibilityDate: '2025-07-15',

	devtools: { enabled: true },

	// Assets
	css: ['~/assets/style.css'],

	// Vite
	vite: {
		plugins: [tailwindcss()],
	},

	// Modules
	modules: ['shadcn-nuxt'],
	shadcn: {
		prefix: '',
	},
});

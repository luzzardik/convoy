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
		server: {
			proxy: {
				'/api/osrm': { target: 'http://loalhost:5000', changeOrigin: true },
			},
		},
	},

	// Modules
	modules: ['shadcn-nuxt', '@pinia/nuxt', 'nuxt-maplibre'],
	shadcn: {
		prefix: '',
	},
});

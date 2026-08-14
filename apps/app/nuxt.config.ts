// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite';
export default defineNuxtConfig({
	// Developement & Nuxt configuration
	compatibilityDate: '2025-07-15',

	devtools: { enabled: false },

	// Assets
	css: ['~/assets/style.css'],

	// Vite
	vite: {
		plugins: [tailwindcss()],
		server: {
			proxy: {
				'/api/osrm': { target: 'http://localhost:5000', changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/osrm/, '') },
			},
		},
	},

	// Modules
	modules: ['shadcn-nuxt', '@pinia/nuxt', 'nuxt-maplibre'],
	shadcn: {
		prefix: '',
	},

	// Route rules
	routeRules: {
		'/navigate': { ssr: false },
		'/admin/convoys': { ssr: false },
		'/admin/convoys/**': { ssr: false },
	},

	// Nitro (WS)
	nitro: {
		experimental: {
			websocket: true,
		},
	},
});

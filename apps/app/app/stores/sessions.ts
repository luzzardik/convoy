// Imports
import { defineStore } from 'pinia';

// SessionsCheck
export type SessionsCheck = { admin: boolean; observer: boolean; convoy: boolean };

// Sessions store
export const useSessionStore = defineStore('sessions', () => {
	const data = ref<SessionsCheck>({ admin: false, observer: false, convoy: false });

	async function fetchSessions() {
		try {
			let _q = await useRequestFetch()('/api/check-sessions');
			data.value = _q;
		} catch (e) {
			console.error('Something went wrong whilst fetching sessions', e);
			data.value = { admin: false, observer: false, convoy: false };
		}
	}

	function hasSession(session: keyof SessionsCheck) {
		return data.value[session] === true;
	}

	return { data, fetch: fetchSessions, has: hasSession };
});

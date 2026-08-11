// Imports
import type { SessionsCheck } from '~/stores/sessions';

// SignInPages
const SignInPages: Record<keyof SessionsCheck, string> = {
	admin: '/admin/sign-in',
	observer: '/observer/sign-in',
	convoy: '/',
};

// Middleware
export default defineNuxtRouteMiddleware(async (to) => {
	if (typeof to.meta.requireSession == 'string') {
		const $sess = useSessionStore();
		await $sess.fetch();
		if (!$sess.has(to.meta.requireSession as any)) return navigateTo(SignInPages[to.meta.requireSession as keyof SessionsCheck] ?? '/');
	}
});

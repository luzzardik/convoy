// Imports
import { verifyToken } from '../utils/tokens';

// App Domain
const { APP_DOMAIN } = process.env;

// Handle event
export default defineEventHandler(async (event) => {
	return {
		admin: await verifyToken(getCookie(event, 'cast'), 'convoy-admin:' + APP_DOMAIN),
		observer: await verifyToken(getCookie(event, 'cost'), 'convoy-observer:' + APP_DOMAIN),
		convoy: false, // TODO
	};
});

import { redirect } from '@sveltejs/kit';
import { currentSession, SESSION_COOKIE, authConfig } from '#lib/server/auth/index.ts';
import { savedAccounts, withoutAccount, writeSaved } from '#lib/server/auth/saved.ts';
import type { RequestHandler } from './$types';

// POST only, so a link or image elsewhere can't sign someone out.
export const POST: RequestHandler = async ({ cookies }) => {
	// Signing out also takes the account off this device's kept accounts (see saved.ts).
	const auth = authConfig();
	const session = await currentSession(cookies);
	if (session && auth.mode === 'on') {
		const saved = await savedAccounts(cookies, auth.sessionSecret);
		if (saved.length) writeSaved(cookies, withoutAccount(saved, session.email));
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/anmelden');
};

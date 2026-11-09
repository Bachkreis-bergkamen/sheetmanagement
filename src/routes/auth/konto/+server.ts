import { error, redirect } from '@sveltejs/kit';
import { authConfig, SESSION_COOKIE } from '#lib/server/auth/index.ts';
import { safeReturnPath } from '#lib/server/auth/redirect.ts';
import { sameEmail, savedAccounts, withAccount, withoutAccount, writeSaved } from '#lib/server/auth/saved.ts';
import { SESSION_DAYS, verifySession } from '#lib/server/auth/session.ts';
import { isDemo } from '#lib/server/env.ts';
import type { RequestHandler } from './$types';

/**
 * Switching between accounts kept on this device (see saved.ts). POST only, like signing out.
 * - "hinzufuegen": keeps the current account, signs out and opens the sign-in for another one.
 * - "wechseln": makes a kept account the active one.
 * - "vergessen": removes a kept account from this device.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const auth = authConfig();
	if (auth.mode !== 'on' || auth.problems.length || isDemo()) error(404);
	const data = await request.formData();
	const action = String(data.get('aktion') ?? '');
	const email = String(data.get('email') ?? '');
	const secret = auth.sessionSecret;
	let saved = await savedAccounts(cookies, secret);
	const currentToken = cookies.get(SESSION_COOKIE);
	const current = await verifySession(currentToken, secret);
	// The active account is always kept once a second one is in play.
	if (current && currentToken) saved = withAccount(saved, { email: current.email, name: current.name, token: currentToken });

	if (action === 'hinzufuegen') {
		writeSaved(cookies, saved);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/anmelden');
	}
	if (action === 'wechseln') {
		const target = saved.find((account) => sameEmail(account.email, email));
		if (!target) {
			writeSaved(cookies, saved);
			redirect(303, '/anmelden');
		}
		// Newest last: the list shows the accounts used most recently at the end.
		writeSaved(cookies, withAccount(saved, target));
		// The token carries its own expiry; the cookie may outlive it harmlessly.
		cookies.set(SESSION_COOKIE, target.token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 86_400 });
		redirect(303, safeReturnPath(String(data.get('weiter') ?? '/')));
	}
	if (action === 'vergessen') {
		if (current && sameEmail(current.email, email)) error(400);
		saved = withoutAccount(saved, email);
		// Only the active one left: nothing to switch between any more.
		writeSaved(cookies, saved.length > 1 ? saved : []);
		redirect(303, current ? '/profil#konten' : '/anmelden');
	}
	error(400);
};

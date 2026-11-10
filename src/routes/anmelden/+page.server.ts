import { fail, redirect } from '@sveltejs/kit';
import { signInWithPassword } from '#lib/server/auth/accounts.ts';
import { authConfig, startSession } from '#lib/server/auth/index.ts';
import { savedAccounts } from '#lib/server/auth/saved.ts';
import { safeReturnPath } from '#lib/server/auth/redirect.ts';
import { mailReady } from '#lib/server/mail/index.ts';
import { looksLikeEmail } from '#lib/server/mail/sign-in.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const auth = authConfig();
	if (auth.mode === 'off') redirect(303, '/');
	const returnTo = safeReturnPath(url.searchParams.get('weiter'));
	if (locals.access.member) redirect(303, returnTo);
	return {
		returnTo,
		error: url.searchParams.get('fehler'),
		// Setting names only, no values: safe to show, and they help whoever sets up the app.
		problems: auth.problems.filter((problem) => !problem.startsWith('BOOTSTRAP_ADMINS')),
		google: auth.google,
		// Signing up and "forgot password" need a link by email, so an account that sends mail.
		mail: !auth.problems.length && (await mailReady()),
		// Accounts kept on this device (saved.ts): one tap back into them.
		accounts: auth.problems.length ? [] : (await savedAccounts(cookies, auth.sessionSecret)).map(({ email, name }) => ({ email, name }))
	};
};

export const actions: Actions = {
	/** Email and password. Every failure gets the same answer, so nobody learns who has an account. */
	password: async ({ request, cookies, getClientAddress }) => {
		const auth = authConfig();
		if (auth.mode === 'off' || auth.problems.length) return fail(404, { passwordError: 'failed' as const });
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const returnTo = safeReturnPath(String(data.get('weiter') ?? ''));
		if (!looksLikeEmail(email) || email.length > 200) return fail(400, { passwordError: 'wrong' as const, email });
		let result;
		try {
			result = await signInWithPassword(email, password, getClientAddress());
		} catch (cause) {
			console.error('Password sign-in failed:', cause);
			return fail(503, { passwordError: 'failed' as const, email });
		}
		if (result.state === 'limited') return fail(429, { passwordError: 'limited' as const, email });
		if (result.state === 'wrong') return fail(400, { passwordError: 'wrong' as const, email });
		await startSession(cookies, auth.sessionSecret, { email: result.email, name: result.name, pw: result.stamp });
		redirect(303, returnTo);
	}
};

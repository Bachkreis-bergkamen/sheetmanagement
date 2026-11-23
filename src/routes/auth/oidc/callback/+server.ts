import { error, redirect } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { SignInError } from '#lib/server/auth/google.ts';
import { authConfig, startSession } from '#lib/server/auth/index.ts';
import { discover, OIDC_STATE_COOKIE, signIn } from '#lib/server/auth/oidc.ts';
import { safeReturnPath } from '#lib/server/auth/redirect.ts';
import type { RequestHandler } from './$types';

/** Back from the provider (#190): the code becomes a session for the address it vouches for. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const auth = authConfig();
	if (auth.mode === 'off' || !auth.oidc) error(404, t.messages.signInOff);

	let expected: { state?: string; nonce?: string; verifier?: string; returnTo?: string } = {};
	try {
		expected = JSON.parse(cookies.get(OIDC_STATE_COOKIE) ?? '{}');
	} catch {
		// A broken cookie is treated like a missing one.
	}
	cookies.delete(OIDC_STATE_COOKIE, { path: '/auth/oidc' });

	const code = url.searchParams.get('code');
	if (url.searchParams.get('error') || !code) redirect(303, '/anmelden?fehler=abgebrochen');
	if (!expected.state || !expected.nonce || !expected.verifier || expected.state !== url.searchParams.get('state')) redirect(303, '/anmelden?fehler=abgelaufen');

	let user;
	try {
		const provider = await discover(auth.oidc.issuer);
		user = await signIn(provider, auth.oidc, { code, verifier: expected.verifier, nonce: expected.nonce, redirectUri: `${url.origin}/auth/oidc/callback` });
	} catch (cause) {
		console.error('OIDC sign-in failed:', cause);
		redirect(303, `/anmelden?fehler=${cause instanceof SignInError ? 'oidc-konto' : 'oidc'}`);
	}

	await startSession(cookies, auth.sessionSecret, user);
	redirect(303, safeReturnPath(expected.returnTo));
};

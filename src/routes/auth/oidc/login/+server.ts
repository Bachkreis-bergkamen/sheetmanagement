import { error, redirect } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { authConfig } from '#lib/server/auth/index.ts';
import { authorizationUrl, discover, OIDC_STATE_COOKIE } from '#lib/server/auth/oidc.ts';
import { safeReturnPath } from '#lib/server/auth/redirect.ts';
import { randomToken } from '#lib/server/auth/session.ts';
import type { RequestHandler } from './$types';

/** "Mit {Schule} anmelden" (#190): to the provider's sign-in page. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const auth = authConfig();
	if (auth.mode === 'off' || !auth.oidc) error(404, t.messages.signInOff);
	if (auth.problems.length) error(503, auth.problems.join(' '));
	let provider;
	try {
		provider = await discover(auth.oidc.issuer);
	} catch (cause) {
		console.error('Reading the OIDC provider failed:', cause);
		redirect(303, '/anmelden?fehler=oidc');
	}
	// The state ties the answer to this browser, the nonce to this sign-in, the verifier to this code (PKCE).
	const expected = { state: randomToken(), nonce: randomToken(), verifier: randomToken(32), returnTo: safeReturnPath(url.searchParams.get('weiter')) };
	cookies.set(OIDC_STATE_COOKIE, JSON.stringify(expected), { path: '/auth/oidc', httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 });
	const target = await authorizationUrl(provider, { clientId: auth.oidc.clientId, redirectUri: `${url.origin}/auth/oidc/callback` }, expected);
	redirect(303, target, { external: [new URL(target).origin] });
};

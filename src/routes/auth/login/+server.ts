import { error, redirect } from '@sveltejs/kit';
import { authConfig, requireRight, STATE_COOKIE } from '#lib/server/auth/index.ts';
import { authorizationUrl, GOOGLE_SIGN_IN_ORIGIN } from '#lib/server/auth/google.ts';
import { safeReturnPath } from '#lib/server/auth/redirect.ts';
import { randomToken } from '#lib/server/auth/session.ts';
import type { RequestHandler } from './$types';
import { t } from '#lib/i18n/index.ts';

export const GET: RequestHandler = ({ url, cookies, locals }) => {
	const auth = authConfig();
	if (auth.mode === 'off' || !auth.google) error(404, t.messages.signInOff);
	if (auth.problems.length) error(503, auth.problems.join(' '));
	// ?zweck=mail: an admin connects the account that sends email (#123), from /status;
	// ?zweck=drive: the account new uploads belong to (#193).
	const zweck = url.searchParams.get('zweck');
	const purpose = zweck === 'mail' || zweck === 'drive' ? zweck : undefined;
	if (purpose) requireRight(locals, 'mitglieder.verwalten');

	// The state ties Google's answer to this browser (CSRF protection for the callback).
	const state = randomToken();
	const returnTo = purpose ? '/status' : safeReturnPath(url.searchParams.get('weiter'));
	cookies.set(STATE_COOKIE, JSON.stringify({ state, returnTo, ...(purpose ? { purpose } : {}) }), {
		path: '/auth',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 10 * 60
	});
	redirect(303, authorizationUrl({ clientId: auth.clientId, redirectUri: `${url.origin}/auth/callback` }, state, { purpose }), {
		external: [GOOGLE_SIGN_IN_ORIGIN]
	});
};

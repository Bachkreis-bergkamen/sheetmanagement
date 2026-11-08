import { error, redirect } from '@sveltejs/kit';
import { authConfig, startSession, STATE_COOKIE, type AuthConfig } from '#lib/server/auth/index.ts';
import { readIdToken, signIn, SignInError } from '#lib/server/auth/google.ts';
import { connectDrive, DRIVE_SCOPE } from '#lib/server/drive-account.ts';
import { connectMail } from '#lib/server/mail/index.ts';
import { exchangeMailCode, GMAIL_SEND_SCOPE } from '#lib/server/mail/gmail.ts';
import { safeReturnPath } from '#lib/server/auth/redirect.ts';
import type { RequestHandler } from './$types';
import { t } from '#lib/i18n/index.ts';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	const auth = authConfig();
	if (auth.mode === 'off' || !auth.google) error(404, t.messages.signInOff);

	let expected: { state?: string; returnTo?: string; purpose?: string } = {};
	try {
		expected = JSON.parse(cookies.get(STATE_COOKIE) ?? '{}');
	} catch {
		// A broken cookie is treated like a missing one.
	}
	cookies.delete(STATE_COOKIE, { path: '/auth' });

	// Cancelled on Google's page, or the link was opened in another browser.
	const code = url.searchParams.get('code');
	if (expected.purpose === 'mail') {
		if (!expected.state || expected.state !== url.searchParams.get('state')) redirect(303, '/status?mail=abgelaufen');
		redirect(303, `/status?mail=${await connectMailAccount(auth, code, url.origin, locals)}`);
	}
	if (expected.purpose === 'drive') {
		if (!expected.state || expected.state !== url.searchParams.get('state')) redirect(303, '/status?drive=abgelaufen');
		redirect(303, `/status?drive=${await connectDriveAccount(auth, code, url.origin, locals)}`);
	}
	if (url.searchParams.get('error') || !code) redirect(303, '/anmelden?fehler=abgebrochen');
	if (!expected.state || expected.state !== url.searchParams.get('state')) redirect(303, '/anmelden?fehler=abgelaufen');

	let user;
	try {
		user = await signIn({ clientId: auth.clientId, clientSecret: auth.clientSecret, redirectUri: `${url.origin}/auth/callback` }, code);
	} catch (cause) {
		console.error('Google sign-in failed:', cause);
		redirect(303, `/anmelden?fehler=${cause instanceof SignInError ? 'konto' : 'google'}`);
	}

	await startSession(cookies, auth.sessionSecret, user);
	redirect(303, safeReturnPath(expected.returnTo));
};

/**
 * The account that sends email (#123), back from Google's consent page. Only an admin may
 * connect it, and the session stays theirs: this sign-in only hands the app the permission.
 */
async function connectMailAccount(auth: Extract<AuthConfig, { mode: 'on' }>, code: string | null, origin: string, locals: App.Locals): Promise<string> {
	if (!locals.access.rights.has('mitglieder.verwalten')) return 'recht';
	if (!code) return 'abgebrochen';
	try {
		const tokens = await exchangeMailCode({ clientId: auth.clientId, clientSecret: auth.clientSecret, redirectUri: `${origin}/auth/callback` }, code);
		if (!tokens.scope.split(' ').includes(GMAIL_SEND_SCOPE)) return 'erlaubnis';
		const { email } = readIdToken(tokens.idToken, auth.clientId);
		await connectMail({ email, refreshToken: tokens.refreshToken, origin, connectedAt: new Date().toISOString() });
		return 'verbunden';
	} catch (cause) {
		console.error('Connecting the mail account failed:', cause);
		return 'fehler';
	}
}

/** The account new uploads belong to (#193), back from Google's consent page. Like the mail account, only an admin connects it. */
async function connectDriveAccount(auth: Extract<AuthConfig, { mode: 'on' }>, code: string | null, origin: string, locals: App.Locals): Promise<string> {
	if (!locals.access.rights.has('mitglieder.verwalten')) return 'recht';
	if (!code) return 'abgebrochen';
	try {
		const tokens = await exchangeMailCode({ clientId: auth.clientId, clientSecret: auth.clientSecret, redirectUri: `${origin}/auth/callback` }, code);
		if (!tokens.scope.split(' ').includes(DRIVE_SCOPE)) return 'erlaubnis';
		const { email } = readIdToken(tokens.idToken, auth.clientId);
		await connectDrive({ email, refreshToken: tokens.refreshToken, connectedAt: new Date().toISOString() });
		return 'verbunden';
	} catch (cause) {
		console.error('Connecting the Drive account failed:', cause);
		return 'fehler';
	}
}

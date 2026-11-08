import { describe, expect, it } from 'vitest';
import { isRedirect, redirect } from '@sveltejs/kit';
import { authorizationUrl, GOOGLE_SIGN_IN_ORIGIN, readIdToken, signIn, SignInError } from './google.ts';
import { signInForced, signInRequired } from './index.ts';
import { safeReturnPath } from './redirect.ts';
import { base64url, signSession, verifySession } from './session.ts';

const SECRET = 'x'.repeat(40);
const NOW = Date.UTC(2026, 9, 18);
const session = { email: 'anna@example.org', name: 'Anna', exp: NOW / 1000 + 3600 };

describe('session cookies', () => {
	it('round-trips a valid session', async () => {
		const cookie = await signSession(session, SECRET);
		expect(await verifySession(cookie, SECRET, NOW)).toEqual(session);
	});

	it('rejects a changed payload, another secret, expiry and garbage', async () => {
		const cookie = await signSession(session, SECRET);
		const [, signature] = cookie.split('.');
		const forged = `${base64url(new TextEncoder().encode(JSON.stringify({ ...session, email: 'boss@example.org' })))}.${signature}`;
		expect(await verifySession(forged, SECRET, NOW)).toBeNull();
		expect(await verifySession(cookie, 'y'.repeat(40), NOW)).toBeNull();
		expect(await verifySession(cookie, SECRET, NOW + 2 * 3600 * 1000)).toBeNull();
		expect(await verifySession('nonsense', SECRET, NOW)).toBeNull();
		expect(await verifySession('a.b.c', SECRET, NOW)).toBeNull();
		expect(await verifySession(undefined, SECRET, NOW)).toBeNull();
	});

	it("keeps a password session's stamp, and refuses one that isn't text", async () => {
		const withStamp = { ...session, pw: 'stamp-1' };
		expect(await verifySession(await signSession(withStamp, SECRET), SECRET, NOW)).toEqual(withStamp);
		const odd = { ...session, pw: 3 } as unknown as typeof withStamp;
		expect(await verifySession(await signSession(odd, SECRET), SECRET, NOW)).toBeNull();
	});
});

describe('FORCE_AUTH', () => {
	it('true turns sign-in on without Google, false turns it off', () => {
		expect(['true', ' YES ', '1', 'on'].map(signInRequired)).toEqual([true, true, true, true]);
		expect([undefined, '', 'false'].map(signInRequired)).toEqual([false, false, false]);
		expect(signInForced('false')).toBe(false);
		expect(signInForced(undefined)).toBe(true);
	});
});

const token = (claims: Record<string, unknown>) =>
	`header.${base64url(new TextEncoder().encode(JSON.stringify(claims)))}.signature`;
const good = {
	iss: 'https://accounts.google.com',
	aud: 'client-1',
	exp: NOW / 1000 + 600,
	email: 'Anna@Example.org',
	email_verified: true,
	name: 'Anna Beispiel'
};

describe('Google sign-in', () => {
	it('builds the authorization URL with the basic scopes', () => {
		const url = new URL(authorizationUrl({ clientId: 'client-1', redirectUri: 'https://app.example/auth/callback' }, 'st'));
		expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
		expect(url.searchParams.get('scope')).toBe('openid email profile');
		expect(url.searchParams.get('state')).toBe('st');
		expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/auth/callback');
	});

	it('asks one account for Drive or Gmail, with a refresh token', () => {
		const client = { clientId: 'client-1', redirectUri: 'https://app.example/auth/callback' };
		const drive = new URL(authorizationUrl(client, 'st', { purpose: 'drive' })).searchParams;
		expect(drive.get('scope')).toBe('openid email https://www.googleapis.com/auth/drive');
		expect(drive.get('access_type')).toBe('offline');
		expect(drive.get('prompt')).toBe('select_account consent');
		expect(new URL(authorizationUrl(client, 'st', { purpose: 'mail' })).searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/gmail.send');
	});

	// SvelteKit 3 refuses external redirects unless allowed; that once broke sign-in with a 500.
	it('redirects to Google with the allowed origin', () => {
		const target = authorizationUrl({ clientId: 'client-1', redirectUri: 'https://app.example/auth/callback' }, 'st');
		let thrown: unknown;
		try {
			redirect(303, target, { external: [GOOGLE_SIGN_IN_ORIGIN] });
		} catch (error) {
			thrown = error;
		}
		expect(isRedirect(thrown)).toBe(true);
	});

	it('reads a valid ID token and lower-cases the email', () => {
		expect(readIdToken(token(good), 'client-1', NOW)).toEqual({ email: 'anna@example.org', name: 'Anna Beispiel' });
	});

	it.each([
		['another audience', { aud: 'client-2' }],
		['another issuer', { iss: 'https://evil.example' }],
		['an expired token', { exp: NOW / 1000 - 1 }],
		['an unverified email', { email_verified: false }]
	])('rejects %s', (_, change) => {
		expect(() => readIdToken(token({ ...good, ...change }), 'client-1', NOW)).toThrow(SignInError);
	});

	it('exchanges the code at the token endpoint', async () => {
		let body = '';
		const fakeFetch = (async (_url: string, init: RequestInit) => {
			body = String(init.body);
			return new Response(JSON.stringify({ id_token: token(good) }));
		}) as typeof fetch;
		const user = await signIn({ clientId: 'client-1', clientSecret: 's', redirectUri: 'https://app.example/auth/callback' }, 'code-1', fakeFetch, NOW);
		expect(user.email).toBe('anna@example.org');
		expect(new URLSearchParams(body).get('code')).toBe('code-1');
		expect(new URLSearchParams(body).get('grant_type')).toBe('authorization_code');
	});
});

describe('safeReturnPath', () => {
	it.each([
		['/kalender/abc?x=1', '/kalender/abc?x=1'],
		['https://evil.example', '/'],
		['//evil.example', '/'],
		['/\\evil.example', '/'],
		[null, '/']
	])('%j → %j', (input, expected) => {
		expect(safeReturnPath(input)).toBe(expected);
	});
});

describe('FORCE_AUTH', () => {
	it.each([
		[undefined, true],
		['', true],
		['true', true],
		['false', false],
		[' FALSE ', false],
		['0', false],
		['off', false],
		['no', false]
	])('%j → sign-in %s', (value, forced) => {
		expect(signInForced(value)).toBe(forced);
	});
});

import { beforeEach, describe, expect, it } from 'vitest';
import { base64url } from './session.ts';
import { SignInError } from './google.ts';
import { oidcProblems } from './index.ts';
import { authorizationUrl, codeChallenge, discover, forgetDiscovery, readIdToken, signIn, type OidcProvider } from './oidc.ts';

const ISSUER = 'https://login.school.example/realms/orchester';
const NOW = Date.UTC(2026, 10, 23, 12);

const token = (claims: Record<string, unknown>) => `e30.${base64url(new TextEncoder().encode(JSON.stringify(claims)))}.sig`;
const claims = (extra: Record<string, unknown> = {}) => ({ iss: ISSUER, aud: 'app', exp: NOW / 1000 + 300, nonce: 'n1', email: 'Mia@School.example', email_verified: true, name: 'Mia Beispiel', ...extra });
const expected = { issuer: ISSUER, clientId: 'app', nonce: 'n1', trustEmail: false };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const discovery = (extra: Record<string, unknown> = {}) => ({
	issuer: ISSUER,
	authorization_endpoint: `${ISSUER}/auth`,
	token_endpoint: `${ISSUER}/token`,
	...extra
});

describe('OpenID Connect sign-in (#190)', () => {
	beforeEach(forgetDiscovery);

	it('reads the provider once and refuses a document of another issuer', async () => {
		let reads = 0;
		const fetchImpl = (async (input: RequestInfo | URL) => {
			reads++;
			expect(String(input)).toBe(`${ISSUER}/.well-known/openid-configuration`);
			return json(discovery());
		}) as typeof fetch;
		const provider = await discover(`${ISSUER}/`, fetchImpl, NOW);
		expect(provider).toEqual({ issuer: ISSUER, authorizationEndpoint: `${ISSUER}/auth`, tokenEndpoint: `${ISSUER}/token`, secretInForm: false });
		await discover(ISSUER, fetchImpl, NOW + 1000);
		expect(reads).toBe(1);

		forgetDiscovery();
		await expect(discover(ISSUER, (async () => json(discovery({ issuer: 'https://evil.example' }))) as typeof fetch, NOW)).rejects.toThrow('another issuer');
		// The failure isn't kept: the next try reads again.
		await expect(discover(ISSUER, (async () => json(discovery())) as typeof fetch, NOW)).resolves.toMatchObject({ issuer: ISSUER });
		forgetDiscovery();
		await expect(discover(ISSUER, (async () => json(discovery({ token_endpoint: 'http://plain.example/token' }))) as typeof fetch, NOW)).rejects.toThrow('https');
	});

	it('sends the secret in the form only when the provider takes nothing else', async () => {
		const only = async (methods: string[]) => {
			forgetDiscovery();
			return (await discover(ISSUER, (async () => json(discovery({ token_endpoint_auth_methods_supported: methods }))) as typeof fetch, NOW)).secretInForm;
		};
		expect(await only(['client_secret_post'])).toBe(true);
		expect(await only(['client_secret_basic', 'client_secret_post'])).toBe(false);
	});

	it('asks with state, nonce and a PKCE challenge', async () => {
		const provider: OidcProvider = { issuer: ISSUER, authorizationEndpoint: `${ISSUER}/auth?kc=1`, tokenEndpoint: `${ISSUER}/token`, secretInForm: false };
		const url = new URL(await authorizationUrl(provider, { clientId: 'app', redirectUri: 'https://noten.example/auth/oidc/callback' }, { state: 's', nonce: 'n', verifier: 'v' }));
		expect(url.origin + url.pathname).toBe(`${ISSUER}/auth`);
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			// What the endpoint had stays.
			kc: '1',
			client_id: 'app',
			redirect_uri: 'https://noten.example/auth/oidc/callback',
			response_type: 'code',
			scope: 'openid email profile',
			state: 's',
			nonce: 'n',
			code_challenge: await codeChallenge('v'),
			code_challenge_method: 'S256'
		});
		// RFC 7636, appendix B.
		expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
	});

	it('exchanges the code with the verifier and the secret', async () => {
		const provider: OidcProvider = { issuer: ISSUER, authorizationEndpoint: `${ISSUER}/auth`, tokenEndpoint: `${ISSUER}/token`, secretInForm: false };
		let sent: { headers: Record<string, string>; body: URLSearchParams } | undefined;
		const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			sent = { headers: init!.headers as Record<string, string>, body: init!.body as URLSearchParams };
			return json({ id_token: token(claims()) });
		}) as typeof fetch;
		const user = await signIn(provider, { clientId: 'app', clientSecret: 'geh eim', trustEmail: false }, { code: 'c', verifier: 'v', nonce: 'n1', redirectUri: 'https://noten.example/auth/oidc/callback' }, fetchImpl, NOW);
		expect(user).toEqual({ email: 'mia@school.example', name: 'Mia Beispiel' });
		expect(sent!.headers.authorization).toBe(`Basic ${btoa('app:geh+eim')}`);
		expect(Object.fromEntries(sent!.body)).toEqual({ grant_type: 'authorization_code', code: 'c', redirect_uri: 'https://noten.example/auth/oidc/callback', code_verifier: 'v' });

		const refused = (async () => json({ error: 'invalid_grant' }, 400)) as typeof fetch;
		await expect(signIn(provider, { clientId: 'app', clientSecret: 's', trustEmail: false }, { code: 'c', verifier: 'v', nonce: 'n1', redirectUri: 'r' }, refused, NOW)).rejects.toThrow('invalid_grant');
	});

	it('checks issuer, audience, expiry, nonce and the address', () => {
		expect(readIdToken(token(claims({ iss: `${ISSUER}/` })), expected, NOW).email).toBe('mia@school.example');
		const refuses = (extra: Record<string, unknown>, message: string) => expect(() => readIdToken(token(claims(extra)), expected, NOW)).toThrow(message);
		refuses({ iss: 'https://evil.example' }, 'issuer');
		refuses({ aud: 'other' }, 'another client');
		// Several audiences: only when issued to us.
		refuses({ aud: ['app', 'other'] }, 'another client');
		expect(readIdToken(token(claims({ aud: ['app', 'other'], azp: 'app' })), expected, NOW).email).toBe('mia@school.example');
		refuses({ exp: NOW / 1000 - 1 }, 'expired');
		refuses({ nonce: 'n2' }, 'another sign-in');
		refuses({ email: undefined }, 'verified');
		refuses({ email_verified: false }, 'verified');
		expect(() => readIdToken('nope', expected, NOW)).toThrow(SignInError);
	});

	it('takes an address without email_verified only when told to, never one marked unverified', () => {
		const unmarked = token(claims({ email_verified: undefined }));
		expect(() => readIdToken(unmarked, expected, NOW)).toThrow('verified');
		expect(readIdToken(unmarked, { ...expected, trustEmail: true }, NOW).email).toBe('mia@school.example');
		expect(() => readIdToken(token(claims({ email_verified: false })), { ...expected, trustEmail: true }, NOW)).toThrow('verified');
	});

	it('names people by name, else first and last name, else their address', () => {
		expect(readIdToken(token(claims({ name: undefined, given_name: 'Mia', family_name: 'Beispiel' })), expected, NOW).name).toBe('Mia Beispiel');
		expect(readIdToken(token(claims({ name: ' ' })), expected, NOW).name).toBe('mia@school.example');
	});

	it('names what is missing in the settings', () => {
		const config = { issuer: ISSUER, clientId: 'app', clientSecret: 's', label: 'IServ', trustEmail: false };
		expect(oidcProblems(null)).toEqual([]);
		expect(oidcProblems(config)).toEqual([]);
		expect(oidcProblems({ ...config, issuer: 'http://school.example', clientSecret: '' })).toHaveLength(2);
		expect(oidcProblems({ ...config, clientId: '' }).join(' ')).toContain('OIDC_CLIENT_ID');
	});
});

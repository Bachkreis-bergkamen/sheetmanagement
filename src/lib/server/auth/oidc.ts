import { base64url, fromBase64url } from './session.ts';
import { SignInError } from './google.ts';

/**
 * Sign-in with one other OpenID Connect provider per deployment (#190): the school's account,
 * e.g. Microsoft 365 / Entra ID, IServ or Moodle with an OIDC plugin. Authorization code flow
 * with PKCE and a nonce, with plain fetch like Google's (google.ts). Members are matched by the
 * email address the provider vouches for, like every other way in.
 */

export interface OidcConfig {
	/** The issuer as configured, e.g. "https://login.microsoftonline.com/<tenant>/v2.0". */
	issuer: string;
	clientId: string;
	clientSecret: string;
	/** On the button: "Mit {label} anmelden". */
	label: string;
	/**
	 * Accept an address the provider doesn't mark as verified (no `email_verified` claim), as
	 * Entra ID and many school systems do: their addresses are given out by the school. Never
	 * one marked unverified.
	 */
	trustEmail: boolean;
}

/** What the app needs from the provider's discovery document. */
export interface OidcProvider {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	/** "client_secret_basic" unless the provider only takes the secret in the form. */
	secretInForm: boolean;
}

/** Where the provider's answer is checked: state, nonce and PKCE verifier, for ten minutes. */
export const OIDC_STATE_COOKIE = 'oidc_state';

const TIMEOUT_MS = 10_000;
/** The discovery document changes rarely: one read per instance and hour. */
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

const withoutSlash = (url: string) => url.replace(/\/+$/, '');

const discovered = new Map<string, { at: number; provider: Promise<OidcProvider> }>();

/** The provider's endpoints from `/.well-known/openid-configuration`, kept for an hour. */
export function discover(issuer: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init), now = Date.now()): Promise<OidcProvider> {
	const key = withoutSlash(issuer);
	const cached = discovered.get(key);
	if (cached && now - cached.at < DISCOVERY_TTL_MS) return cached.provider;
	const provider = readDiscovery(key, fetchImpl);
	discovered.set(key, { at: now, provider });
	// A failed read is tried again next time, not kept for an hour.
	provider.catch(() => discovered.delete(key));
	return provider;
}

/** Forgets what was discovered; for tests. */
export const forgetDiscovery = () => discovered.clear();

async function readDiscovery(issuer: string, fetchImpl: typeof fetch): Promise<OidcProvider> {
	const response = await fetchImpl(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
	const meta = (await response.json()) as Record<string, unknown>;
	const text = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : '');
	// The document must be the issuer's own (OpenID Connect Discovery 1.0, §4.3).
	if (withoutSlash(text('issuer')) !== issuer) throw new Error('OIDC discovery names another issuer');
	const authorizationEndpoint = text('authorization_endpoint');
	const tokenEndpoint = text('token_endpoint');
	if (!https(authorizationEndpoint) || !https(tokenEndpoint)) throw new Error('OIDC discovery without https endpoints');
	const methods = Array.isArray(meta.token_endpoint_auth_methods_supported) ? meta.token_endpoint_auth_methods_supported.map(String) : [];
	return {
		issuer: text('issuer'),
		authorizationEndpoint,
		tokenEndpoint,
		secretInForm: methods.length > 0 && !methods.includes('client_secret_basic') && methods.includes('client_secret_post')
	};
}

function https(url: string): boolean {
	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

/** The PKCE challenge for a verifier (RFC 7636, S256). */
export async function codeChallenge(verifier: string): Promise<string> {
	return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

/** The provider's sign-in page. */
export async function authorizationUrl(
	provider: OidcProvider,
	client: { clientId: string; redirectUri: string },
	{ state, nonce, verifier }: { state: string; nonce: string; verifier: string }
): Promise<string> {
	const url = new URL(provider.authorizationEndpoint);
	// Added to what the endpoint already has (OAuth 2.0, RFC 6749, §3.1).
	const params = {
		client_id: client.clientId,
		redirect_uri: client.redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state,
		nonce,
		code_challenge: await codeChallenge(verifier),
		code_challenge_method: 'S256'
	};
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return url.toString();
}

export interface OidcUser {
	email: string;
	name: string;
}

/** Exchanges the code from the redirect for the user's identity, checked against the nonce. */
export async function signIn(
	provider: OidcProvider,
	config: Pick<OidcConfig, 'clientId' | 'clientSecret' | 'trustEmail'>,
	{ code, verifier, nonce, redirectUri }: { code: string; verifier: string; nonce: string; redirectUri: string },
	fetchImpl: typeof fetch = (input, init) => fetch(input, init),
	now = Date.now()
): Promise<OidcUser> {
	const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
	const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
	if (provider.secretInForm) {
		form.set('client_id', config.clientId);
		form.set('client_secret', config.clientSecret);
	} else {
		// RFC 6749, §2.3.1: both parts form-encoded before they're joined.
		const part = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
		headers.authorization = `Basic ${btoa(`${part(config.clientId)}:${part(config.clientSecret)}`)}`;
	}
	const response = await fetchImpl(provider.tokenEndpoint, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
	const body = (await response.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
	if (!response.ok || !body.id_token) throw new SignInError(body.error_description ?? body.error ?? `Token request failed (${response.status})`);
	return readIdToken(body.id_token, { issuer: provider.issuer, clientId: config.clientId, nonce, trustEmail: config.trustEmail }, now);
}

/**
 * Reads the ID token's claims. Like Google's, its signature isn't checked: it comes straight from
 * the token endpoint over TLS, in exchange for the client secret (OpenID Connect Core 1.0,
 * §3.1.3.7). Issuer, audience, expiry, nonce and the address are.
 */
export function readIdToken(idToken: string, expected: { issuer: string; clientId: string; nonce: string; trustEmail: boolean }, now = Date.now()): OidcUser {
	let claims: Record<string, unknown>;
	try {
		claims = JSON.parse(new TextDecoder().decode(fromBase64url(idToken.split('.')[1] ?? '')));
	} catch {
		throw new SignInError('Unreadable ID token');
	}
	if (withoutSlash(String(claims.iss)) !== withoutSlash(expected.issuer)) throw new SignInError('ID token from an unexpected issuer');
	const audience = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
	if (!audience.includes(expected.clientId)) throw new SignInError('ID token for another client');
	// Several audiences: the token must have been issued to us (Core 1.0, §3.1.3.7, item 4–5).
	if (audience.length > 1 && claims.azp !== expected.clientId) throw new SignInError('ID token for another client');
	if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) throw new SignInError('ID token expired');
	if (claims.nonce !== expected.nonce) throw new SignInError('ID token for another sign-in');
	const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
	const verified = claims.email_verified === true || claims.email_verified === 'true' || (expected.trustEmail && claims.email_verified === undefined);
	if (!email || !verified) throw new SignInError('Account without a verified email address');
	const name = [claims.name, [claims.given_name, claims.family_name].filter((part) => typeof part === 'string' && part).join(' ')].find(
		(value): value is string => typeof value === 'string' && !!value.trim()
	);
	return { email, name: name?.trim() || email };
}

/**
 * Signed session cookies: "<payload>.<signature>", both base64url, signed with
 * HMAC-SHA256 and SESSION_SECRET. The cookie only says who someone is; what they
 * may do is looked up in the sheet on every request, so removing a member takes
 * effect at once.
 */

export interface Session {
	email: string;
	name: string;
	/** Expiry, seconds since the epoch. */
	exp: number;
	/** Signed in with a personal access link of this version; a newer version in the sheet ends the session. */
	link?: number;
	/** Signed in with a password; the account's stamp then. A new password changes it, which ends the session. */
	pw?: string;
}

export const SESSION_DAYS = 30;
const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array | ArrayBuffer): string {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Random url-safe string, e.g. for the OAuth state. */
export function randomToken(bytes = 24): string {
	return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function hmacKey(secret: string, usage: 'sign' | 'verify') {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signSession(session: Session, secret: string): Promise<string> {
	const payload = base64url(encoder.encode(JSON.stringify(session)));
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(payload));
	return `${payload}.${base64url(signature)}`;
}

/** The session, or null if the cookie is missing, tampered with or expired. */
export async function verifySession(
	cookie: string | undefined,
	secret: string,
	now = Date.now()
): Promise<Session | null> {
	if (!cookie) return null;
	const [payload, signature, ...rest] = cookie.split('.');
	if (!payload || !signature || rest.length) return null;
	try {
		// crypto.subtle.verify compares in constant time.
		const valid = await crypto.subtle.verify(
			'HMAC',
			await hmacKey(secret, 'verify'),
			fromBase64url(signature),
			encoder.encode(payload)
		);
		if (!valid) return null;
		const session = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as Session;
		if (typeof session.email !== 'string' || typeof session.exp !== 'number') return null;
		if (session.link !== undefined && !Number.isInteger(session.link)) return null;
		if (session.pw !== undefined && typeof session.pw !== 'string') return null;
		return session.exp * 1000 > now ? session : null;
	} catch {
		return null;
	}
}

/**
 * Other signed values, e.g. personal access links. The purpose is part of what's signed,
 * so a token made for one purpose is never accepted for another, nor as a session cookie.
 */
export async function signToken(purpose: string, data: object, secret: string): Promise<string> {
	const payload = base64url(encoder.encode(JSON.stringify(data)));
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(`${purpose}:${payload}`));
	return `${payload}.${base64url(signature)}`;
}

/** The token's data, or null if it's malformed or wasn't signed for this purpose. */
export async function verifyToken<T>(purpose: string, token: string | undefined, secret: string): Promise<T | null> {
	const [payload, signature, ...rest] = (token ?? '').split('.');
	if (!payload || !signature || rest.length) return null;
	try {
		const valid = await crypto.subtle.verify(
			'HMAC',
			await hmacKey(secret, 'verify'),
			fromBase64url(signature),
			encoder.encode(`${purpose}:${payload}`)
		);
		return valid ? (JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as T) : null;
	} catch {
		return null;
	}
}

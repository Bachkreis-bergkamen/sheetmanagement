import { authConfig } from './auth/index.ts';
import { base64url, fromBase64url } from './auth/session.ts';
import { getStore } from './db/index.ts';
import { isDemo } from './env.ts';

/**
 * A Google account an admin connects once on /status: the one that sends mail (#123), and the
 * archive's owner for new uploads (#193). Its refresh token is kept in the store, encrypted
 * with SESSION_SECRET; a new secret means connecting it again.
 */

/** Google sign-in, when accounts can be connected here at all: set up without problems, and not in the demo. */
export function connectableAuth() {
	const auth = authConfig();
	return auth.mode === 'on' && auth.google && !auth.problems.length && !isDemo() ? auth : null;
}

const encoder = new TextEncoder();

async function cryptoKey(secret: string) {
	// Named after the mail account, the first one kept; the Drive account's token is sealed the same way.
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`mail-account:${secret}`));
	return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal<T>(value: T, secret: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(secret), encoder.encode(JSON.stringify(value)));
	return `${base64url(iv)}.${base64url(data)}`;
}

export async function open<T>(sealed: string, secret: string): Promise<T | null> {
	const [iv, data] = sealed.split('.');
	if (!iv || !data) return null;
	try {
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64url(iv) }, await cryptoKey(secret), fromBase64url(data));
		return JSON.parse(new TextDecoder().decode(plain)) as T;
	} catch {
		// A new SESSION_SECRET: the account has to be connected again.
		return null;
	}
}

/**
 * The account kept under `key`. Read at most once per isolate and minute: every page with a
 * mail form or an upload asks.
 */
export function connectedAccount<T extends { refreshToken: string }>(key: string) {
	let cached: { at: number; value: T | null } | undefined;
	return {
		/** The account with its token; null while none is connected, or none can be. */
		async read(): Promise<T | null> {
			const auth = connectableAuth();
			if (!auth) return null;
			if (cached && Date.now() - cached.at < 60_000) return cached.value;
			const sealed = await getStore()
				.getState(key)
				.catch(() => null);
			const value = sealed ? await open<T>(sealed, auth.sessionSecret) : null;
			cached = { at: Date.now(), value };
			return value;
		},
		/** Keeps the account; the caller checked connectableAuth() first. */
		async save(account: T): Promise<void> {
			const auth = connectableAuth();
			if (!auth) throw new Error('Sign-in is not set up');
			await getStore().setState(key, await seal(account, auth.sessionSecret));
			cached = undefined;
		},
		async clear(): Promise<void> {
			await getStore().setState(key, '');
			cached = undefined;
		}
	};
}

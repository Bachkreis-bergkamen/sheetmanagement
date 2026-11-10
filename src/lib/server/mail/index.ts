import { authConfig } from '../auth/index.ts';
import { base64url, fromBase64url } from '../auth/session.ts';
import { getStore } from '../db/index.ts';
import { isDemo, orchestra } from '../env.ts';
import { accessToken, MailError, sendGmail } from './gmail.ts';

/**
 * Email (#123): sign-in links and reminders, sent from the orchestra's Google account. An
 * admin connects the account once on /status (Google asks for "send email on your behalf",
 * nothing else); the refresh token is kept in the store, encrypted with SESSION_SECRET.
 * Without a connected account nothing is sent and push (#157) stays the only channel.
 */

export { MailError } from './gmail.ts';

export interface MailAccount {
	email: string;
	/** The app's address when it was connected; jobs run without a request, but their mails need links. */
	origin: string;
	connectedAt: string;
}

interface Stored extends MailAccount {
	refreshToken: string;
}

const KEY = 'mail-account';
/** The last sending failure, for /status; cleared by the next mail that goes out. */
const ERROR_KEY = 'mail-error';
const encoder = new TextEncoder();

async function cryptoKey(secret: string) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`mail-account:${secret}`));
	return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts an account's refresh token for the store; also used for the Drive account (#193). */
export async function seal<T>(value: T, secret: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(secret), encoder.encode(JSON.stringify(value)));
	return `${base64url(iv)}.${base64url(data)}`;
}

export async function open<T = Stored>(sealed: string, secret: string): Promise<T | null> {
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

function client() {
	const auth = authConfig();
	return auth.mode === 'on' && auth.google && !auth.problems.length && !isDemo() ? auth : null;
}

// One read per isolate and minute; every page with a mail form asks.
let cached: { at: number; value: Stored | null } | undefined;
let token: { refreshToken: string; token: string; expiresAt: number } | undefined;

async function stored(): Promise<Stored | null> {
	const auth = client();
	if (!auth) return null;
	if (cached && Date.now() - cached.at < 60_000) return cached.value;
	const sealed = await getStore()
		.getState(KEY)
		.catch(() => null);
	const value = sealed ? await open(sealed, auth.sessionSecret) : null;
	cached = { at: Date.now(), value };
	return value;
}

/** The connected account, without its token; null while none is connected. */
export async function mailAccount(): Promise<MailAccount | null> {
	const account = await stored();
	return account ? { email: account.email, origin: account.origin, connectedAt: account.connectedAt } : null;
}

export const mailReady = async () => !!(await stored());

export async function connectMail(account: Stored): Promise<void> {
	const auth = client();
	if (!auth) throw new MailError('Sign-in is not set up');
	const store = getStore();
	await store.setState(KEY, await seal(account, auth.sessionSecret));
	await store.setState(ERROR_KEY, '');
	cached = undefined;
	token = undefined;
}

export async function disconnectMail(): Promise<void> {
	const store = getStore();
	await store.setState(KEY, '');
	await store.setState(ERROR_KEY, '');
	cached = undefined;
	token = undefined;
}

/** Why the last mail failed, if it did. */
export async function mailError(): Promise<string | null> {
	return (await getStore().getState(ERROR_KEY).catch(() => null)) || null;
}

/**
 * Sends one plain-text mail from the connected account. Returns whether it went out; a
 * failure is logged and kept for /status, never thrown, so one bad address doesn't stop a job.
 */
export async function sendMail(to: string, subject: string, text: string, fetchImpl?: typeof fetch): Promise<boolean> {
	const auth = client();
	const account = await stored();
	if (!auth || !account) return false;
	try {
		if (!token || token.refreshToken !== account.refreshToken || token.expiresAt - 120_000 < Date.now()) {
			token = { refreshToken: account.refreshToken, ...(await accessToken(auth, account.refreshToken, fetchImpl)) };
		}
		await sendGmail(token.token, { from: { name: orchestra().name, email: account.email }, to, subject, text }, fetchImpl);
		if (await mailError()) await getStore().setState(ERROR_KEY, '');
		return true;
	} catch (cause) {
		console.error('Sending a mail failed:', cause);
		token = undefined;
		const message = cause instanceof MailError && cause.revoked ? 'revoked' : cause instanceof Error ? cause.message : String(cause);
		await getStore()
			.setState(ERROR_KEY, message)
			.catch(() => {});
		return false;
	}
}

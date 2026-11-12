import { connectableAuth, connectedAccount } from '../connected-account.ts';
import { getStore } from '../db/index.ts';
import { orchestra } from '../env.ts';
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
const account = connectedAccount<Stored>(KEY);
let token: { refreshToken: string; token: string; expiresAt: number } | undefined;

/** The connected account, without its token; null while none is connected. */
export async function mailAccount(): Promise<MailAccount | null> {
	const stored = await account.read();
	return stored ? { email: stored.email, origin: stored.origin, connectedAt: stored.connectedAt } : null;
}

export const mailReady = async () => !!(await account.read());

export async function connectMail(stored: Stored): Promise<void> {
	if (!connectableAuth()) throw new MailError('Sign-in is not set up');
	await account.save(stored);
	await getStore().setState(ERROR_KEY, '');
	token = undefined;
}

export async function disconnectMail(): Promise<void> {
	await account.clear();
	await getStore().setState(ERROR_KEY, '');
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
	const auth = connectableAuth();
	const sender = await account.read();
	if (!auth || !sender) return false;
	try {
		if (!token || token.refreshToken !== sender.refreshToken || token.expiresAt - 120_000 < Date.now()) {
			token = { refreshToken: sender.refreshToken, ...(await accessToken(auth, sender.refreshToken, fetchImpl)) };
		}
		await sendGmail(token.token, { from: { name: orchestra().name, email: sender.email }, to, subject, text }, fetchImpl);
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

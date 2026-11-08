import { authConfig } from './auth/index.ts';
import { getStore } from './db/index.ts';
import { isDemo } from './env.ts';
import { GoogleClient } from './google/client.ts';
import { accessToken } from './mail/gmail.ts';
import { open, seal } from './mail/index.ts';

/**
 * The Google account new uploads belong to (#193). A service account has no storage of its
 * own (Google's quota for it is 0), so it can't own a new file in someone's "My Drive"; it
 * may only replace files people own. An admin connects the archive's owner once on /status
 * (Google asks for access to Drive); new parts are then uploaded as that account, owned by
 * it, as if uploaded by hand. The refresh token is kept in the store, encrypted like the
 * mail account's.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export interface DriveAccount {
	email: string;
	connectedAt: string;
}

interface Stored extends DriveAccount {
	refreshToken: string;
}

const KEY = 'drive-account';

function auth() {
	const config = authConfig();
	return config.mode === 'on' && config.google && !config.problems.length && !isDemo() ? config : null;
}

let cached: { at: number; value: Stored | null } | undefined;
let client: { refreshToken: string; client: GoogleClient } | undefined;

async function stored(): Promise<Stored | null> {
	const config = auth();
	if (!config) return null;
	if (cached && Date.now() - cached.at < 60_000) return cached.value;
	const sealed = await getStore()
		.getState(KEY)
		.catch(() => null);
	const value = sealed ? await open<Stored>(sealed, config.sessionSecret) : null;
	cached = { at: Date.now(), value };
	return value;
}

/** The connected account, without its token; null while none is connected. */
export async function driveAccount(): Promise<DriveAccount | null> {
	const account = await stored();
	return account ? { email: account.email, connectedAt: account.connectedAt } : null;
}

/** Whether accounts can be connected here at all: needs Google sign-in, and not in the demo. */
export const canConnectDrive = () => !!auth();

export async function connectDrive(account: Stored): Promise<void> {
	const config = auth();
	if (!config) throw new Error('Sign-in is not set up');
	await getStore().setState(KEY, await seal(account, config.sessionSecret));
	cached = undefined;
	client = undefined;
}

export async function disconnectDrive(): Promise<void> {
	await getStore().setState(KEY, '');
	cached = undefined;
	client = undefined;
}

/** A Google client acting as the connected account; null while none is connected. */
export async function driveAccountClient(): Promise<GoogleClient | null> {
	const config = auth();
	const account = await stored();
	if (!config || !account) return null;
	if (client?.refreshToken !== account.refreshToken) {
		let token: { token: string; expiresAt: number } | undefined;
		client = {
			refreshToken: account.refreshToken,
			client: new GoogleClient({
				async getToken({ forceRefresh = false } = {}) {
					if (forceRefresh || !token || token.expiresAt - 120_000 < Date.now()) token = await accessToken(config, account.refreshToken);
					return token.token;
				}
			})
		};
	}
	return client.client;
}

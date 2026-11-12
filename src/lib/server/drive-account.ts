import { connectableAuth, connectedAccount } from './connected-account.ts';
import { GoogleClient } from './google/client.ts';
import { accessToken } from './mail/gmail.ts';

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

const account = connectedAccount<Stored>('drive-account');
let client: { refreshToken: string; client: GoogleClient } | undefined;

/** The connected account, without its token; null while none is connected. */
export async function driveAccount(): Promise<DriveAccount | null> {
	const stored = await account.read();
	return stored ? { email: stored.email, connectedAt: stored.connectedAt } : null;
}

/** Whether accounts can be connected here at all: needs Google sign-in, and not in the demo. */
export const canConnectDrive = () => !!connectableAuth();

export async function connectDrive(stored: Stored): Promise<void> {
	await account.save(stored);
	client = undefined;
}

export async function disconnectDrive(): Promise<void> {
	await account.clear();
	client = undefined;
}

/** A Google client acting as the connected account; null while none is connected. */
export async function driveAccountClient(): Promise<GoogleClient | null> {
	const config = connectableAuth();
	const stored = await account.read();
	if (!config || !stored) return null;
	if (client?.refreshToken !== stored.refreshToken) {
		let token: { token: string; expiresAt: number } | undefined;
		client = {
			refreshToken: stored.refreshToken,
			client: new GoogleClient({
				async getToken({ forceRefresh = false } = {}) {
					if (forceRefresh || !token || token.expiresAt - 120_000 < Date.now()) token = await accessToken(config, stored.refreshToken);
					return token.token;
				}
			})
		};
	}
	return client.client;
}

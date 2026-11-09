import type { Cookies } from '@sveltejs/kit';
import { SESSION_DAYS, verifySession } from './session.ts';

/**
 * Several accounts on one device, e.g. an admin's own and a member's, or a shared tablet:
 * the signed session cookies of the accounts kept here, so switching needs no new sign-in.
 * Only once someone adds a second account; a plain sign-in keeps nothing. Each kept session
 * is checked like the active one (password stamp, access link), so a new password or a
 * revoked link still ends it.
 */
export const SAVED_COOKIE = 'konten';
/** Signed sessions are ~250 characters; a cookie holds about 4000. */
const MAX_SAVED = 5;
const SEPARATOR = '~';

export interface SavedAccount {
	email: string;
	name: string;
	token: string;
}

/** The kept accounts whose session is still valid, oldest first. */
export async function savedAccounts(cookies: Cookies, secret: string): Promise<SavedAccount[]> {
	const tokens = (cookies.get(SAVED_COOKIE) ?? '').split(SEPARATOR).filter(Boolean).slice(-MAX_SAVED);
	const accounts: SavedAccount[] = [];
	for (const token of tokens) {
		const session = await verifySession(token, secret);
		if (session && !accounts.some((account) => sameEmail(account.email, session.email))) {
			accounts.push({ email: session.email, name: session.name, token });
		}
	}
	return accounts;
}

export function writeSaved(cookies: Cookies, accounts: SavedAccount[]) {
	if (!accounts.length) {
		cookies.delete(SAVED_COOKIE, { path: '/' });
		return;
	}
	cookies.set(
		SAVED_COOKIE,
		accounts
			.slice(-MAX_SAVED)
			.map((account) => account.token)
			.join(SEPARATOR),
		{ path: '/', httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 86_400 }
	);
}

/** The list with this account added or renewed, last (newest). */
export function withAccount(accounts: SavedAccount[], account: SavedAccount): SavedAccount[] {
	return [...withoutAccount(accounts, account.email), account];
}

export function withoutAccount(accounts: SavedAccount[], email: string): SavedAccount[] {
	return accounts.filter((account) => !sameEmail(account.email, email));
}

export const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

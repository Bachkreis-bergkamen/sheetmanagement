import { normalizeEmail } from '#lib/access/access.ts';
import { getStore } from '../db/index.ts';
import { getAccessList } from '../repertoire.ts';
import { hashPassword, MAX_LENGTH, newStamp, verifyPassword } from './password.ts';

/**
 * Signing in with email and password, and setting a password. Wrong attempts are limited per
 * email (against guessing one person's password) and per IP (against trying many accounts);
 * an unknown email gets the same answer, after the same work, as a wrong password.
 */

const PER_EMAIL = 10;
// A whole rehearsal signing in on one WLAN shares one address.
const PER_IP = 100;
const WINDOW_MINUTES = 15;

export type PasswordSignIn = { state: 'ok'; email: string; name: string; stamp: string } | { state: 'wrong' } | { state: 'limited' };

/** Counts an attempt for this email and IP; true while both are within their limit. */
export async function withinAttempts(email: string, ip: string): Promise<boolean> {
	const store = getStore();
	const [perEmail, perIp] = await Promise.all([
		store.hit(`password-try:${normalizeEmail(email)}`, WINDOW_MINUTES),
		store.hit(`password-try-ip:${ip}`, WINDOW_MINUTES)
	]);
	return perEmail <= PER_EMAIL && perIp <= PER_IP;
}

export async function signInWithPassword(rawEmail: string, password: string, ip: string): Promise<PasswordSignIn> {
	const email = normalizeEmail(rawEmail);
	if (!(await withinAttempts(email, ip))) return { state: 'limited' };
	if (!password || password.length > MAX_LENGTH) {
		await verifyPassword(password.slice(0, MAX_LENGTH), null);
		return { state: 'wrong' };
	}
	const account = await getStore().accountOf(email);
	if (!(await verifyPassword(password, account?.passwordHash)) || !account) return { state: 'wrong' };
	const member = (await getAccessList())?.membersByEmail.get(email);
	return { state: 'ok', email, name: member?.name || email, stamp: account.stamp };
}

/** Sets a new password (making the account if needed) and returns the new stamp, which ends older sessions. */
export async function setPassword(rawEmail: string, password: string): Promise<string> {
	const email = normalizeEmail(rawEmail);
	const stamp = newStamp();
	await getStore().saveAccount({ email, passwordHash: await hashPassword(password), stamp });
	return stamp;
}

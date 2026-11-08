import { normalizeEmail } from '#lib/access/access.ts';
import { MAX_LENGTH } from '#lib/access/password-rules.ts';
import { base64url, fromBase64url, signToken, verifyToken } from './session.ts';

/**
 * Email and password sign-in. Passwords are kept only as PBKDF2-SHA256 hashes with a random
 * salt per account, in D1 (the "accounts" table), never in the sheet. Web Crypto only, so
 * nothing to install, and it runs the same on Workers and in Node.
 *
 * Every account has a "stamp", a random value that changes with each new password. Sessions
 * from a password sign-in carry it, so a new password ends every other session; and the
 * emailed links to set a password are bound to it, so each link works once.
 */

/** Workers allow at most 100,000 PBKDF2 iterations. Stored with each hash, so it can change later. */
export const ITERATIONS = 100_000;
export { MAX_LENGTH, MIN_LENGTH, passwordProblem, type PasswordProblem } from '#lib/access/password-rules.ts';
const SALT_BYTES = 16;
const HASH_BITS = 256;
const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS));
}

/** "pbkdf2-sha256$<iterations>$<salt>$<hash>", salt and hash base64url. */
export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	return `pbkdf2-sha256$${iterations}$${base64url(salt)}$${base64url(await derive(password, salt, iterations))}`;
}

/** Constant-time comparison, so the time taken says nothing about how much of the hash matched. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
	return difference === 0;
}

/** A hash to check against when there is no account, so an unknown email takes as long as a wrong password. */
let dummy: Promise<string> | undefined;

/** Whether the password matches the stored hash; without a hash it still does the work, and says no. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
	const parts = (stored ?? '').split('$');
	if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') {
		dummy ??= hashPassword('not a password');
		await verifyPassword(password, await dummy);
		return false;
	}
	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
	try {
		return sameBytes(await derive(password, fromBase64url(parts[2]), iterations), fromBase64url(parts[3]));
	} catch {
		return false;
	}
}

/** A new stamp for an account: changes with every password, never repeats. */
export const newStamp = () => base64url(crypto.getRandomValues(new Uint8Array(12)));

/**
 * The link in an email to set a password: for a new account, or a forgotten password. It holds
 * the email, an expiry and the account's stamp ("" without an account); setting a password
 * changes the stamp, which ends the link.
 */
const SET_PASSWORD = 'set-password';
export const SET_PASSWORD_MINUTES = 60;

interface SetPasswordData {
	e: string;
	/** Expiry, seconds since the epoch. */
	x: number;
	/** The account's stamp when the link was made. */
	s: string;
}

const seconds = (ms: number) => Math.floor(ms / 1000);

export const setPasswordToken = (email: string, stamp: string, secret: string, now = Date.now()) =>
	signToken(SET_PASSWORD, { e: normalizeEmail(email), x: seconds(now) + SET_PASSWORD_MINUTES * 60, s: stamp } satisfies SetPasswordData, secret);

/** The email and stamp of an unexpired link; whether the stamp is still the account's is for the caller to check. */
export async function readSetPasswordToken(token: string, secret: string, now = Date.now()): Promise<{ email: string; stamp: string } | null> {
	const data = await verifyToken<SetPasswordData>(SET_PASSWORD, token, secret);
	if (!data || typeof data.e !== 'string' || typeof data.x !== 'number' || typeof data.s !== 'string' || data.x < seconds(now)) return null;
	return { email: normalizeEmail(data.e), stamp: data.s };
}

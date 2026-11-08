import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, readSetPasswordToken, setPasswordToken, SET_PASSWORD_MINUTES, verifyPassword } from './password.ts';

const secret = 'x'.repeat(32);
const now = Date.parse('2026-11-08T10:00:00Z');

describe('passwords', () => {
	it('are kept as salted hashes that only the same password matches', async () => {
		const hash = await hashPassword('Geige spielt laut', 1000);
		expect(hash).toMatch(/^pbkdf2-sha256\$1000\$[\w-]+\$[\w-]+$/);
		expect(hash).not.toContain('Geige');
		expect(await verifyPassword('Geige spielt laut', hash)).toBe(true);
		expect(await verifyPassword('geige spielt laut', hash)).toBe(false);
		// A new salt each time: the same password never gives the same hash.
		expect(await hashPassword('Geige spielt laut', 1000)).not.toBe(hash);
	});

	it('say no without an account, or for a broken hash', async () => {
		expect(await verifyPassword('anything at all', null)).toBe(false);
		expect(await verifyPassword('anything at all', 'pbkdf2-sha256$1000$abc')).toBe(false);
		expect(await verifyPassword('anything at all', 'pbkdf2-sha256$99999999$abc$def')).toBe(false);
	});

	it('need ten characters and the same twice', () => {
		expect(passwordProblem('kurz', 'kurz')).toBe('short');
		expect(passwordProblem('x'.repeat(201), 'x'.repeat(201))).toBe('long');
		expect(passwordProblem('lang genug hier', 'lang genug HIER')).toBe('mismatch');
		expect(passwordProblem('lang genug hier', 'lang genug hier')).toBeNull();
	});
});

describe('links to set a password', () => {
	it('hold the email and stamp, for an hour', async () => {
		const token = await setPasswordToken(' Mia@Example.org ', 'stamp-1', secret, now);
		expect(await readSetPasswordToken(token, secret, now + 60_000)).toEqual({ email: 'mia@example.org', stamp: 'stamp-1' });
		expect(await readSetPasswordToken(token, secret, now + (SET_PASSWORD_MINUTES * 60 + 1) * 1000)).toBeNull();
		expect(await readSetPasswordToken(token, 'y'.repeat(32), now)).toBeNull();
	});
});

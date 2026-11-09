import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { SAVED_COOKIE, savedAccounts, withAccount, withoutAccount, writeSaved } from './saved.ts';
import { signSession } from './session.ts';

const SECRET = 'x'.repeat(32);

function jar(): Cookies {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name)
	} as unknown as Cookies;
}

async function account(email: string, exp = Math.floor(Date.now() / 1000) + 3600) {
	return { email, name: email.split('@')[0]!, token: await signSession({ email, name: email.split('@')[0]!, exp }, SECRET) };
}

describe('accounts kept on a device', () => {
	it('keeps valid sessions, newest last, one per email', async () => {
		const cookies = jar();
		const admin = await account('admin@example.org');
		const member = await account('member@example.org');
		writeSaved(cookies, withAccount(withAccount([admin, member], { ...admin }), { ...admin, email: 'ADMIN@example.org' }));
		expect((await savedAccounts(cookies, SECRET)).map((a) => a.email)).toEqual(['member@example.org', 'admin@example.org']);
	});

	it('drops expired and tampered sessions', async () => {
		const cookies = jar();
		const expired = await account('old@example.org', 1);
		const valid = await account('valid@example.org');
		cookies.set(SAVED_COOKIE, [expired.token, valid.token + 'x', valid.token].join('~'), { path: '/' });
		expect((await savedAccounts(cookies, SECRET)).map((a) => a.email)).toEqual(['valid@example.org']);
	});

	it('forgets an account, and deletes the cookie when none is left', async () => {
		const cookies = jar();
		const one = await account('one@example.org');
		writeSaved(cookies, withoutAccount([one], 'ONE@example.org'));
		expect(cookies.get(SAVED_COOKIE)).toBeUndefined();
	});
});

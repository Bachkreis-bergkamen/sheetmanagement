import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../db/memory.ts';

const store = memoryStore();
vi.mock('../db/index.ts', () => ({ getStore: () => store }));

const { createInvite, findInvite, INVITE_DAYS, inviteUrl, openInvites, removeInvite } = await import('./invites.ts');

const now = Date.parse('2026-11-08T10:00:00Z');
const day = 86_400_000;

describe('invitation links', () => {
	beforeEach(() => store.setState('invites', '[]'));

	it('work for INVITE_DAYS, then no longer', async () => {
		const invite = await createInvite({ label: 'Anna, Bratsche', groups: 'Streicher', by: 'admin@example.org' }, now);
		expect(invite.id).toMatch(/^[\w-]{24}$/);
		expect(await findInvite(invite.id, now + day)).toMatchObject({ label: 'Anna, Bratsche', groups: 'Streicher' });
		expect(await findInvite(invite.id, now + INVITE_DAYS * day + 1)).toBeNull();
		expect(await openInvites(now + INVITE_DAYS * day + 1)).toEqual([]);
	});

	it('are listed newest first and end once removed', async () => {
		const first = await createInvite({ label: 'A', groups: '', by: '' }, now);
		const second = await createInvite({ label: 'B', groups: '', by: '' }, now + 1000);
		expect((await openInvites(now + 2000)).map((invite) => invite.label)).toEqual(['B', 'A']);
		await removeInvite(first.id, now + 2000);
		expect(await findInvite(first.id, now + 2000)).toBeNull();
		expect(await findInvite(second.id, now + 2000)).not.toBeNull();
	});

	it('ignore ids that were never made', async () => {
		expect(await findInvite('', now)).toBeNull();
		expect(await findInvite('x'.repeat(100), now)).toBeNull();
		expect(await findInvite('nope', now)).toBeNull();
	});

	it('point at the page that uses them', () => {
		expect(inviteUrl('https://noten.example.org', 'abc')).toBe('https://noten.example.org/auth/einladung/abc');
	});
});

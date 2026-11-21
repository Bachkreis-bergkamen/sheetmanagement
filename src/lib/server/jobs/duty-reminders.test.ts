import { describe, expect, it, vi } from 'vitest';
import type { AccessList } from '#lib/access/access.ts';
import { MemoryDutyStore } from '../duties-store.ts';

const store = new MemoryDutyStore();
vi.mock('../duties.ts', async (actual) => ({ ...(await actual<typeof import('../duties.ts')>()), dutyStore: async () => store }));
const { dutyReminders } = await import('./duty-reminders.ts');

const member = (email: string, name: string, status = 'aktiv') => ({ email, name, status, groups: [], orchestras: [], children: [], roles: [] });
const access = {
	members: [member('mia@example.org', 'Mia'), member('greta@example.org', 'Greta'), member('paul@example.org', 'Paul'), member('eltern@example.org', 'Eltern', 'eltern'), member('alt@example.org', 'Alt', 'inaktiv')]
} as unknown as AccessList;

describe('reminders for Dienste', () => {
	it('reminds those on a job the day before and on the day, and everyone free when asked', async () => {
		const tomorrow = { eventId: 'herbst', eventDay: '2026-11-22', eventTitle: 'Herbstkonzert' };
		const setUp = await store.addSlot({ ...tomorrow, task: 'Aufbau', from: '15:00', to: '16:00', needed: 2, note: 'Stühle' });
		await store.addSlot({ ...tomorrow, task: 'Kuchen', needed: 3 });
		const later = await store.addSlot({ eventId: 'weihnacht', eventDay: '2026-12-20', eventTitle: 'Weihnachtskonzert', task: 'Abbau', needed: 1 });
		await store.take(setUp.id, { email: 'mia@example.org', name: 'Mia' });
		await store.take(later.id, { email: 'greta@example.org', name: 'Greta' });
		const now = Date.parse('2026-11-21T10:00:00Z');

		const day = await dutyReminders('2026-11-21', access, now);
		expect(day.map((one) => [one.kind, one.recipient, one.notice.title, one.notice.body])).toEqual([['duty', 'mia@example.org', 'Dein Dienst morgen: Aufbau', 'Herbstkonzert · 15:00–16:00 · Stühle']]);

		await store.nudge('herbst', 'vera@example.org', '2026-11-21T09:00:00Z');
		await store.nudge('weihnacht', 'vera@example.org', '2026-11-10T09:00:00Z');
		const nudged = (await dutyReminders('2026-11-21', access, now)).filter((one) => one.kind === 'duty-nudge');
		// Not Mia (on a job there), not the parent account, not someone inactive; the old call for help has run out.
		expect(nudged.map((one) => one.recipient)).toEqual(['greta@example.org', 'paul@example.org']);
		expect(nudged[0]).toMatchObject({ subject: 'herbst@2026-11-21T09:00:00Z', notice: { title: 'Herbstkonzert: Wer hilft mit?', body: 'Bei den Diensten sind noch 4 Plätze frei: Aufbau, Kuchen. Trag dich in der App ein.' } });
	});
});

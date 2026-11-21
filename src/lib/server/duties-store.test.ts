import { describe, expect, it } from 'vitest';
import { MemoryDutyStore, SqlDutyStore, type DutyStore } from './duties-store.ts';
import { localD1 } from './db/local-d1.ts';

const herbst = { eventId: 'herbst', eventDay: '2026-12-06', eventTitle: 'Herbstkonzert' };
const mia = { email: 'mia@example.org', name: 'Mia Beispiel' };
const greta = { email: 'greta@example.org', name: 'Greta Pult' };
const paul = { email: 'paul@example.org', name: 'Paul Probe' };

for (const [name, make] of [
	['SqlDutyStore (SQLite)', () => new SqlDutyStore(localD1())],
	['MemoryDutyStore', () => new MemoryDutyStore()]
] as [string, () => DutyStore][]) {
	describe(name, () => {
		it('keeps the jobs of a date in the order of the day, and changes them', async () => {
			const store = make();
			const cake = await store.addSlot({ ...herbst, task: 'Kuchen', needed: 4 }, '2026-11-01T10:00:00Z');
			const setUp = await store.addSlot({ ...herbst, task: 'Aufbau', from: '15:00', to: '16:00', needed: 3, note: 'Stühle' }, '2026-11-01T10:01:00Z');
			await store.addSlot({ eventId: 'weihnacht', eventDay: '2026-12-20', eventTitle: 'Weihnachtskonzert', task: 'Abbau', needed: 2 });
			expect((await store.slotsOf('herbst')).map((slot) => slot.task)).toEqual(['Aufbau', 'Kuchen']);
			expect(await store.slot(setUp.id)).toEqual({ ...herbst, id: setUp.id, task: 'Aufbau', from: '15:00', to: '16:00', needed: 3, note: 'Stühle', createdAt: '2026-11-01T10:01:00Z' });

			await store.updateSlot(cake.id, { task: 'Kuchenverkauf', from: '18:00', needed: 2 });
			expect(await store.slot(cake.id)).toEqual({ ...herbst, id: cake.id, task: 'Kuchenverkauf', from: '18:00', needed: 2, createdAt: '2026-11-01T10:00:00Z' });
			await store.renameEvent('herbst', '2026-12-07', 'Herbstkonzert 2026');
			expect((await store.slotsOf('herbst')).map((slot) => [slot.eventDay, slot.eventTitle])).toEqual([
				['2026-12-07', 'Herbstkonzert 2026'],
				['2026-12-07', 'Herbstkonzert 2026']
			]);
			expect(await store.slots()).toHaveLength(3);
		});

		it('fills a job up to the places it has, once per person', async () => {
			const store = make();
			const door = await store.addSlot({ ...herbst, task: 'Abendkasse', needed: 2 });
			expect(await store.take(door.id, mia, '2026-11-02T10:00:00Z')).toBe('taken');
			expect(await store.take(door.id, mia)).toBe('already');
			expect(await store.take(door.id, { ...greta, by: 'vera@example.org' }, '2026-11-02T10:01:00Z')).toBe('taken');
			expect(await store.take(door.id, paul)).toBe('full');
			expect(await store.take('nope', paul)).toBe('gone');
			expect(await store.takesOf('herbst')).toEqual([
				{ slotId: door.id, eventId: 'herbst', ...mia, createdAt: '2026-11-02T10:00:00Z' },
				{ slotId: door.id, eventId: 'herbst', ...greta, by: 'vera@example.org', createdAt: '2026-11-02T10:01:00Z' }
			]);

			expect(await store.leave(door.id, mia.email)).toBe(true);
			expect(await store.leave(door.id, mia.email)).toBe(false);
			expect(await store.take(door.id, paul)).toBe('taken');
			expect((await store.takesBy(paul.email)).map((take) => take.slotId)).toEqual([door.id]);
		});

		it('takes everyone off a job that is deleted', async () => {
			const store = make();
			const job = await store.addSlot({ ...herbst, task: 'Abbau', needed: 3 });
			await store.take(job.id, mia);
			await store.removeSlot(job.id);
			expect(await store.slot(job.id)).toBeNull();
			expect(await store.takes()).toEqual([]);
		});

		it('keeps templates by name, a second save replacing the first', async () => {
			const store = make();
			const first = await store.saveTemplate('Aula', [{ task: 'Aufbau', needed: 3 }]);
			const again = await store.saveTemplate('Aula', [{ task: 'Aufbau', needed: 4 }, { task: 'Kuchen', from: '18:00', needed: 2 }]);
			await store.saveTemplate('Kirche', [{ task: 'Abendkasse', needed: 2 }]);
			expect(again.id).toBe(first.id);
			expect((await store.templates()).map((template) => [template.name, template.jobs])).toEqual([
				['Aula', [{ task: 'Aufbau', needed: 4 }, { task: 'Kuchen', from: '18:00', needed: 2 }]],
				['Kirche', [{ task: 'Abendkasse', needed: 2 }]]
			]);
			await store.removeTemplate(first.id);
			expect((await store.templates()).map((template) => template.name)).toEqual(['Kirche']);
		});

		it('frees the places of a deleted member', async () => {
			const store = make();
			const job = await store.addSlot({ ...herbst, task: 'Aufbau', needed: 1 });
			await store.take(job.id, mia);
			expect(await store.countBy(mia.email)).toBe(1);
			await store.forget(mia.email);
			expect(await store.countBy(mia.email)).toBe(0);
			expect(await store.take(job.id, greta)).toBe('taken');
		});
	});
}

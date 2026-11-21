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

		it('hands a place on only when it was offered, to someone not on the job yet', async () => {
			const store = make();
			const job = await store.addSlot({ ...herbst, task: 'Getränke', needed: 2 });
			await store.take(job.id, mia, '2026-11-02T10:00:00Z');
			await store.take(job.id, greta, '2026-11-02T10:01:00Z');
			expect(await store.takeOver(job.id, mia.email, paul)).toBe('gone');
			expect(await store.offer(job.id, mia.email, true)).toBe(true);
			expect(await store.offer(job.id, paul.email, true)).toBe(false);
			expect((await store.takesOf('herbst')).find((take) => take.email === mia.email)?.offered).toBe(true);
			expect(await store.takeOver(job.id, mia.email, greta)).toBe('already');
			expect(await store.takeOver(job.id, mia.email, paul, '2026-11-03T10:00:00Z')).toBe('taken');
			expect(await store.takeOver(job.id, mia.email, { email: 'ida@example.org', name: 'Ida' })).toBe('gone');
			expect((await store.takesOf('herbst')).map((take) => [take.email, take.offered ?? false])).toEqual([
				[greta.email, false],
				[paul.email, false]
			]);
			// Changed one's mind: the place stays theirs and isn't up any more.
			await store.offer(job.id, greta.email, true);
			await store.offer(job.id, greta.email, false);
			expect(await store.takeOver(job.id, greta.email, mia)).toBe('gone');
		});

		it('keeps one call for help per date, the latest', async () => {
			const store = make();
			await store.nudge('herbst', 'vera@example.org', '2026-11-20T10:00:00Z');
			await store.nudge('herbst', 'vera@example.org', '2026-11-21T10:00:00Z');
			expect(await store.nudges()).toEqual([{ eventId: 'herbst', by: 'vera@example.org', requestedAt: '2026-11-21T10:00:00Z' }]);
		});

		it('keeps lifts per date; only their owner deletes one', async () => {
			const store = make();
			const offer = await store.addRide({ ...herbst, ...greta, kind: 'offer', from: 'Bergkamen', seats: 3, note: 'zurück auch' }, '2026-11-02T10:00:00Z');
			await store.addRide({ ...herbst, ...paul, kind: 'request', from: 'Unna', seats: 1 }, '2026-11-02T10:01:00Z');
			await store.addRide({ eventId: 'weihnacht', eventDay: '2026-12-20', eventTitle: 'Weihnachtskonzert', ...mia, kind: 'offer', from: 'Kamen', seats: 1 });
			expect(await store.ridesOf('herbst')).toEqual([
				{ ...herbst, ...greta, id: offer.id, kind: 'offer', from: 'Bergkamen', seats: 3, note: 'zurück auch', createdAt: '2026-11-02T10:00:00Z' },
				expect.objectContaining({ email: paul.email, kind: 'request', from: 'Unna' })
			]);
			expect(await store.removeRide(offer.id, paul.email)).toBe(false);
			expect(await store.removeRide(offer.id, greta.email)).toBe(true);
			expect((await store.rides()).map((ride) => ride.email)).toEqual([paul.email, mia.email]);
		});

		it('frees the places and drops the lifts of a deleted member', async () => {
			const store = make();
			const job = await store.addSlot({ ...herbst, task: 'Aufbau', needed: 1 });
			await store.take(job.id, mia);
			await store.addRide({ ...herbst, ...mia, kind: 'request', from: 'Kamen', seats: 1 });
			expect(await store.countBy(mia.email)).toBe(2);
			await store.forget(mia.email);
			expect(await store.countBy(mia.email)).toBe(0);
			expect(await store.rides()).toEqual([]);
			expect(await store.take(job.id, greta)).toBe('taken');
		});
	});
}

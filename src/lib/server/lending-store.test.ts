import { describe, expect, it } from 'vitest';
import { MemoryLendingStore, SqlLendingStore, type LendingStore } from './lending-store.ts';
import { localD1 } from './db/local-d1.ts';

const by = 'vera@example.org';

for (const [name, make] of [
	['SqlLendingStore (SQLite)', () => new SqlLendingStore(localD1())],
	['MemoryLendingStore', () => new MemoryLendingStore()]
] as [string, () => LendingStore][]) {
	describe(name, () => {
		it('keeps instruments with their details and changes them', async () => {
			const store = make();
			const violin = await store.addInstrument({ kind: 'Violine', size: '3/4', serial: 'BK-V-07', accessories: 'Koffer, Bogen', status: 'available' }, '2026-11-01T10:00:00Z');
			expect(await store.instrument(violin.id)).toEqual({ id: violin.id, kind: 'Violine', size: '3/4', serial: 'BK-V-07', accessories: 'Koffer, Bogen', status: 'available', createdAt: '2026-11-01T10:00:00Z' });
			await store.updateInstrument(violin.id, { kind: 'Violine', size: '3/4', notes: 'Steg neu', status: 'repair' });
			expect(await store.instrument(violin.id)).toEqual({ id: violin.id, kind: 'Violine', size: '3/4', notes: 'Steg neu', status: 'repair', createdAt: '2026-11-01T10:00:00Z' });
			expect((await store.instruments()).map((i) => i.id)).toEqual([violin.id]);
		});

		it('lends an available instrument once, and again only after it is back', async () => {
			const store = make();
			const cello = await store.addInstrument({ kind: 'Violoncello', status: 'available' });
			const loan = await store.lend({ instrumentId: cello.id, email: 'mia@example.org', name: 'Mia Beispiel', from: '2026-09-01', due: '2027-07-15', handover: 'Neue Saiten', by });
			expect(loan).toMatchObject({ instrumentId: cello.id, email: 'mia@example.org', from: '2026-09-01', due: '2027-07-15', handover: 'Neue Saiten', by });
			expect(loan).not.toHaveProperty('returned');
			// Out already: a second loan is refused.
			expect(await store.lend({ instrumentId: cello.id, email: 'paul@example.org', name: 'Paul Probe', from: '2026-09-02', by })).toBeNull();

			expect(await store.giveBack(loan!.id, '2027-07-10', 'Kratzer am Boden')).toBe(true);
			expect(await store.giveBack(loan!.id, '2027-07-11')).toBe(false);
			const again = await store.lend({ instrumentId: cello.id, email: 'paul@example.org', name: 'Paul Probe', from: '2027-09-01', by });
			expect(again).not.toBeNull();

			const all = await store.loans();
			expect(all.map((one) => [one.email, one.returned ?? null, one.returnNote ?? null])).toEqual([
				['paul@example.org', null, null],
				['mia@example.org', '2027-07-10', 'Kratzer am Boden']
			]);
			expect((await store.loansOf('mia@example.org')).map((one) => one.id)).toEqual([loan!.id]);
		});

		it('lends nothing in repair, retired or unknown', async () => {
			const store = make();
			const clarinet = await store.addInstrument({ kind: 'Klarinette', status: 'repair' });
			const old = await store.addInstrument({ kind: 'Flöte', status: 'retired' });
			for (const id of [clarinet.id, old.id, 'nope']) expect(await store.lend({ instrumentId: id, email: 'mia@example.org', name: 'Mia', from: '2026-09-01', by })).toBeNull();
			expect(await store.loans()).toEqual([]);
		});

		it('deletes only an instrument that was never lent out', async () => {
			const store = make();
			const lent = await store.addInstrument({ kind: 'Viola', status: 'available' });
			const unused = await store.addInstrument({ kind: 'Viola', status: 'available' });
			await store.lend({ instrumentId: lent.id, email: 'mia@example.org', name: 'Mia', from: '2026-09-01', by });
			expect(await store.removeInstrument(lent.id)).toBe(false);
			expect(await store.removeInstrument(unused.id)).toBe(true);
			expect((await store.instruments()).map((i) => i.id)).toEqual([lent.id]);
		});

		it('keeps the loans of a deleted member under a pseudonym', async () => {
			const store = make();
			const violin = await store.addInstrument({ kind: 'Violine', status: 'available' });
			await store.lend({ instrumentId: violin.id, email: 'mia@example.org', name: 'Mia Beispiel', from: '2026-09-01', by });
			expect(await store.countBy('mia@example.org')).toBe(1);
			await store.forget('mia@example.org', { email: 'geloescht-1@invalid', name: 'Ehemaliges Mitglied' });
			expect(await store.countBy('mia@example.org')).toBe(0);
			expect((await store.loans()).map((loan) => [loan.email, loan.name])).toEqual([['geloescht-1@invalid', 'Ehemaliges Mitglied']]);
		});
	});
}

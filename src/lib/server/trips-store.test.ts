import { describe, expect, it } from 'vitest';
import type { NewTrip } from '#lib/trips/trips.ts';
import type { SqlDatabase, SqlStatement } from './polls-store.ts';
import { MemoryTripStore, SqlTripStore, type TripStore } from './trips-store.ts';

// Node's own SQLite; the project has no Node types, so the little that's used is typed here.
interface Sqlite {
	prepare(sql: string): {
		all(...values: unknown[]): unknown[];
		get(...values: unknown[]): unknown;
		run(...values: unknown[]): unknown;
	};
}
const { DatabaseSync } = (await import(/* @vite-ignore */ `node:${'sqlite'}`)) as { DatabaseSync: new (path: string) => Sqlite };

/** node:sqlite dressed up as D1, so the SQL that runs on Cloudflare runs here too. */
function sqlite(): SqlDatabase {
	const db = new DatabaseSync(':memory:');
	const statement = (sql: string, values: (string | number | null)[] = []): SqlStatement => ({
		bind: (...more) => statement(sql, [...values, ...more]),
		all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] }),
		first: async <T>() => (db.prepare(sql).get(...values) as T | undefined) ?? null,
		run: async () => db.prepare(sql).run(...values)
	});
	return { prepare: (sql) => statement(sql) };
}

const weekend: NewTrip = {
	title: 'Probenwochenende',
	kind: 'probenfahrt',
	firstDay: '2027-03-05',
	lastDay: '2027-03-07',
	orchestras: ['A'],
	organisers: ['tim@x.org'],
	stops: [{ place: 'Haltern', from: '2027-03-05', until: '2027-03-07' }],
	cap: 30
};

for (const [name, make] of [
	['SqlTripStore (SQLite)', () => new SqlTripStore(sqlite())],
	['MemoryTripStore', () => new MemoryTripStore()]
] as [string, () => TripStore][]) {
	describe(name, () => {
		it('keeps a trip with a unique slug, and changes it without losing its dates', async () => {
			const store = make();
			const first = await store.create(weekend, 'vera@x.org', '2026-11-01T10:00:00Z');
			const second = await store.create({ ...weekend, firstDay: '2027-01-08', lastDay: '2027-01-10', cap: undefined }, 'vera@x.org');
			expect(first).toMatchObject({ slug: 'probenwochenende-2027', eventIds: [], createdBy: 'vera@x.org', stops: weekend.stops, cap: 30 });
			expect(second.slug).toBe('probenwochenende-2027-2');
			// The next first.
			expect((await store.list()).map((trip) => trip.id)).toEqual([second.id, first.id]);

			await store.setEvents(first.id, ['e1', 'e2', 'e1']);
			await store.update(first.id, { ...weekend, title: 'Probenwochenende Haltern', cap: undefined, note: 'Mit Bus' });
			const got = await store.get(first.id);
			expect(got).toMatchObject({ title: 'Probenwochenende Haltern', slug: 'probenwochenende-2027', eventIds: ['e1', 'e2'], note: 'Mit Bus' });
			expect(got?.cap).toBeUndefined();
			expect(await store.get('nope')).toBeNull();
		});

		it('keeps one sign-up per person, in the order they signed up', async () => {
			const store = make();
			const trip = await store.create(weekend, 'vera@x.org');
			await store.saveParticipant({ tripId: trip.id, email: 'b@x.org', name: 'B', role: 'musiker', status: 'angemeldet', signedUpAt: '2026-11-02' });
			await store.saveParticipant({ tripId: trip.id, email: 'a@x.org', name: 'A', role: 'betreuer', status: 'warteliste', signedUpAt: '2026-11-03', arrival: '2027-03-06' });
			await store.saveParticipant({ tripId: trip.id, email: 'b@x.org', name: 'B', role: 'fahrer', status: 'angemeldet', signedUpAt: '2026-11-02', note: 'Kombi' });
			const participants = await store.participants(trip.id);
			expect(participants.map((p) => [p.email, p.role, p.status])).toEqual([
				['b@x.org', 'fahrer', 'angemeldet'],
				['a@x.org', 'betreuer', 'warteliste']
			]);
			expect(participants[0].note).toBe('Kombi');
			expect(participants[1].arrival).toBe('2027-03-06');
			expect(participants[0].arrival).toBeUndefined();
			await store.removeParticipant(trip.id, 'b@x.org');
			expect((await store.participants(trip.id)).map((p) => p.email)).toEqual(['a@x.org']);
		});

		it('keeps the plan by day and time, and removes it with the trip', async () => {
			const store = make();
			const trip = await store.create(weekend, 'vera@x.org');
			await store.savePlanItem({ id: 'p2', tripId: trip.id, day: '2027-03-06', start: '09:30', title: 'Register', kind: 'register', audience: 'Streicher' });
			await store.savePlanItem({ id: 'p1', tripId: trip.id, day: '2027-03-05', start: '18:00', end: '19:00', title: 'Essen', kind: 'essen' });
			await store.savePlanItem({ id: 'p3', tripId: trip.id, day: '2027-03-06', title: 'Freizeit', kind: 'frei' });
			expect((await store.plan(trip.id)).map((item) => item.id)).toEqual(['p1', 'p3', 'p2']);
			await store.savePlanItem({ id: 'p2', tripId: trip.id, day: '2027-03-06', start: '10:00', title: 'Register später', kind: 'register' });
			const changed = (await store.plan(trip.id)).find((item) => item.id === 'p2');
			expect(changed).toEqual({ id: 'p2', tripId: trip.id, day: '2027-03-06', start: '10:00', title: 'Register später', kind: 'register' });
			await store.removePlanItem(trip.id, 'p3');
			expect((await store.plan(trip.id)).map((item) => item.id)).toEqual(['p1', 'p2']);

			await store.saveParticipant({ tripId: trip.id, email: 'a@x.org', name: 'A', role: 'musiker', status: 'angemeldet', signedUpAt: '1' });
			await store.remove(trip.id);
			expect(await store.get(trip.id)).toBeNull();
			expect(await store.plan(trip.id)).toEqual([]);
			expect(await store.participants(trip.id)).toEqual([]);
		});

		it('gives a person’s sign-ups for the export, and forgets them on erase (#158)', async () => {
			const store = make();
			const trip = await store.create({ ...weekend, organisers: ['tim@x.org', 'mia@x.org'] }, 'mia@x.org');
			await store.saveParticipant({ tripId: trip.id, email: 'mia@x.org', name: 'Mia', role: 'musiker', status: 'angemeldet', signedUpAt: '1', note: 'Erdnussallergie' });
			await store.saveParticipant({ tripId: trip.id, email: 'kid@x.org', name: 'Kid', role: 'musiker', status: 'angemeldet', signedUpAt: '2', parentConfirmedBy: 'mia@x.org', parentConfirmedAt: '2026-11-05' });
			expect((await store.participationsOf('mia@x.org')).map(({ trip: t, participant }) => [t.title, participant.note])).toEqual([['Probenwochenende', 'Erdnussallergie']]);
			// Her sign-up, and the trip she created and organises.
			expect(await store.countBy('mia@x.org')).toBe(2);

			await store.forget('mia@x.org', { email: 'ehemalig-1@example.invalid' });
			expect(await store.participationsOf('mia@x.org')).toEqual([]);
			expect(await store.countBy('mia@x.org')).toBe(0);
			const kept = await store.get(trip.id);
			expect(kept).toMatchObject({ organisers: ['tim@x.org'], createdBy: 'ehemalig-1@example.invalid' });
			expect((await store.participants(trip.id)).map((p) => [p.email, p.parentConfirmedBy])).toEqual([['kid@x.org', 'ehemalig-1@example.invalid']]);
		});
	});
}

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
	lists: ['ernaehrung', 'notfall'],
	questions: [],
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
			await store.saveParticipant({ tripId: trip.id, email: 'b@x.org', name: 'B', roles: ['musiker'], status: 'angemeldet', signedUpAt: '2026-11-02' });
			await store.saveParticipant({ tripId: trip.id, email: 'a@x.org', name: 'A', roles: ['betreuer'], status: 'warteliste', signedUpAt: '2026-11-03', arrival: '2027-03-06' });
			await store.saveParticipant({ tripId: trip.id, email: 'b@x.org', name: 'B', roles: ['fahrer', 'betreuer'], status: 'angemeldet', signedUpAt: '2026-11-02', note: 'Kombi' });
			const participants = await store.participants(trip.id);
			expect(participants.map((p) => [p.email, p.roles, p.status])).toEqual([
				['b@x.org', ['fahrer', 'betreuer'], 'angemeldet'],
				['a@x.org', ['betreuer'], 'warteliste']
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

			await store.saveParticipant({ tripId: trip.id, email: 'a@x.org', name: 'A', roles: ['musiker'], status: 'angemeldet', signedUpAt: '1' });
			await store.remove(trip.id);
			expect(await store.get(trip.id)).toBeNull();
			expect(await store.plan(trip.id)).toEqual([]);
			expect(await store.participants(trip.id)).toEqual([]);
		});

		it('gives a person’s sign-ups for the export, and forgets them on erase (#158)', async () => {
			const store = make();
			const trip = await store.create({ ...weekend, organisers: ['tim@x.org', 'mia@x.org'] }, 'mia@x.org');
			await store.saveParticipant({ tripId: trip.id, email: 'mia@x.org', name: 'Mia', roles: ['musiker'], status: 'angemeldet', signedUpAt: '1', note: 'Erdnussallergie' });
			await store.saveParticipant({ tripId: trip.id, email: 'kid@x.org', name: 'Kid', roles: ['musiker'], status: 'angemeldet', signedUpAt: '2', parentConfirmedBy: 'mia@x.org', parentConfirmedAt: '2026-11-05' });
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

		it('keeps one list per person and kind, and drops a person’s lists with their sign-up (#334, step 2)', async () => {
			const store = make();
			const trip = await store.create(weekend, 'vera@x.org');
			const list = (email: string, kind: 'notfall' | 'wuensche', data: object, savedBy = email) =>
				store.saveList({ tripId: trip.id, email, kind, data: data as never, savedAt: '2027-01-01T10:00:00Z', savedBy });
			await list('b@x.org', 'notfall', { name: 'Mum', phone: '0231 1' });
			await list('a@x.org', 'wuensche', { roomWith: 'B' });
			await list('b@x.org', 'notfall', { name: 'Dad', phone: '0231 2' }, 'parent@x.org');
			expect((await store.lists(trip.id)).map((entry) => [entry.email, entry.kind, entry.savedBy, (entry.data as { name?: string }).name])).toEqual([
				['a@x.org', 'wuensche', 'a@x.org', undefined],
				['b@x.org', 'notfall', 'parent@x.org', 'Dad']
			]);
			await store.saveParticipant({ tripId: trip.id, email: 'b@x.org', name: 'B', roles: ['musiker'], status: 'angemeldet', signedUpAt: '1' });
			await store.removeParticipant(trip.id, 'b@x.org');
			expect((await store.lists(trip.id)).map((entry) => entry.email)).toEqual(['a@x.org']);

			expect(await store.purgeLists([trip.id, 'other'])).toBe(1);
			expect(await store.lists(trip.id)).toEqual([]);
			expect(await store.purgeLists([trip.id])).toBe(0);
		});

		it('keeps what a person carries to the next trip, and their instruments, theirs only', async () => {
			const store = make();
			await store.keep({ email: 'a@x.org', kind: 'notfall', data: { name: 'Mum', phone: '1' }, savedAt: '1' });
			await store.keep({ email: 'a@x.org', kind: 'notfall', data: { name: 'Dad', phone: '2' }, savedAt: '2' });
			await store.keep({ email: 'a@x.org', kind: 'wuensche', data: {}, savedAt: '2' });
			expect((await store.kept('a@x.org')).map((list) => [list.kind, list.savedAt])).toEqual([
				['notfall', '2'],
				['wuensche', '2']
			]);
			await store.unkeep('a@x.org', 'wuensche');
			expect((await store.kept('a@x.org')).map((list) => list.kind)).toEqual(['notfall']);

			await store.saveInstrument({ id: 'i1', email: 'a@x.org', name: 'Violoncello', owner: 'eigen', value: 6000, insurance: 'gruppe', bulky: true });
			await store.saveInstrument({ id: 'i2', email: 'b@x.org', name: 'Geige', owner: 'leihe', insurance: 'keine', bulky: false });
			// Not changed through someone else's id.
			await store.saveInstrument({ id: 'i1', email: 'b@x.org', name: 'Gestohlen', owner: 'eigen', insurance: 'keine', bulky: false });
			await store.removeInstrument('b@x.org', 'i1');
			expect((await store.instruments(['a@x.org'])).map((one) => [one.id, one.name, one.value])).toEqual([['i1', 'Violoncello', 6000]]);
			expect((await store.instruments(['a@x.org', 'b@x.org'])).map((one) => one.id)).toEqual(['i1', 'i2']);
			expect(await store.instruments([])).toEqual([]);
		});

		it('keeps the trip’s picture and lists when its form is saved, and looks again for a new place', async () => {
			const store = make();
			const trip = await store.create(weekend, 'vera@x.org');
			expect(trip.lists).toEqual(['ernaehrung', 'notfall']);
			await store.setPicture(trip.id, { url: 'https://upload.wikimedia.org/x.jpg', page: 'https://commons.wikimedia.org/wiki/File:X.jpg', title: 'Haltern am See' }, 'Haltern');
			await store.update(trip.id, { ...weekend, questions: [{ id: 'q', text: 'Größe?', type: 'auswahl', options: ['S'] }] });
			const got = await store.get(trip.id);
			expect(got).toMatchObject({ pictureFor: 'Haltern', picture: { title: 'Haltern am See' }, questions: [{ id: 'q' }] });
			await store.setPicture(trip.id, null, 'Rom');
			const after = await store.get(trip.id);
			expect(after?.picture).toBeUndefined();
			expect(after?.pictureFor).toBe('Rom');
		});

		it('exports and forgets a person’s lists, kept lists and instruments; a parent’s name leaves the child’s list', async () => {
			const store = make();
			const trip = await store.create(weekend, 'vera@x.org');
			await store.saveList({ tripId: trip.id, email: 'mia@x.org', kind: 'notfall', data: { name: 'Mum', phone: '1' }, savedAt: '1', savedBy: 'mia@x.org' });
			await store.saveList({ tripId: trip.id, email: 'kid@x.org', kind: 'einverstaendnis', data: { photos: true, travelAlone: false }, savedAt: '1', savedBy: 'mia@x.org' });
			await store.keep({ email: 'mia@x.org', kind: 'notfall', data: { name: 'Mum', phone: '1' }, savedAt: '1' });
			await store.saveInstrument({ id: 'i1', email: 'mia@x.org', name: 'Geige', owner: 'eigen', insurance: 'keine', bulky: false });
			expect((await store.listsOf('mia@x.org')).map((entry) => entry.kind)).toEqual(['notfall']);
			// One list, one kept list, one instrument; the trip isn't hers.
			expect(await store.countBy('mia@x.org')).toBe(3);

			await store.forget('mia@x.org', { email: 'ehemalig-1@example.invalid' });
			expect(await store.listsOf('mia@x.org')).toEqual([]);
			expect(await store.kept('mia@x.org')).toEqual([]);
			expect(await store.instruments(['mia@x.org'])).toEqual([]);
			expect((await store.lists(trip.id)).map((entry) => [entry.email, entry.savedBy])).toEqual([['kid@x.org', 'ehemalig-1@example.invalid']]);
		});
	});
}

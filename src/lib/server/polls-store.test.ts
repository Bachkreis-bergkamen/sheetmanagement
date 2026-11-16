import { describe, expect, it } from 'vitest';
import type { NewPoll } from '#lib/polls/polls.ts';
import { MemoryPollStore, perDatabase, SqlPollStore, type PollStore, type SqlDatabase, type SqlStatement } from './polls-store.ts';

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

const poll: NewPoll = {
	title: 'Probenwochenende Frühjahr',
	options: [
		{ id: 'o1', date: '2027-03-06' },
		{ id: 'o2', date: '2027-03-13', start: '10:00', end: '17:00' }
	],
	groups: ['Orga', 'Dirigat']
};
const vera = { email: 'vera@example.org', name: 'Vera' };

for (const [name, make] of [
	['SqlPollStore (SQLite)', () => new SqlPollStore(sqlite())],
	['MemoryPollStore', () => new MemoryPollStore()]
] as [string, () => PollStore][]) {
	describe(name, () => {
		it('keeps a poll with its options and groups', async () => {
			const store = make();
			const created = await store.create(poll, vera);
			expect(await store.list()).toEqual([created]);
			const got = await store.get(created.id);
			expect(got?.poll).toMatchObject({ title: poll.title, options: poll.options, groups: poll.groups, createdBy: vera.email });
			expect(got?.responses).toEqual([]);
			expect(await store.get('nope')).toBeNull();
		});

		it('lists the polls not closed that someone has not answered (#347)', async () => {
			const store = make();
			const first = await store.create(poll, vera);
			const second = await store.create({ ...poll, title: 'Sommerfest' }, vera);
			const closed = await store.create({ ...poll, title: 'Vorbei' }, vera);
			await store.close(closed.id, ['o1']);
			await store.respond(first.id, { email: 'ben@example.org', name: 'Ben', choices: { o1: 'yes' }, updatedAt: '2027-01-01T10:00:00Z' });
			const titles = async (email: string) => (await store.unanswered(email)).map((open) => open.title).sort();
			expect(await titles('ben@example.org')).toEqual(['Sommerfest']);
			expect(await titles('ada@example.org')).toEqual(['Probenwochenende Frühjahr', 'Sommerfest']);
			await store.respond(second.id, { email: 'ben@example.org', name: 'Ben', choices: { o2: 'no' }, updatedAt: '2027-01-01T10:00:00Z' });
			expect(await titles('ben@example.org')).toEqual([]);
		});

		it('keeps one answer per person: answering again replaces it', async () => {
			const store = make();
			const { id } = await store.create(poll, vera);
			await store.respond(id, { email: 'ben@example.org', name: 'Ben', choices: { o1: 'yes', o2: 'no' }, updatedAt: '2027-01-01T10:00:00Z' });
			await store.respond(id, { email: 'ben@example.org', name: 'Ben', choices: { o1: 'maybe' }, comment: 'Nur vormittags', updatedAt: '2027-01-02T10:00:00Z' });
			await store.respond(id, { email: 'ada@example.org', name: 'Ada', choices: { o2: 'yes' }, updatedAt: '2027-01-02T11:00:00Z' });
			const { responses } = (await store.get(id))!;
			expect(responses.map((response) => [response.name, response.choices, response.comment])).toEqual([
				['Ada', { o2: 'yes' }, undefined],
				['Ben', { o1: 'maybe' }, 'Nur vormittags']
			]);
		});

		it('forgets a person: their answers count under a pseudonym, without their comment', async () => {
			const store = make();
			const { id } = await store.create(poll, vera);
			await store.respond(id, { email: 'ben@example.org', name: 'Ben', choices: { o1: 'yes' }, comment: 'Gern', updatedAt: '2027-01-01T10:00:00Z' });
			expect(await store.countBy('ben@example.org')).toBe(1);
			expect((await store.answersOf('ben@example.org')).map(({ poll, response }) => [poll.title, response.comment])).toEqual([[poll.title, 'Gern']]);
			expect(await store.countBy(vera.email)).toBe(1);
			const stand = { email: 'geloescht-x@geloescht.invalid', name: 'Ehemaliges Mitglied' };
			await store.forget('ben@example.org', stand);
			await store.forget(vera.email, stand);
			const got = (await store.get(id))!;
			expect(got.responses.map((response) => [response.email, response.name, response.choices, response.comment])).toEqual([
				[stand.email, stand.name, { o1: 'yes' }, undefined]
			]);
			expect(got.poll).toMatchObject({ createdBy: stand.email, createdByName: stand.name });
			expect(await store.countBy('ben@example.org')).toBe(0);
		});

		it('closes with the chosen dates, reopens, and removes with its answers', async () => {
			const store = make();
			const { id } = await store.create(poll, vera);
			expect((await store.get(id))?.poll.chosen).toEqual([]);
			await store.respond(id, { email: 'ben@example.org', name: 'Ben', choices: { o1: 'yes' }, updatedAt: '2027-01-01T10:00:00Z' });
			await store.close(id, ['o1', 'o2']);
			expect((await store.get(id))?.poll).toMatchObject({ chosen: ['o1', 'o2'], closedAt: expect.any(String) });
			await store.reopen(id);
			expect((await store.get(id))?.poll).toMatchObject({ chosen: [], closedAt: undefined });
			await store.close(id, []);
			expect((await store.get(id))?.poll.chosen).toEqual([]);
			await store.reopen(id);
			await store.remove(id);
			expect(await store.get(id)).toBeNull();
			expect(await store.list()).toEqual([]);
		});
	});
}

describe('perDatabase (#346)', () => {
	it('keeps one store per binding, so its tables are made once', async () => {
		const made: string[] = [];
		const counting = (): SqlDatabase => {
			const db = sqlite();
			return {
				prepare: (sql) => {
					if (sql.startsWith('CREATE TABLE')) made.push(sql);
					return db.prepare(sql);
				}
			};
		};
		const store = perDatabase((db) => new SqlPollStore(db));
		const db = counting();
		await store(db).list();
		await store(db).list();
		expect(store(db)).toBe(store(db));
		expect(made).toHaveLength(2);
		// Another binding (a new deployment, a test) gets its own.
		expect(store(counting())).not.toBe(store(db));
	});
});

import { describe, expect, it } from 'vitest';
import { MemoryKummerStore, SqlKummerStore, type KummerStore } from './kummer-store.ts';
import type { SqlDatabase, SqlStatement } from './polls-store.ts';

interface Sqlite {
	prepare(sql: string): { all(...values: unknown[]): unknown[]; get(...values: unknown[]): unknown; run(...values: unknown[]): unknown };
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

for (const [name, make] of [
	['SqlKummerStore (SQLite)', () => new SqlKummerStore(sqlite())],
	['MemoryKummerStore', () => new MemoryKummerStore()]
] as [string, () => KummerStore][]) {
	describe(name, () => {
		it('keeps the writer only as their key, and finds their threads by it', async () => {
			const store = make();
			const thread = await store.create({ subject: 'Lautstärke', body: 'Die Bläser sind zu laut.', recipients: ['david@example.org'] }, 'key-mia', '2026-11-01T20:15:00Z');
			await store.create({ subject: 'Anderes', body: 'x', recipients: [] }, 'key-jonas', '2026-11-02T10:00:00Z');
			expect(thread).not.toHaveProperty('authorKey');
			expect((await store.listByAuthor('key-mia')).map((t) => t.subject)).toEqual(['Lautstärke']);
			expect((await store.list()).map((t) => t.subject)).toEqual(['Anderes', 'Lautstärke']);
			const found = await store.get(thread.id);
			expect(found?.authorKey).toBe('key-mia');
			expect(found?.thread.authorName).toBeUndefined();
			expect(found?.messages).toEqual([expect.objectContaining({ fromAuthor: true, body: 'Die Bläser sind zu laut.' })]);
		});

		it('answers in the thread, newest activity first, with who answered', async () => {
			const store = make();
			const first = await store.create({ subject: 'A', body: 'a', recipients: [], authorName: 'Mia Beispiel' }, 'key-mia', '2026-11-01T10:00:00Z');
			await store.create({ subject: 'B', body: 'b', recipients: [] }, 'key-mia', '2026-11-02T10:00:00Z');
			await store.reply(first.id, { fromAuthor: false, senderEmail: 'david@example.org', senderName: 'David Dirigent', body: 'Danke!' }, '2026-11-03T09:00:00Z');
			await store.reply(first.id, { fromAuthor: true, senderEmail: 'mia@example.org', body: 'Gern.' }, '2026-11-03T10:00:00Z');
			const found = await store.get(first.id);
			expect(found?.thread).toMatchObject({ authorName: 'Mia Beispiel', lastLeitungAt: '2026-11-03T09:00:00Z', lastAuthorAt: '2026-11-03T10:00:00Z' });
			// The writer's address never goes in, even when passed by mistake.
			expect(found?.messages.map((m) => [m.fromAuthor, m.senderEmail ?? null, m.senderName ?? null])).toEqual([
				[true, null, null],
				[false, 'david@example.org', 'David Dirigent'],
				[true, null, null]
			]);
			expect((await store.list()).map((t) => t.subject)).toEqual(['A', 'B']);
		});

		it('remembers when each reader looked, and closes and opens threads', async () => {
			const store = make();
			const thread = await store.create({ subject: 'A', body: 'a', recipients: [] }, 'key-mia', '2026-11-01T10:00:00Z');
			expect((await store.readsOf('author:key-mia')).get(thread.id)).toBe('2026-11-01T10:00:00Z');
			await store.markRead(thread.id, 'david@example.org', '2026-11-02T10:00:00Z');
			expect((await store.readsOf('david@example.org')).get(thread.id)).toBe('2026-11-02T10:00:00Z');
			await store.setClosed(thread.id, true);
			expect((await store.get(thread.id))?.thread.closedAt).toBeTruthy();
			await store.setClosed(thread.id, false);
			expect((await store.get(thread.id))?.thread.closedAt).toBeUndefined();
		});

		it('forgets a member: their threads go, their answers lose the name', async () => {
			const store = make();
			const theirs = await store.create({ subject: 'A', body: 'a', recipients: [] }, 'key-david', '2026-11-01T10:00:00Z');
			const other = await store.create({ subject: 'B', body: 'b', recipients: [] }, 'key-mia', '2026-11-01T11:00:00Z');
			await store.reply(other.id, { fromAuthor: false, senderEmail: 'david@example.org', senderName: 'David Dirigent', body: 'Ok' });
			expect(await store.countBy('david@example.org', 'key-david')).toBe(2);
			await store.forget('david@example.org', 'key-david', { email: 'geloescht-1@invalid', name: 'Gelöschtes Mitglied' });
			expect(await store.get(theirs.id)).toBeNull();
			expect((await store.get(other.id))?.messages[1]).toMatchObject({ senderEmail: 'geloescht-1@invalid', senderName: 'Gelöschtes Mitglied' });
			expect(await store.countBy('david@example.org', 'key-david')).toBe(0);
		});
	});
}

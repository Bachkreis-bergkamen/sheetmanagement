import { describe, expect, it } from 'vitest';
import { localD1 } from './db/local-d1.ts';
import { SqlParentNoticeStore } from './parent-notices.ts';

const notice = { title: 'Treffpunkt', body: '17 Uhr', orchestras: [], event: { id: 'konzert', label: 'Konzert · Sa 6. Dez' }, byEmail: 'v@example.org', byName: 'Vera' };

describe('the notices to parents in D1', () => {
	it('keep the date a notice is about', async () => {
		const store = new SqlParentNoticeStore(localD1());
		await store.create(notice, '2026-11-23T10:00:00.000Z');
		await store.create({ ...notice, title: 'Alle', event: null, orchestras: ['JO'] }, '2026-11-24T10:00:00.000Z');
		const [all, about] = await store.list();
		expect(all).toMatchObject({ title: 'Alle', orchestras: ['JO'], event: null });
		expect(about).toMatchObject({ title: 'Treffpunkt', event: notice.event });
	});

	it('add the date to a table made before there were dates (#299)', async () => {
		const db = localD1();
		await db
			.prepare('CREATE TABLE parent_notices (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, orchestras TEXT NOT NULL, by_email TEXT NOT NULL, by_name TEXT NOT NULL, created_at TEXT NOT NULL)')
			.run();
		await db.prepare("INSERT INTO parent_notices VALUES ('old', 'Alt', 'Text', '', 'v@example.org', 'Vera', '2026-11-01')").run();
		const store = new SqlParentNoticeStore(db);
		await store.create(notice);
		expect((await store.list()).map((one) => [one.id === 'old' ? 'old' : 'new', one.event?.id ?? null])).toEqual([
			['new', 'konzert'],
			['old', null]
		]);
		// A second instance finds the columns there and leaves them.
		expect(await new SqlParentNoticeStore(db).list()).toHaveLength(2);
	});
});

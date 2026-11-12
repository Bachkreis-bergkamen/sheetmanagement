import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { TabKey } from '#lib/repertoire/sheet.ts';
import { memoryStore } from './memory.ts';
import { DataConflictError, prepareImport, schemaSql } from './schema.ts';
import { MIGRATIONS, sqlStore, statements, type D1, type D1Statement } from './sql.ts';

/** D1's API over Node's built-in SQLite, so the SQL and the migrations are tested for real. */
function localD1(): D1 {
	const db = new DatabaseSync(':memory:');
	// As in D1, where links are always checked.
	db.exec('PRAGMA foreign_keys = ON');
	const statement = (sql: string, values: unknown[] = []): D1Statement => {
		// As in D1, which allows at most 5 terms in a compound SELECT (a VALUES list doesn't count); Node's SQLite allows 500.
		if (sql.split(/\b(?:UNION|INTERSECT|EXCEPT)\b/).length > 5) throw new Error('D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR');
		return {
			bind: (...next) => statement(sql, next),
			all: async <T>() => ({ results: db.prepare(sql).all(...values) as T[] }),
			first: async <T>() => (db.prepare(sql).get(...values) as T) ?? null,
			run: async () => db.prepare(sql).run(...values)
		};
	};
	return {
		prepare: (sql) => statement(sql),
		async batch(list) {
			db.exec('BEGIN');
			try {
				const results = [];
				for (const item of list) results.push(await item.run());
				db.exec('COMMIT');
				return results;
			} catch (cause) {
				db.exec('ROLLBACK');
				throw cause;
			}
		}
	};
}

const device = (endpoint: string, email: string) => ({ endpoint, email, p256dh: 'key', auth: 'secret' });

describe.each([
	['d1', () => sqlStore(localD1())],
	['memory', () => memoryStore()]
])('%s store', (_, make) => {
	it('keeps one row per device and finds a member’s devices', async () => {
		const store = make();
		await store.savePush(device('https://push/1', 'a@x.org'));
		await store.savePush(device('https://push/2', 'a@x.org'));
		await store.savePush(device('https://push/3', 'b@x.org'));
		// The same device signed in as someone else: it moves.
		await store.savePush(device('https://push/2', 'b@x.org'));
		expect((await store.pushOf('a@x.org')).map((d) => d.endpoint)).toEqual(['https://push/1']);
		expect((await store.allPush()).length).toBe(3);
		expect((await store.pushOf('b@x.org'))[0].createdAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
		await store.deletePush('https://push/1');
		expect(await store.pushOf('a@x.org')).toEqual([]);
	});

	it('remembers part checks, and dismissed hints until the file changes', async () => {
		const store = make();
		await store.savePartCheck({ fileId: 'f1', modified: '2026-10-01', pages: 4, skipped: false });
		await store.savePartCheck({ fileId: 'f2', modified: '2026-10-01', pages: null, skipped: false });
		await store.dismissPartCheck('f2');
		await store.savePartCheck({ fileId: 'f2', modified: '2026-10-01', pages: null, skipped: false });
		const byId = async () => new Map((await store.partChecks()).map((check) => [check.fileId, check]));
		expect((await byId()).get('f1')).toEqual({ fileId: 'f1', modified: '2026-10-01', pages: 4, skipped: false, dismissed: false });
		expect((await byId()).get('f2')?.dismissed).toBe(true);
		// A new version of the file is checked afresh.
		await store.savePartCheck({ fileId: 'f2', modified: '2026-10-20', pages: 3, skipped: false });
		expect((await byId()).get('f2')).toMatchObject({ pages: 3, dismissed: false });
		await store.clearPartChecks();
		expect(await store.partChecks()).toEqual([]);
	});

	it('logs each reminder once', async () => {
		const store = make();
		await store.logReminder('signup', 'event-1', 'a@x.org');
		await store.logReminder('signup', 'event-1', 'a@x.org');
		await store.logReminder('loan', 'event-1', 'b@x.org');
		expect(await store.sentReminders('signup', ['event-1', 'event-2'])).toEqual(new Set(['event-1\na@x.org']));
		expect(await store.sentReminders('signup', [])).toEqual(new Set());
		// For the member's data export: their own reminders only, with the time sent.
		const mine = await store.remindersOf('a@x.org');
		expect(mine.map(({ kind, subject }) => [kind, subject])).toEqual([['signup', 'event-1']]);
		expect(mine[0].sentAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
		expect(await store.remindersOf('nobody@x.org')).toEqual([]);
		await store.deleteRemindersOf('a@x.org');
		expect(await store.remindersOf('a@x.org')).toEqual([]);
		expect(await store.remindersOf('b@x.org')).toHaveLength(1);
	});

	it('remembers who turned email reminders off (#123)', async () => {
		const store = make();
		await store.setMailOptOut('a@x.org', true);
		await store.setMailOptOut('a@x.org', true);
		await store.setMailOptOut('b@x.org', true);
		await store.setMailOptOut('b@x.org', false);
		expect(await store.mailOptOuts()).toEqual(new Set(['a@x.org']));
	});

	it('keeps one password account per email, replaced by a new password', async () => {
		const store = make();
		expect(await store.accountOf('a@x.org')).toBeNull();
		await store.saveAccount({ email: 'a@x.org', passwordHash: 'hash-1', stamp: 's1' });
		await store.saveAccount({ email: 'a@x.org', passwordHash: 'hash-2', stamp: 's2' });
		expect(await store.accountOf('a@x.org')).toEqual({ email: 'a@x.org', passwordHash: 'hash-2', stamp: 's2' });
		await store.deleteAccount('a@x.org');
		expect(await store.accountOf('a@x.org')).toBeNull();
	});

	it('counts page openings per route and role, summed over days, and forgets old days (#185)', async () => {
		const store = make();
		await store.countPage('2026-11-01', '/stuecke/[id]', 'mitglied');
		await store.countPage('2026-11-02', '/stuecke/[id]', 'mitglied');
		await store.countPage('2026-11-02', '/stuecke/[id]', 'verwaltung');
		await store.countPage('2026-11-02', '/', 'mitglied');
		await store.countPage('2026-10-01', '/', 'mitglied');
		expect(await store.pageCounts('2026-11-01')).toEqual([
			{ route: '/stuecke/[id]', role: 'mitglied', views: 2 },
			{ route: '/', role: 'mitglied', views: 1 },
			{ route: '/stuecke/[id]', role: 'verwaltung', views: 1 }
		]);
		await store.prunePageCounts('2026-11-02');
		expect(await store.pageCounts('2000-01-01')).toEqual([
			{ route: '/', role: 'mitglied', views: 1 },
			{ route: '/stuecke/[id]', role: 'mitglied', views: 1 },
			{ route: '/stuecke/[id]', role: 'verwaltung', views: 1 }
		]);
	});

	it('remembers how the tour ended, until it is forgotten', async () => {
		const store = make();
		expect(await store.tourOf('a@x.org')).toBeNull();
		await store.setTour('a@x.org', 'skipped');
		await store.setTour('a@x.org', 'done');
		await store.setTour('b@x.org', 'skipped');
		expect(await store.tourOf('a@x.org')).toBe('done');
		await store.setTour('b@x.org', null);
		expect(await store.tourOf('b@x.org')).toBeNull();
	});

	it('keeps practice time per member and day, capped per day, and only for that member', async () => {
		const store = make();
		expect(await store.practiceOn('a@x.org')).toBe(false);
		await store.setPracticeOn('a@x.org', true);
		await store.setPracticeOn('a@x.org', true);
		expect(await store.practiceOn('a@x.org')).toBe(true);
		expect(await store.practiceOn('b@x.org')).toBe(false);

		await store.addPractice('a@x.org', '2026-10-24', 30, 100);
		await store.addPractice('a@x.org', '2026-10-24', 60, 100);
		await store.addPractice('a@x.org', '2026-10-24', 60, 100);
		await store.addPractice('a@x.org', '2026-10-20', 45, 100);
		await store.addPractice('b@x.org', '2026-10-24', 500, 100);
		expect(await store.practiceOf('a@x.org')).toEqual([
			{ day: '2026-10-20', seconds: 45 },
			{ day: '2026-10-24', seconds: 100 }
		]);
		// One member's time is never part of another's.
		expect(await store.practiceOf('b@x.org')).toEqual([{ day: '2026-10-24', seconds: 100 }]);
		expect(await store.practiceOf('c@x.org')).toEqual([]);

		// Off keeps the time; deleting forgets it, only the member's own.
		await store.setPracticeOn('a@x.org', false);
		expect(await store.practiceOn('a@x.org')).toBe(false);
		expect((await store.practiceOf('a@x.org')).length).toBe(2);
		await store.deletePractice('a@x.org');
		expect(await store.practiceOf('a@x.org')).toEqual([]);
		expect((await store.practiceOf('b@x.org')).length).toBe(1);
	});

	it('keeps what members share from the Übebereich, and forgets it when they stop', async () => {
		const store = make();
		const row = (day: string, skill: string, answers: number) => ({ day, skill, answers, right: answers - 1, seconds: answers * 3 });
		expect(await store.drillSharing('a@x.org')).toBeNull();
		await store.setDrillSharing('a@x.org', { board: true, leaders: false, parents: true });
		await store.setDrillSharing('b@x.org', { board: false, leaders: true, parents: false });
		expect(await store.drillSharing('a@x.org')).toEqual({ board: true, leaders: false, parents: true });
		expect([...(await store.drillSharingAll()).keys()].sort()).toEqual(['a@x.org', 'b@x.org']);

		await store.saveDrillDays('a@x.org', [row('2026-11-10', 'notes', 10), row('2026-11-12', 'scale', 4)]);
		// Sent again from the device: replaced, not added up.
		await store.saveDrillDays('a@x.org', [row('2026-11-12', 'scale', 6)]);
		await store.saveDrillDays('b@x.org', [row('2026-11-12', 'notes', 2)]);
		expect(await store.drillDaysOf(['a@x.org'], '2026-11-11')).toEqual([{ email: 'a@x.org', ...row('2026-11-12', 'scale', 6) }]);
		expect((await store.drillDaysOf(['a@x.org', 'b@x.org'], '2026-11-01')).map((each) => each.email)).toEqual(['a@x.org', 'a@x.org', 'b@x.org']);
		expect(await store.drillDaysOf([], '2026-11-01')).toEqual([]);

		// Sharing nothing deletes the choice and what was sent.
		await store.setDrillSharing('a@x.org', { board: false, leaders: false, parents: false });
		expect(await store.drillSharing('a@x.org')).toBeNull();
		expect(await store.drillDaysOf(['a@x.org'], '2026-01-01')).toEqual([]);
		expect((await store.drillDaysOf(['b@x.org'], '2026-01-01')).length).toBe(1);

		expect(await store.drillConsentOf('kid@x.org')).toBeNull();
		await store.setDrillConsent('kid@x.org', 'mum@x.org', true);
		expect(await store.drillConsentOf('kid@x.org')).toBe('mum@x.org');
		await store.setDrillConsent('kid@x.org', 'mum@x.org', false);
		expect(await store.drillConsentOf('kid@x.org')).toBeNull();
	});

	it('keeps the drills an administrator opened for a member (#327)', async () => {
		const store = make();
		expect(await store.drillUnlocksOf('pro@x.org')).toEqual([]);
		await store.setDrillUnlocks('pro@x.org', ['sight', 'entry', 'sight'], 'admin@x.org');
		await store.setDrillUnlocks('b@x.org', ['tune'], 'admin@x.org');
		expect(await store.drillUnlocksOf('pro@x.org')).toEqual(['entry', 'sight']);
		expect(await store.drillUnlocksAll()).toEqual(new Map([['b@x.org', ['tune']], ['pro@x.org', ['entry', 'sight']]]));
		// Replaced as a whole; none forgets them.
		await store.setDrillUnlocks('pro@x.org', ['scale'], 'admin@x.org');
		expect(await store.drillUnlocksOf('pro@x.org')).toEqual(['scale']);
		await store.setDrillUnlocks('pro@x.org', [], 'admin@x.org');
		expect(await store.drillUnlocksOf('pro@x.org')).toEqual([]);
	});

	it('keeps a member’s own marks per part and page, for that member only', async () => {
		const store = make();
		const line = (color: 'red' | 'blue') => [{ color, points: [0.1, 0.2, 0.3, 0.4] }];
		await store.saveMarks('a@x.org', 'file-1', 2, line('red'));
		await store.saveMarks('a@x.org', 'file-1', 1, line('blue'));
		await store.saveMarks('a@x.org', 'file-2', 1, line('red'));
		await store.saveMarks('b@x.org', 'file-1', 1, line('red'));
		// Saving a page again replaces it.
		await store.saveMarks('a@x.org', 'file-1', 2, line('blue'));
		expect(await store.marksOf('a@x.org', 'file-1')).toEqual([
			{ file: 'file-1', page: 1, strokes: line('blue') },
			{ file: 'file-1', page: 2, strokes: line('blue') }
		]);
		expect((await store.marksOf('a@x.org')).map((page) => `${page.file}:${page.page}`)).toEqual(['file-1:1', 'file-1:2', 'file-2:1']);
		// Another member's marks in the same part are theirs.
		expect(await store.marksOf('b@x.org', 'file-1')).toEqual([{ file: 'file-1', page: 1, strokes: line('red') }]);

		// No strokes forget the page; deleting forgets only the member's own.
		await store.saveMarks('a@x.org', 'file-1', 2, []);
		expect((await store.marksOf('a@x.org', 'file-1')).length).toBe(1);
		await store.deleteMarks('a@x.org');
		expect(await store.marksOf('a@x.org')).toEqual([]);
		expect((await store.marksOf('b@x.org')).length).toBe(1);
	});

	it('offers a member’s marks to their section until each answers, once per part', async () => {
		const store = make();
		const pages = { 1: [{ color: 'red' as const, points: [0.5, 0.5], symbol: 'downbow' as const }] };
		const first = await store.shareMarks('a@x.org', 'file-1', pages);
		expect(first).toMatchObject({ sender: 'a@x.org', file: 'file-1', pages });
		expect(await store.shareOf('a@x.org', 'file-1')).toMatchObject({ id: first.id });
		// Not to the member themself, nor in another part.
		expect(await store.sharesFor('a@x.org', 'file-1')).toEqual([]);
		expect(await store.sharesFor('b@x.org', 'file-2')).toEqual([]);
		expect((await store.sharesFor('b@x.org', 'file-1')).map((share) => share.id)).toEqual([first.id]);

		// Answered, it's gone for them, not for others.
		await store.answerShare(first.id, 'b@x.org', 'declined');
		expect(await store.sharesFor('b@x.org', 'file-1')).toEqual([]);
		expect((await store.sharesFor('c@x.org', 'file-1')).length).toBe(1);

		// Offered again, it replaces the first, and everyone answers anew.
		const again = await store.shareMarks('a@x.org', 'file-1', { 2: pages[1] });
		expect(await store.shareById(first.id)).toBeNull();
		expect((await store.sharesFor('b@x.org', 'file-1')).map((share) => share.pages)).toEqual([{ 2: pages[1] }]);
		expect(await store.shareById(again.id)).toMatchObject({ id: again.id });

		// Taken back, or with the member's marks deleted, it's gone.
		await store.unshareMarks('a@x.org', 'file-1');
		expect(await store.sharesFor('b@x.org', 'file-1')).toEqual([]);
		await store.shareMarks('a@x.org', 'file-1', pages);
		await store.deleteMarks('a@x.org');
		expect(await store.shareOf('a@x.org', 'file-1')).toBeNull();
	});

	it('groups errors by kind, until they are notified and forgotten (#191)', async () => {
		const store = make();
		const report = { source: 'server' as const, place: '/stuecke/[id]', message: 'Sheet unreadable', status: 500 };
		await store.logError(report);
		await store.logError(report);
		await store.logError({ ...report, source: 'client', status: undefined });
		const log = await store.errorLog(7);
		expect(log).toHaveLength(2);
		const server = log.find((group) => group.source === 'server')!;
		expect(server).toMatchObject({ place: '/stuecke/[id]', message: 'Sheet unreadable', status: 500, count: 2, notified: false });
		await store.markErrorsNotified([server.fingerprint]);
		expect((await store.errorLog(7)).filter((group) => group.notified)).toHaveLength(1);
		await store.pruneErrors(30);
		expect(await store.errorLog(7)).toHaveLength(2);
		await store.pruneErrors(0);
		expect(await store.errorLog(7)).toEqual([]);
	});

	/** The sheet's rows as the import takes them: numbered from row 2. */
	const sheet = (tabs: Partial<Record<TabKey, Record<string, string>[]>>) =>
		prepareImport(Object.fromEntries(Object.entries(tabs).map(([tab, rows]) => [tab, rows!.map((cells, i) => ({ row: i + 2, cells }))])));
	const sample = () =>
		sheet({
			pieces: [{ title: 'Moldau', driveFolderId: 'f1' }, { title: 'Boléro' }],
			concerts: [{ title: 'Herbstkonzert', eventId: 'e1' }, { title: 'Zweites Herbstkonzert', sameProgramAs: 'herbstkonzert' }],
			program: [
				{ concert: 'Herbstkonzert', position: '1', piece: 'moldau' },
				{ concert: 'Herbstkonzert', position: '2', piece: 'Zugabe' }
			]
		});

	it('keeps the orchestra’s data by tab, in order, and counts every change (#186)', async () => {
		const store = make();
		expect(await store.dataState()).toEqual({ source: 'sheet', version: 0 });
		await store.importData(sample(), ['pieces', 'concerts', 'program']);
		const imported = await store.dataState();
		expect(imported.source).toBe('d1');
		const data = await store.readData();
		expect(Object.keys(data).sort()).toEqual(['concerts', 'pieces', 'program']);
		expect(data.pieces!.map((row) => row.cells.title)).toEqual(['Moldau', 'Boléro']);
		// A link reads as the name it points to, spelt as there; a name that matches nothing stays as written.
		expect(data.program!.map((row) => [row.cells.concert, row.cells.piece])).toEqual([
			['Herbstkonzert', 'Moldau'],
			['Herbstkonzert', 'Zugabe']
		]);
		expect(data.concerts![1].cells.sameProgramAs).toBe('Herbstkonzert');

		await store.addDataTab('loans');
		await store.replaceData('missingParts', [{ fileId: 'x1' }]);
		const later = await store.readData(['loans', 'missingParts']);
		expect(later.loans).toEqual([]);
		expect(later.missingParts!.map((row) => row.cells)).toEqual([{ fileId: 'x1' }]);
		expect((await store.dataState()).version).toBeGreaterThan(imported.version + 1);

		await store.setDataSource('sheet');
		expect((await store.dataState()).source).toBe('sheet');
	});

	it('follows a renamed piece or concert everywhere it is linked', async () => {
		const store = make();
		await store.importData(sample(), ['pieces', 'concerts', 'program']);
		const [moldau] = (await store.readData(['pieces'])).pieces!;
		await store.updateData('pieces', [{ ...moldau, cells: { ...moldau.cells, title: 'Die Moldau' } }]);
		const [herbst] = (await store.readData(['concerts'])).concerts!;
		await store.updateData('concerts', [{ ...herbst, cells: { ...herbst.cells, title: 'Herbstkonzert 2026' } }]);
		const data = await store.readData();
		expect(data.program!.map((row) => [row.cells.concert, row.cells.piece])).toEqual([
			['Herbstkonzert 2026', 'Die Moldau'],
			['Herbstkonzert 2026', 'Zugabe']
		]);
		expect(data.concerts![1].cells.sameProgramAs).toBe('Herbstkonzert 2026');
	});

	it('keeps concerts of one name apart by their day, and names them with it (#330)', async () => {
		const store = make();
		await store.importData(
			sheet({
				pieces: [{ title: 'Moldau' }],
				concerts: [
					{ title: 'Weihnachtskonzert', date: '21.12.1957' },
					{ title: 'Weihnachtskonzert', date: '1958-12-20' },
					{ title: 'weihnachtskonzert', date: '1957-12-21' }
				],
				program: [
					{ concert: 'Weihnachtskonzert (20.12.1958)', position: '1', piece: 'Moldau' },
					{ concert: 'Weihnachtskonzert', position: '1', piece: 'Moldau' }
				]
			}),
			['pieces', 'concerts', 'program']
		);
		const data = await store.readData();
		// The third is the first again on the same day; the bare name names neither.
		expect(data.concerts!.map((row) => row.cells.date)).toEqual(['21.12.1957', '1958-12-20']);
		expect(data.program!.map((row) => row.cells.concert)).toEqual(['Weihnachtskonzert (20.12.1958)']);
		await expect(store.appendData('concerts', [{ title: 'Weihnachtskonzert', date: '1958-12-20' }])).rejects.toMatchObject({ kind: 'unique' });
		await store.appendData('program', [{ concert: 'Weihnachtskonzert (21.12.1957)', position: '1', piece: 'Moldau' }]);
		expect((await store.readData(['program'])).program!.map((row) => row.cells.concert)).toEqual(['Weihnachtskonzert (20.12.1958)', 'Weihnachtskonzert (21.12.1957)']);
	});

	it('refuses what breaks a link or check, and then changes nothing', async () => {
		const store = make();
		await store.importData(sample(), ['pieces', 'concerts', 'program']);
		const before = await store.readData();
		// A second piece of the same name (without case and accents), a second folder, a row without either.
		await expect(store.appendData('pieces', [{ title: 'Finlandia' }, { title: 'BOLERO' }])).rejects.toMatchObject({ kind: 'unique' });
		await expect(store.appendData('pieces', [{ title: 'Neu', driveFolderId: 'f1' }])).rejects.toMatchObject({ kind: 'unique' });
		await expect(store.appendData('pieces', [{ composer: 'Smetana' }])).rejects.toMatchObject({ kind: 'required' });
		// A programme row needs its concert.
		await expect(store.appendData('program', [{ concert: 'Gibt es nicht', piece: 'Moldau' }])).rejects.toMatchObject({ kind: 'link', column: 'concert' });
		// A piece in a programme can't go; a concert takes its programme with it.
		const pieces = before.pieces!;
		await expect(store.deleteData('pieces', [pieces[0]])).rejects.toMatchObject({ kind: 'used' });
		expect(await store.readData()).toEqual(before);
		await store.deleteData('concerts', [before.concerts![0]]);
		const after = await store.readData();
		expect(after.program).toEqual([]);
		expect(after.concerts!.map((row) => row.cells)).toEqual([{ title: 'Zweites Herbstkonzert' }]);
	});

	it('refuses a save or delete of a row changed since it was read', async () => {
		const store = make();
		await store.importData(sample(), ['pieces', 'concerts', 'program']);
		const [, bolero] = (await store.readData(['pieces'])).pieces!;
		await store.updateData('pieces', [{ ...bolero, cells: { ...bolero.cells, notes: 'eins' } }]);
		await expect(store.updateData('pieces', [{ ...bolero, cells: { ...bolero.cells, notes: 'zwei' } }])).rejects.toBeInstanceOf(DataConflictError);
		await expect(store.deleteData('pieces', [bolero])).rejects.toBeInstanceOf(DataConflictError);
		const now = (await store.readData(['pieces'])).pieces![1];
		expect(now.cells.notes).toBe('eins');
		expect(now.rev).toBe(bolero.rev + 1);
	});

	it('imports many rows in one go', async () => {
		const store = make();
		const rows = Array.from({ length: 2000 }, (_, i) => ({ title: `Stück ${i} – ein „langer“ Titel mit 'Apostroph'`, notes: 'x'.repeat(40) }));
		await store.importData(sheet({ pieces: rows }), ['pieces']);
		const data = await store.readData();
		expect(data.pieces).toHaveLength(2000);
		expect(data.pieces![7].cells.title).toBe(rows[7].title);
	});

	it('imports many short rows', async () => {
		const store = make();
		await store.importData(sheet({ pieces: Array.from({ length: 1200 }, (_, i) => ({ title: `${i}` })) }), ['pieces']);
		expect((await store.readData()).pieces).toHaveLength(1200);
	});

	it('counts uses for rate limits', async () => {
		const store = make();
		expect(await store.hit('mail:a@x.org', 60)).toBe(1);
		expect(await store.hit('mail:a@x.org', 60)).toBe(2);
		expect(await store.hit('mail:b@x.org', 60)).toBe(1);
	});

	it('keeps values between runs', async () => {
		const store = make();
		expect(await store.getState('check')).toBeNull();
		await store.setState('check', 'ok');
		await store.setState('check', 'failed');
		expect(await store.getState('check')).toBe('failed');
	});

	it('sells concert tickets up to the capacity and checks them in once', async () => {
		const store = make();
		const sale = {
			concertId: 'c1',
			seating: 'free' as const,
			capacity: 3,
			prices: [{ type: 'erwachsene', label: 'Erwachsene', cents: 1200 }],
			onlineFee: { percent: 3.5, cents: 25 },
			onlineUntil: '2026-11-21T15:00:00.000Z',
			open: true
		};
		await store.saveTicketSale(sale);
		await store.saveTicketSale({ ...sale, capacity: 4 });
		expect(await store.ticketSale('c1')).toEqual({ ...sale, capacity: 4 });
		expect(await store.ticketSale('c2')).toBeNull();

		const order = (id: string) => ({ id, concertId: 'c1', name: `Gast ${id}`, email: `${id}@x.org`, channel: 'online' as const, status: 'reserved' as const, createdAt: '' });
		const tickets = (orderId: string, n: number) =>
			Array.from({ length: n }, (_, i) => ({ code: `${orderId}-${i}`, orderId, concertId: 'c1', seat: '', type: 'erwachsene', cents: 1267, feeCents: 67 }));
		expect(await store.placeTicketOrder(order('a'), tickets('a', 3), 4)).toBe(true);
		// Two more don't fit, and the order isn't kept either.
		expect(await store.placeTicketOrder(order('b'), tickets('b', 2), 4)).toBe(false);
		expect(await store.ticketOrder('b')).toBeNull();
		expect(await store.placeTicketOrder(order('c'), tickets('c', 1), 4)).toBe(true);
		// A cancelled order frees its seats.
		await store.setTicketOrderStatus('a', 'cancelled');
		expect(await store.placeTicketOrder(order('d'), tickets('d', 3), 4)).toBe(true);

		const found = await store.ticketOrder('c');
		expect(found?.order).toMatchObject({ name: 'Gast c', email: 'c@x.org', status: 'reserved' });
		expect(found?.tickets).toEqual([{ code: 'c-0', orderId: 'c', concertId: 'c1', seat: '', type: 'erwachsene', cents: 1267, feeCents: 67 }]);

		await store.checkInTickets('c1', [{ code: 'c-0', at: '2026-11-21T16:01:00.000Z', by: 'tuer@x.org' }]);
		await store.checkInTickets('c1', [{ code: 'c-0', at: '2026-11-21T16:05:00.000Z', by: 'tuer2@x.org' }]);
		// Not this concert's ticket: nothing happens.
		await store.checkInTickets('c2', [{ code: 'd-0', at: '2026-11-21T16:05:00.000Z', by: 'tuer2@x.org' }]);
		const all = await store.ticketOrders('c1');
		expect(all.orders.map((o) => o.id)).toEqual(['a', 'c', 'd']);
		expect(all.tickets.find((t) => t.code === 'c-0')).toMatchObject({ checkedInAt: '2026-11-21T16:01:00.000Z', checkedInBy: 'tuer@x.org' });
		expect(all.tickets.find((t) => t.code === 'd-0')?.checkedInAt).toBeUndefined();

		// The hall is full online (c, d: 4 of 4), but Freikarten come on top and are kept as such.
		const free = { ...order('f'), email: '', channel: 'free' as const, status: 'paid' as const };
		expect(await store.placeTicketOrder(free, tickets('f', 2).map((t) => ({ ...t, type: 'freikarte', cents: 0, feeCents: 0 })), null)).toBe(true);
		expect((await store.ticketOrder('f'))?.order).toMatchObject({ email: '', channel: 'free', status: 'paid' });
		// And they don't take seats online: with d cancelled, three fit again.
		await store.setTicketOrderStatus('d', 'cancelled');
		expect(await store.placeTicketOrder(order('g'), tickets('g', 3), 4)).toBe(true);

		await store.deleteTicketsOf('c1');
		expect(await store.ticketOrders('c1')).toEqual({ orders: [], tickets: [] });
		expect(await store.ticketSales()).toEqual([]);
	});

	it('creates its schema on first use', async () => {
		const store = make();
		await store.getState('anything');
		expect(await store.schemaVersion()).toBe(MIGRATIONS.at(-1)?.[0]);
	});
});

describe('the import', () => {
	it('leaves out what the app ignores already, saying why', () => {
		const { rows, skipped } = prepareImport({
			pieces: [
				{ row: 2, cells: { title: 'Moldau' } },
				{ row: 3, cells: { title: 'moldau' } },
				{ row: 4, cells: { composer: 'Smetana' } }
			],
			concerts: [{ row: 2, cells: { title: 'Herbst' } }],
			program: [
				{ row: 2, cells: { concert: 'Herbst', piece: 'Moldau' } },
				{ row: 3, cells: { concert: 'Frühling', piece: 'Moldau' } }
			]
		});
		expect(rows.pieces).toHaveLength(1);
		expect(rows.program).toHaveLength(1);
		expect(skipped).toEqual([
			{ tab: 'pieces', row: 3, kind: 'unique', column: 'title', value: 'moldau' },
			{ tab: 'pieces', row: 4, kind: 'required', column: 'title', value: '' },
			{ tab: 'program', row: 3, kind: 'link', column: 'concert', value: 'Frühling' }
		]);
	});
});

describe('migrations', () => {
	it('give the tables of the schema in schema.ts', () => {
		// 0009 created them, later ones add columns and tables: the result must be what schema.ts describes.
		const tablesOf = (db: DatabaseSync) => {
			const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%"rev" INTEGER%' ORDER BY name`).all() as { name: string }[]).map((row) => row.name);
			return Object.fromEntries(
				names.map((name) => [
					name,
					{
						columns: (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[])
							.map(({ name, type, notnull, dflt_value, pk }) => ({ name, type, notnull, dflt_value, pk }))
							.sort((a, b) => a.name.localeCompare(b.name)),
						unique: (db.prepare(`PRAGMA index_list("${name}")`).all() as { name: string; unique: number }[])
							.filter((index) => index.unique)
							.map((index) => (db.prepare(`PRAGMA index_info("${index.name}")`).all() as { name: string }[]).map((column) => column.name).join(','))
							.sort(),
						foreignKeys: (db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { from: string; table: string; on_delete: string }[])
							.map(({ from, table, on_delete }) => `${from}→${table} ${on_delete}`)
							.sort()
					}
				])
			);
		};
		const migrated = new DatabaseSync(':memory:');
		for (const [, sql] of MIGRATIONS) for (const statement of statements(sql)) migrated.exec(statement);
		const fresh = new DatabaseSync(':memory:');
		for (const statement of schemaSql()) fresh.exec(statement);
		expect(tablesOf(migrated)).toEqual(tablesOf(fresh));
	});

	it('0009 creates its tables as schema.ts did then', () => {
		const migration = MIGRATIONS.find(([name]) => name === '0009_data.sql')![1];
		const tables = statements(migration).filter((statement) => statement.includes('"id" INTEGER PRIMARY KEY'));
		expect(tables.length).toBeGreaterThan(10);
		expect(tables.every((statement) => statement.startsWith('CREATE TABLE IF NOT EXISTS'))).toBe(true);
	});

	it('are found and split into statements', () => {
		expect(MIGRATIONS.map(([name]) => name)).toContain('0001_reminders.sql');
		expect(statements('-- a comment; with a semicolon\nCREATE TABLE a (x);\n\nCREATE TABLE b (y);\n')).toEqual(['CREATE TABLE a (x)', 'CREATE TABLE b (y)']);
	});

	it('run once, also when started twice', async () => {
		const store = sqlStore(localD1());
		expect(await store.migrate()).toEqual(MIGRATIONS.map(([name]) => name));
		expect(await store.migrate()).toEqual([]);
	});
});

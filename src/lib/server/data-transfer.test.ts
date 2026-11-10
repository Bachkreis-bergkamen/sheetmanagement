import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT, readTable } from '#lib/repertoire/sheet.ts';
import { memoryStore } from './db/memory.ts';
import { demoClient, resetDemo } from './demo/backend.ts';
import { DEMO_IDS } from './demo/data.ts';
import { getValues, tabRange } from './google/sheets.ts';

/** The whole move (#186) against the demo's stand-in for Google and the memory store. */

let store = memoryStore();
vi.mock('./db/index.ts', () => ({ getStore: () => store }));
vi.mock('./services.ts', () => ({ getGoogle: () => ({ client: demoClient() }), requireSetting: () => DEMO_IDS.sheet, NotConfiguredError: class extends Error {} }));
vi.mock('./repertoire.ts', async (original) => ({ ...(await original<typeof import('./repertoire.ts')>()), getRepertoire: vi.fn(async () => ({ ok: false })) }));

const { forgetDataState } = await import('./data-source.ts');
const { appendRecords, deleteRows, readTab, replaceRows, updateRecord } = await import('./sheet-writes.ts');
const { allData, backToSheet, backupTabs, BackupFormatError, changedSinceExport, exportToSheet, importFromSheet, planImport, restoreFromBackup } = await import('./data-transfer.ts');

const sheetPieces = async () => {
	const range = tabRange(LAYOUT.pieces.tab);
	return readTable((await getValues(demoClient(), DEMO_IDS.sheet, [range]))[range], LAYOUT.pieces.columns).rows.map((row) => row.values);
};

beforeEach(() => {
	resetDemo();
	store = memoryStore();
	forgetDataState();
});

describe('moving the data into D1', () => {
	it('shows what it would take over without changing anything', async () => {
		const plan = await planImport();
		const pieces = plan.tabs.find((tab) => tab.key === 'pieces')!;
		expect(pieces.rows).toBe((await sheetPieces()).length);
		expect(plan.rows).toBeGreaterThan(pieces.rows);
		expect((await store.dataState()).source).toBe('sheet');
	});

	it('takes the sheet over, so reads come from D1 with the same rows', async () => {
		const before = await sheetPieces();
		await importFromSheet();
		expect((await store.dataState()).source).toBe('d1');
		expect((await readTab('pieces')).rows.map((row) => row.values)).toEqual(before);
	});

	it('saves into D1 with the same functions, finding rows by content', async () => {
		await importFromSheet();
		let pieces = await readTab('pieces');
		const [first, second] = pieces.rows;
		await updateRecord('pieces', pieces, second.row, { notes: 'Neu eingerichtet' });
		await appendRecords('pieces', pieces, [{ title: 'Finlandia', composer: 'Sibelius' }]);
		pieces = await readTab('pieces');
		expect(pieces.rows.find((row) => row.values.title === second.values.title)?.values.notes).toBe('Neu eingerichtet');
		expect(pieces.rows.at(-1)?.values).toMatchObject({ title: 'Finlandia', composer: 'Sibelius' });

		// A piece in a programme can't go; one in none can.
		await expect(deleteRows('pieces', pieces, [pieces.rows[0].row])).rejects.toMatchObject({ status: 409 });
		await deleteRows('pieces', pieces, [pieces.rows.at(-1)!.row]);
		expect((await readTab('pieces')).rows.map((row) => row.values.title)).not.toContain('Finlandia');
		// The sheet isn't touched until the export.
		expect((await sheetPieces())[0].title).toBe(first.values.title);
		expect((await sheetPieces()).find((row) => row.title === second.values.title)?.notes).not.toBe('Neu eingerichtet');
	});

	it('follows a renamed piece into its programmes', async () => {
		await importFromSheet();
		const program = await readTab('program');
		const title = program.rows[0].values.piece;
		const pieces = await readTab('pieces');
		const row = pieces.rows.find((r) => r.values.title === title)!;
		await updateRecord('pieces', pieces, row.row, { title: `${title} (neu)` });
		const now = await readTab('program');
		expect(now.rows.filter((r) => r.values.piece === title)).toEqual([]);
		expect(now.rows[0].values.piece).toBe(`${title} (neu)`);
	});

	it('refuses a save to a row someone else changed meanwhile', async () => {
		await importFromSheet();
		const pieces = await readTab('pieces');
		await updateRecord('pieces', pieces, pieces.rows[0].row, { notes: 'eins' });
		await expect(updateRecord('pieces', pieces, pieces.rows[0].row, { notes: 'zwei' })).rejects.toMatchObject({ status: 409 });
	});

	it('replaces a generated tab without its padding', async () => {
		await importFromSheet();
		const columns = Object.keys(LAYOUT.missingParts.columns);
		const row = columns.map((column) => (column === 'fileId' ? 'f1' : column === 'done' ? true : ''));
		await replaceRows('missingParts', [row, columns.map(() => '')]);
		expect((await store.readData(['missingParts'])).missingParts!.map((r) => r.cells)).toEqual([{ fileId: 'f1', done: 'TRUE' }]);
	});

	it('knows whether anything changed since the last export', async () => {
		await importFromSheet();
		expect(await changedSinceExport()).toBe(true);
		await exportToSheet();
		expect(await changedSinceExport()).toBe(false);
		const pieces = await readTab('pieces');
		await updateRecord('pieces', pieces, pieces.rows[0].row, { notes: 'geändert' });
		expect(await changedSinceExport()).toBe(true);
	});

	it('writes D1 back into the sheet, and can make the sheet the source again', async () => {
		await importFromSheet();
		const pieces = await readTab('pieces');
		await updateRecord('pieces', pieces, pieces.rows[0].row, { notes: 'Aus D1' });
		const exported = await exportToSheet();
		expect(exported.rows).toBeGreaterThan(0);
		expect((await sheetPieces()).map((row) => row.notes)).toEqual((await readTab('pieces')).rows.map((row) => row.values.notes));

		await backToSheet();
		expect((await store.dataState()).source).toBe('sheet');
		expect((await readTab('pieces')).rows[0].values.notes).toBe('Aus D1');
	});
});

describe('backupTabs', () => {
	it('reads the tabs of a downloaded backup, numbered like sheet rows', () => {
		const tabs = backupTabs({ exportedAt: '2026-10-30T00:00:00Z', source: 'd1', tabs: { pieces: [{ title: 'Elegie', duration: '' }, { title: 'Air' }] } });
		expect(tabs.pieces).toEqual([
			{ row: 2, cells: { title: 'Elegie' } },
			{ row: 3, cells: { title: 'Air' } }
		]);
	});

	it('leaves out unknown tabs, unknown columns and values that are not text', () => {
		const tabs = backupTabs({ tabs: { pieces: [{ title: 'Elegie', invented: 'x', duration: 3 }, 'nonsense'], invented: [{ a: 'b' }] } });
		expect(tabs).toEqual({ pieces: [{ row: 2, cells: { title: 'Elegie' } }] });
	});

	it('leaves out rows with nothing but an unticked checkbox', () => {
		const tabs = backupTabs({ tabs: { loans: [{ returned: 'FALSE' }, { piece: 'Elegie', returned: 'FALSE' }] } });
		expect(tabs).toEqual({ loans: [{ row: 3, cells: { piece: 'Elegie', returned: 'FALSE' } }] });
	});

	it('refuses anything that is not a backup', () => {
		for (const file of [null, {}, { tabs: [] }, { tabs: { invented: [] } }, [1, 2]]) expect(() => backupTabs(file)).toThrow(BackupFormatError);
	});
});

describe('restoreFromBackup', () => {
	it('brings back what "Alles herunterladen" saved, into a fresh database', async () => {
		await importFromSheet();
		const backup = JSON.parse(JSON.stringify(await allData()));
		const before = (await readTab('pieces')).rows.map((row) => row.values);

		store = memoryStore();
		forgetDataState();
		const plan = await restoreFromBackup(backup);
		expect(plan.skipped).toEqual([]);
		expect((await store.dataState()).source).toBe('d1');
		expect((await readTab('pieces')).rows.map((row) => row.values)).toEqual(before);
	});
});

import { LAYOUT, normalize, readTable, type TabKey } from '#lib/repertoire/sheet.ts';
import { toSheetRow } from '#lib/repertoire/link.ts';
import { dataState, forgetDataState, gridOf } from './data-source.ts';
import { getStore } from './db/index.ts';
import { prepareImport, type SkippedRow } from './db/schema.ts';
import { batchUpdate, clearValues, getTabs, getValues, tabRange, updateValues } from './google/sheets.ts';
import { getRepertoire, readSheetGrids } from './repertoire.ts';
import { getGoogle, requireSetting } from './services.ts';
import { withSheetLock } from './sheet-lock.ts';

/**
 * Moving the data between the sheet and D1 (#186). The import reads every tab once, checks it
 * and replaces everything in D1 in one transaction, which also makes D1 the source. From then
 * on the export writes D1 back into the sheet every night, as a copy to read and print and as
 * a backup outside Cloudflare. "Zurück zur Tabelle" exports once more and makes the sheet the
 * source again, so the move can be undone.
 */

export interface TabPlan {
	key: TabKey;
	tab: string;
	rows: number;
	/** Columns the tab has that the app doesn't know: they aren't imported. */
	unknown: string[];
	/** Columns the app knows that the tab lacks: empty after the import. */
	missing: string[];
}

export interface ImportPlan {
	tabs: TabPlan[];
	/** Rows that go into D1. */
	rows: number;
	/** Rows that break a link or check and stay behind, with why. */
	skipped: SkippedRow[];
}

const columnsOf = (key: TabKey) => LAYOUT[key].columns as Record<string, string>;

function target() {
	return { client: getGoogle().client, spreadsheetId: requireSetting('REPERTOIRE_SHEET_ID') };
}

/** Rows of every tab by column key, read from the sheet now. */
async function readSheetRecords() {
	const { client, spreadsheetId } = target();
	const grids = await readSheetGrids(client, spreadsheetId);
	return (Object.entries(grids) as [TabKey, string[][]][]).map(([key, grid]) => {
		const table = readTable(grid, columnsOf(key));
		const known = new Set(Object.values(columnsOf(key)).map(normalize));
		const rows = table.rows.map((row) => ({ row: row.row, cells: Object.fromEntries(Object.entries(row.values).filter(([, value]) => value)) as Record<string, string> }));
		return {
			plan: {
				key,
				tab: LAYOUT[key].tab,
				rows: rows.length,
				unknown: (grid[0] ?? []).filter((name) => name.trim() && !known.has(normalize(name))),
				missing: table.missing.map((column) => columnsOf(key)[column])
			} satisfies TabPlan,
			rows
		};
	});
}

/** The sheet's rows checked against the schema, and what the import would do with them. */
function prepare(tabs: Awaited<ReturnType<typeof readSheetRecords>>) {
	const prepared = prepareImport(Object.fromEntries(tabs.map(({ plan, rows }) => [plan.key, rows])));
	const plans = tabs.map(({ plan }) => ({ ...plan, rows: prepared.rows[plan.key]?.length ?? 0 }));
	return { prepared, plan: { tabs: plans, rows: plans.reduce((sum, tab) => sum + tab.rows, 0), skipped: prepared.skipped } satisfies ImportPlan };
}

/** What the import would take over, and what not, without changing anything. */
export async function planImport(): Promise<ImportPlan> {
	return prepare(await readSheetRecords()).plan;
}

export class BackupFormatError extends Error {
	constructor() {
		super('Not a backup of this app');
		this.name = 'BackupFormatError';
	}
}

/**
 * The tabs of a backup file ("Alles herunterladen", or the weekly copy in Drive), checked:
 * only tabs and columns the app knows, only text values. Rows are numbered as in a sheet, so
 * the import's hints ("Zeile 7") point at the right entry.
 */
export function backupTabs(backup: unknown): Partial<Record<TabKey, { row: number; cells: Record<string, string> }[]>> {
	const tabs = (backup as { tabs?: unknown } | null)?.tabs;
	if (!tabs || typeof tabs !== 'object' || Array.isArray(tabs)) throw new BackupFormatError();
	const result: Partial<Record<TabKey, { row: number; cells: Record<string, string> }[]>> = {};
	for (const [key, rows] of Object.entries(tabs)) {
		if (!(key in LAYOUT) || !Array.isArray(rows)) continue;
		const known = new Set(Object.keys(columnsOf(key as TabKey)));
		result[key as TabKey] = rows
			.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
			.map((row, i) => ({
				row: i + 2,
				cells: Object.fromEntries(
					Object.entries(row).filter((entry): entry is [string, string] => known.has(entry[0]) && typeof entry[1] === 'string' && !!entry[1])
				)
			}))
			// Older backups have the sheet's empty rows with only an unticked checkbox (FALSE) in them.
			.filter(({ cells }) => Object.values(cells).some((value) => value.trim().toUpperCase() !== 'FALSE'));
	}
	if (!Object.keys(result).length) throw new BackupFormatError();
	return result;
}

/**
 * Puts a backup back into D1 (#186) and makes D1 the source: the way back after a mistake older
 * than Time Travel's 30 days, or onto a new database. Everything in D1 is replaced.
 */
export async function restoreFromBackup(backup: unknown): Promise<ImportPlan> {
	const tabs = backupTabs(backup);
	const keys = Object.keys(tabs) as TabKey[];
	const plan = await withSheetLock(async () => {
		const prepared = prepareImport(tabs);
		await getStore().importData(prepared, keys);
		forgetDataState();
		const plans = keys.map((key) => ({ key, tab: LAYOUT[key].tab, rows: prepared.rows[key]?.length ?? 0, unknown: [], missing: [] }));
		return { tabs: plans, rows: plans.reduce((sum, tab) => sum + tab.rows, 0), skipped: prepared.skipped } satisfies ImportPlan;
	});
	await getRepertoire({ force: true });
	return plan;
}

/** Takes the sheet over into D1 and makes D1 the source. Earlier data in D1 is replaced. */
export async function importFromSheet(): Promise<ImportPlan> {
	// In the lock, so no save to the sheet lands between the read and the switch.
	const plan = await withSheetLock(async () => {
		const tabs = await readSheetRecords();
		const { prepared, plan } = prepare(tabs);
		await getStore().importData(prepared, tabs.map((tab) => tab.plan.key));
		forgetDataState();
		return plan;
	});
	await getRepertoire({ force: true });
	return plan;
}

/**
 * Writes D1 into the sheet: every tab D1 has, in the sheet's own column order (columns it
 * lacks are added at the end), everything below the header replaced. Values go in as text,
 * so nothing turns into a formula.
 */
export async function exportToSheet(): Promise<{ tabs: number; rows: number }> {
	return withSheetLock(async () => {
		const { client, spreadsheetId } = target();
		// The version before reading: a change made during the export is written next time.
		const { version } = await dataState({ force: true });
		const data = await getStore().readData();
		const keys = (Object.keys(data) as TabKey[]).filter((key) => key in LAYOUT);
		const rowsOf = (key: TabKey) => data[key] ?? [];
		const present = new Set((await getTabs(client, spreadsheetId)).map((tab) => tab.title));
		const added = keys.filter((key) => !present.has(LAYOUT[key].tab));
		await batchUpdate(
			client,
			spreadsheetId,
			added.map((key) => ({ addSheet: { properties: { title: LAYOUT[key].tab, gridProperties: { frozenRowCount: 1 } } } }))
		);

		const headerRanges = keys.map((key) => tabRange(LAYOUT[key].tab, '1:1'));
		const headers = await getValues(client, spreadsheetId, headerRanges);
		const writes = keys.map((key, i) => {
			const header = [...(headers[headerRanges[i]]?.[0] ?? [])];
			const table = readTable([header], columnsOf(key));
			for (const column of table.missing) {
				table.indexes[column] = header.length;
				header.push(columnsOf(key)[column]);
			}
			const rows = gridOf(key, rowsOf(key)).slice(1).map((cells) => {
				const values = Object.fromEntries(Object.keys(columnsOf(key)).map((column, j) => [column, cells[j]]));
				const row = toSheetRow(values, table.indexes);
				return [...row, ...Array(Math.max(0, header.length - row.length)).fill('')];
			});
			return { range: tabRange(LAYOUT[key].tab, 'A1'), values: [header, ...rows] };
		});
		await clearValues(client, spreadsheetId, keys.map((key) => tabRange(LAYOUT[key].tab, 'A2:ZZ')));
		await updateValues(client, spreadsheetId, writes);
		await getStore().setState(EXPORTED_KEY, String(version));
		return { tabs: keys.length, rows: writes.reduce((sum, write) => sum + write.values.length - 1, 0) };
	});
}

/** The data version the sheet was last written with. */
const EXPORTED_KEY = 'data-exported';

/** Whether D1 changed since the last export, so the nightly one has something to write. */
export async function changedSinceExport(): Promise<boolean> {
	const [{ version }, exported] = await Promise.all([dataState({ force: true }), getStore().getState(EXPORTED_KEY)]);
	return exported === null || Number(exported) !== version;
}

/** Makes the sheet the source again, after one last export so it has everything. */
export async function backToSheet(): Promise<{ tabs: number; rows: number }> {
	const exported = await exportToSheet();
	await getStore().setDataSource('sheet');
	forgetDataState();
	await getRepertoire({ force: true });
	return exported;
}

/** Everything people maintain, by tab and column key, from wherever it lives; for the admins' download. */
export async function allData(): Promise<{ source: 'sheet' | 'd1'; tabs: Record<string, Record<string, string>[]> }> {
	const { source } = await dataState({ force: true });
	if (source === 'd1') {
		const data = await getStore().readData();
		return { source, tabs: Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, (rows ?? []).map((row) => row.cells)])) };
	}
	return { source, tabs: Object.fromEntries((await readSheetRecords()).map(({ plan, rows }) => [plan.key, rows.map((row) => row.cells)])) };
}

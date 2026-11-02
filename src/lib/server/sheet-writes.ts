import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { toSheetRow } from '#lib/repertoire/link.ts';
import { matchRows } from '#lib/repertoire/row-match.ts';
import { LAYOUT, readTable, type ColumnKey, type Table, type TabKey } from '#lib/repertoire/sheet.ts';
import { appendRows, batchUpdate, columnLetter, getTabs, getValues, tabRange, updateValues } from './google/sheets.ts';
import { getRepertoire } from './repertoire.ts';
import { cellsOf, cellsOfRow, forgetDataState, gridOf, usingD1 } from './data-source.ts';
import { getStore, type DataRow } from './db/index.ts';
import { DataCheckError, DataConflictError, snake } from './db/schema.ts';
import { getGoogle, requireSetting } from './services.ts';
import { withSheetLock } from './sheet-lock.ts';

/**
 * Changes the app makes to the sheet on someone's behalf (programme editor, admin
 * page). Every change starts from a fresh read, never from the cache. Writes run one after
 * another (withSheetLock, #156), and updates and deletes read the tab again in their turn
 * and find their rows by content, so a row deleted or inserted by hand, or another save in
 * the same second, doesn't send a value to the wrong row.
 *
 * A read-modify-write (e.g. a +1 on a wish) wraps the whole thing in withSheetLock, so
 * nobody else's change lands between the read and the write.
 *
 * Once the data lives in D1 (#186), the same functions read and write there instead: rows
 * are still found by content, but saved by id and the revision read, so a row someone else
 * changed meanwhile is refused instead of overwritten, without waiting for the lock. The lock
 * stays for the read-modify-writes that wrap these functions, and for the sheet itself.
 */

export { withSheetLock };

export class SheetLayoutError extends Error {
	constructor(readonly tab: string, readonly columns: string[] = []) {
		super(columns.length ? t.messages.missingColumns(tab, columns.join(', ')) : t.messages.missingTab(tab));
		this.name = 'SheetLayoutError';
	}
}

type Columns<K extends TabKey> = ColumnKey<K> & string;

function target() {
	return { client: getGoogle().client, spreadsheetId: requireSetting('REPERTOIRE_SHEET_ID') };
}

/** One tab in D1 with its stored rows, by grid row (row 2 is rows[0]). */
async function readD1Tab<K extends TabKey>(key: K): Promise<{ table: Table<Columns<K>>; rows: DataRow[] }> {
	const rows = (await getStore().readData([key]))[key];
	if (!rows) throw new SheetLayoutError(LAYOUT[key].tab);
	return { table: readTable(gridOf(key, rows), LAYOUT[key].columns as Record<Columns<K>, string>), rows };
}

/** Where `rows` of the caller's read are in D1 now, found by content as in the sheet. */
async function locateD1<K extends TabKey>(key: K, table: Table<Columns<K>>, rows: number[]) {
	const now = await readD1Tab(key);
	const found = matchRows(table, now.table, rows);
	if (!found) error(409, t.common.sheetChanged);
	return { now, at: (row: number) => now.rows[found.get(row)! - 2] };
}

/** A column's name as people see it, for a key or a stored column. */
function columnName(key: TabKey, column: string): string {
	const names = LAYOUT[key].columns as Record<string, string>;
	const stored = (name: string) => [snake(name), `${snake(name)}_key`, `${snake(name)}_id`];
	return names[column] ?? names[Object.keys(names).find((name) => stored(name).includes(column)) ?? ''] ?? column;
}

/**
 * A change to D1. What the database refuses comes back as a 409 that says why: a name that
 * links to nothing, a second row where there may be one, a value missing, or a row changed
 * since it was read. Afterwards this instance reads the new state at once.
 */
async function writeD1(key: TabKey, change: () => Promise<void>): Promise<void> {
	try {
		await change();
	} catch (cause) {
		if (cause instanceof DataConflictError) error(409, t.common.sheetChanged);
		if (cause instanceof DataCheckError) error(409, t.dataMove.refused[cause.kind](LAYOUT[cause.tab].tab, columnName(cause.tab, cause.column), cause.value));
		throw cause;
	} finally {
		forgetDataState();
	}
}

/** One tab, read now. Throws SheetLayoutError if the tab doesn't exist. */
export async function readTab<K extends TabKey>(key: K): Promise<Table<Columns<K>>> {
	if (await usingD1()) return (await readD1Tab(key)).table;
	const { client, spreadsheetId } = target();
	const tab = LAYOUT[key].tab;
	if (!(await getTabs(client, spreadsheetId)).some((t) => t.title === tab)) throw new SheetLayoutError(tab);
	const range = tabRange(tab);
	const values = (await getValues(client, spreadsheetId, [range]))[range];
	return readTable(values, LAYOUT[key].columns as Record<Columns<K>, string>);
}

/** Adds a missing tab with its header row, for tabs a page fills on its first save. */
export function ensureTab(key: TabKey): Promise<void> {
	return withSheetLock(async () => {
		if (await usingD1()) return writeD1(key, () => getStore().addDataTab(key));
		const { client, spreadsheetId } = target();
		const tab = LAYOUT[key].tab;
		if ((await getTabs(client, spreadsheetId)).some((t) => t.title === tab)) return;
		await batchUpdate(client, spreadsheetId, [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }]);
		await updateValues(client, spreadsheetId, [{ range: tabRange(tab, 'A1'), values: [Object.values(LAYOUT[key].columns as Record<string, string>)] }]);
	});
}

/**
 * Adds header cells for columns the tab lacks, after its last one, and returns the tab read
 * again: for columns that came after a tab was set up, like "Priorität" in "Fehlende Stimmen".
 * D1 has them from its migrations.
 */
export async function ensureColumns<K extends TabKey>(key: K, columns: Columns<K>[]): Promise<Table<Columns<K>>> {
	if (await usingD1()) return readTab(key);
	await withSheetLock(async () => {
		const table = await readTab(key);
		const missing = columns.filter((column) => table.missing.includes(column));
		if (!missing.length) return;
		const names = LAYOUT[key].columns as Record<string, string>;
		const { client, spreadsheetId } = target();
		await updateValues(client, spreadsheetId, [
			{ range: tabRange(LAYOUT[key].tab, `${columnLetter(table.width)}1`), values: [missing.map((column) => names[column])] }
		]);
	});
	return readTab(key);
}

/** Appends rows in the tab's own column order. Values for columns the tab lacks would be lost, so that throws. */
export async function appendRecords<K extends TabKey>(
	key: K,
	table: Table<Columns<K>>,
	records: Partial<Record<Columns<K>, string | boolean>>[]
): Promise<void> {
	if (records.length === 0) return;
	const needed = [...new Set(records.flatMap((record) => Object.keys(record).filter((k) => record[k as Columns<K>])))];
	const missing = needed.filter((column) => table.missing.includes(column as Columns<K>));
	if (missing.length) {
		const names = LAYOUT[key].columns as Record<string, string>;
		throw new SheetLayoutError(LAYOUT[key].tab, missing.map((column) => names[column]));
	}
	if (await usingD1()) return writeD1(key, () => getStore().appendData(key, records.map((record) => cellsOf(key, record))));
	await withSheetLock(async () => {
		const { client, spreadsheetId } = target();
		await appendRows(client, spreadsheetId, tabRange(LAYOUT[key].tab), records.map((record) => toSheetRow(record, table.indexes)));
	});
}

/** Overwrites some cells of one row (a 1-based sheet row number from `table`, a fresh readTab). */
export function updateRecord<K extends TabKey>(
	key: K,
	table: Table<Columns<K>>,
	row: number,
	values: Partial<Record<Columns<K>, string | boolean>>
): Promise<void> {
	return updateRecords(key, table, [{ row, values }]);
}

/** Overwrites cells in several rows in one request, e.g. a renamed piece in every programme. */
export async function updateRecords<K extends TabKey>(
	key: K,
	table: Table<Columns<K>>,
	updates: { row: number; values: Partial<Record<Columns<K>, string | boolean>> }[]
): Promise<void> {
	if (updates.length === 0) return;
	if (await usingD1()) {
		return writeD1(key, async () => {
			const { at } = await locateD1(key, table, updates.map((update) => update.row));
			// Several updates to one row add up, as they would in the sheet.
			const merged = new Map<number, DataRow>();
			for (const { row, values } of updates) {
				const stored = merged.get(at(row).id) ?? at(row);
				merged.set(stored.id, { ...stored, cells: cellsOf(key, values, stored.cells) });
			}
			await getStore().updateData(key, [...merged.values()]);
		});
	}
	await withSheetLock(async () => {
		const { now, rows } = await locate(key, table, updates.map((update) => update.row));
		const columns = [...new Set(updates.flatMap((update) => Object.keys(update.values) as Columns<K>[]))];
		const missing = columns.filter((column) => now.indexes[column] === undefined);
		if (missing.length) {
			const names = LAYOUT[key].columns as Record<string, string>;
			throw new SheetLayoutError(LAYOUT[key].tab, missing.map((column) => names[column]));
		}
		const { client, spreadsheetId } = target();
		await updateValues(
			client,
			spreadsheetId,
			updates.flatMap(({ row, values }) =>
				(Object.keys(values) as Columns<K>[]).map((column) => ({
					range: tabRange(LAYOUT[key].tab, `${columnLetter(now.indexes[column]!)}${rows.get(row)}`),
					values: [[values[column] ?? '']]
				}))
			)
		);
	});
}

/** Deletes whole rows (1-based sheet row numbers from `table`), bottom-up so the numbers stay valid. */
export async function deleteRows<K extends TabKey>(key: K, table: Table<Columns<K>>, rows: number[]): Promise<void> {
	rows = rows.filter((row) => row > 1);
	if (rows.length === 0) return;
	if (await usingD1()) {
		return writeD1(key, async () => {
			const { at } = await locateD1(key, table, rows);
			const gone = new Map(rows.map((row) => [at(row).id, at(row)]));
			await getStore().deleteData(key, [...gone.values()]);
		});
	}
	await withSheetLock(async () => {
		const { client, spreadsheetId } = target();
		const tab = (await getTabs(client, spreadsheetId)).find((t) => t.title === LAYOUT[key].tab);
		if (!tab) throw new SheetLayoutError(LAYOUT[key].tab);
		const found = (await locate(key, table, rows)).rows;
		const sorted = [...new Set(found.values())].sort((a, b) => b - a);
		await batchUpdate(
			client,
			spreadsheetId,
			sorted.map((row) => ({
				deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } }
			}))
		);
	});
}

/** Reads the tab again (inside the lock) and finds where `rows` of the caller's read are now. */
async function locate<K extends TabKey>(key: K, table: Table<Columns<K>>, rows: number[]) {
	const now = await readTab(key);
	const found = matchRows(table, now, rows);
	if (!found) error(409, t.common.sheetChanged);
	return { now, rows: found };
}

/**
 * Overwrites everything below the header of a generated tab in one request. `rows`
 * come from a fresh read of that tab and must be padded to its old length, so rows
 * that went away are cleared.
 */
export async function replaceRows(key: TabKey, rows: (string | boolean)[][]): Promise<void> {
	if (rows.length === 0) return;
	// The rows are in the order of the tab as read, which in D1 is the layout's; padding is left out.
	if (await usingD1()) return writeD1(key, () => getStore().replaceData(key, rows.map((row) => cellsOfRow(key, row)).filter((cells) => Object.keys(cells).length)));
	await withSheetLock(async () => {
		const { client, spreadsheetId } = target();
		const width = Math.max(...rows.map((row) => row.length));
		const range = tabRange(LAYOUT[key].tab, `A2:${columnLetter(width - 1)}${rows.length + 1}`);
		await updateValues(client, spreadsheetId, [{ range, values: rows }]);
	});
}

/** Re-reads the sheet so the next page shows the change. */
export async function refreshAfterWrite(): Promise<void> {
	await getRepertoire({ force: true });
}

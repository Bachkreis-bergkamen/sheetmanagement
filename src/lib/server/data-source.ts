import { LAYOUT, type TabKey } from '#lib/repertoire/sheet.ts';
import { getStore, type DataRow, type DataState } from './db/index.ts';

/**
 * Where the data people maintain lives (#186): the Google Sheet until the import on
 * /einstellungen/tabelle/datenbank, D1 after it. The functions in repertoire.ts and sheet-writes.ts ask here
 * and read or write one or the other, so pages and editors don't change. In D1 the rows are
 * kept by column key; here they become grids with the header row the builders expect, as if
 * read from the sheet.
 */

/** Other instances' changes show up within this long; this instance's own at once. */
const STATE_MAX_AGE_MS = 2000;
let memo: { at: number; state: DataState } | undefined;

export async function dataState({ force = false } = {}): Promise<DataState> {
	if (!force && memo && Date.now() - memo.at < STATE_MAX_AGE_MS) return memo.state;
	try {
		const state = await getStore().dataState();
		memo = { at: Date.now(), state };
		return state;
	} catch (cause) {
		// D1 hiccups: what this instance knew still holds. Guessing "sheet" would send saves to a stale copy.
		if (memo) return memo.state;
		throw cause;
	}
}

export const usingD1 = async () => (await dataState()).source === 'd1';

/** After a change: the next read asks D1 again instead of the memo. */
export function forgetDataState() {
	memo = undefined;
}

const columnsOf = (key: TabKey) => Object.entries(LAYOUT[key].columns as Record<string, string>);

/** A tab's rows as the sheet would show them: the header in this language, then the rows in order. */
export function gridOf(key: TabKey, rows: DataRow[]): string[][] {
	const columns = columnsOf(key);
	return [columns.map(([, name]) => name), ...rows.map((row) => columns.map(([column]) => row.cells[column] ?? ''))];
}

/** A cell as text, like the sheet shows it: a ticked box is "TRUE". */
const text = (value: string | boolean | number | null | undefined) => (value === true ? 'TRUE' : value === false ? 'FALSE' : String(value ?? '').trim());

/** Values by column key as they're stored: text, only known columns, empty ones left out. */
export function cellsOf(key: TabKey, values: Partial<Record<string, string | boolean | number>>, base: Record<string, string> = {}): Record<string, string> {
	const known = new Set(columnsOf(key).map(([column]) => column));
	const cells = { ...base };
	for (const [column, value] of Object.entries(values)) {
		if (!known.has(column)) continue;
		const cell = text(value);
		if (cell) cells[column] = cell;
		else delete cells[column];
	}
	return cells;
}

/** A row of a grid (in gridOf's column order) by column key. */
export function cellsOfRow(key: TabKey, row: (string | boolean)[]): Record<string, string> {
	return cellsOf(key, Object.fromEntries(columnsOf(key).map(([column], i) => [column, row[i] ?? ''])));
}

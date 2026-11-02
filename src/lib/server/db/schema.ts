import { normalizeEmail } from '#lib/access/access.ts';
import { LAYOUT, normalize, type TabKey } from '#lib/repertoire/sheet.ts';

/**
 * The orchestra's data in D1 (#186): one table per tab of the sheet, a column per column, and
 * what the sheet only had as conventions made into rules the database keeps.
 *
 * - Links: a programme row belongs to a concert and points to its piece; loans, notes and
 *   rehearsals point to pieces; a concert can play another's programme. A link names its row,
 *   not its title, so renaming a piece or concert carries through everywhere. Where a name
 *   matches nothing (an encore that isn't in the archive, rented music) the name stays as
 *   text, as in the sheet; only a programme row without its concert is refused.
 * - Checks: what the app already treats as one thing is unique, compared the way the app
 *   compares it (titles without case and accents, emails as emails, ids exactly), and rows
 *   that mean nothing without a value can't be saved without it.
 *
 * Pages still get the rows as cells by column key, a link as the text it points to; see
 * decode(). migrations/0009_data.sql is this schema written out; a test keeps them equal.
 */

export interface Link {
	/** The tab it points into. */
	tab: TabKey;
	/** The column there that the text names, e.g. a piece's title. */
	by: string;
	/** A row without it, or with a name that matches nothing, is refused. */
	required?: boolean;
}

export interface TableSpec {
	table: string;
	links?: Record<string, Link>;
	/** Column sets that are unique. */
	unique?: string[][];
	/** Rows need at least one of these columns set, per list. */
	required?: string[][];
	/** Columns compared as emails. */
	emails?: string[];
	/** Columns compared exactly: ids. Everything else is compared like the app compares names. */
	exact?: string[];
}

export const SCHEMA: Record<TabKey, TableSpec> = {
	pieces: { table: 'pieces', unique: [['title'], ['driveFolderId']], required: [['title', 'driveFolderId']], exact: ['driveFolderId'] },
	concerts: {
		table: 'concerts',
		links: { sameProgramAs: { tab: 'concerts', by: 'title' } },
		unique: [['title'], ['eventId']],
		required: [['title', 'eventId']],
		exact: ['eventId']
	},
	program: { table: 'program_items', links: { concert: { tab: 'concerts', by: 'title', required: true }, piece: { tab: 'pieces', by: 'title' } } },
	members: { table: 'members', unique: [['email']], required: [['email']], emails: ['email'] },
	groups: { table: 'access_groups', unique: [['name']], required: [['name']] },
	rights: { table: 'access_rights', unique: [['who', 'right']], required: [['who'], ['right']] },
	requests: { table: 'access_requests', unique: [['email']], required: [['email']], emails: ['email'] },
	reports: { table: 'reports', links: { pieceId: { tab: 'pieces', by: 'driveFolderId' } }, unique: [['id']], exact: ['id', 'pieceId', 'fileId'] },
	wishes: { table: 'wishes', unique: [['id']], exact: ['id', 'pieceId'] },
	missingParts: { table: 'missing_parts', unique: [['fileId']], required: [['fileId']], exact: ['fileId'] },
	instrumentGroups: { table: 'instrument_groups' },
	signups: { table: 'signups' },
	rehearsals: { table: 'rehearsals', links: { piece: { tab: 'pieces', by: 'title' } } },
	loans: { table: 'loans', links: { piece: { tab: 'pieces', by: 'title' } } },
	attendance: { table: 'attendance' },
	pieceNotes: { table: 'piece_notes', links: { piece: { tab: 'pieces', by: 'title' }, concert: { tab: 'concerts', by: 'title' } }, unique: [['id']], exact: ['id'] },
	partAssignments: { table: 'part_assignments', links: { piece: { tab: 'pieces', by: 'title' }, concert: { tab: 'concerts', by: 'title' } }, unique: [['id']], exact: ['id'] },
	rehearsalNotes: { table: 'rehearsal_notes' },
	ensembles: { table: 'ensembles', unique: [['shortName']], required: [['shortName', 'name']] },
	instruments: { table: 'instruments', unique: [['name']], required: [['name']] },
	settings: { table: 'settings', unique: [['key']], required: [['key']] }
};

/** Tabs in an order where every link points to a tab before it (or to its own): pieces and concerts first. */
export const TAB_ORDER: TabKey[] = ['pieces', 'concerts', ...(Object.keys(SCHEMA) as TabKey[]).filter((tab) => tab !== 'pieces' && tab !== 'concerts')];

/** Every column some link names, as "tab.column": what LinkIndex keeps. */
const LINK_TARGETS = new Set(Object.values(SCHEMA).flatMap((spec) => Object.values(spec.links ?? {}).map((link) => `${link.tab}.${link.by}`)));

/** A column key as a stored column: driveFolderId → drive_folder_id; a tab's own "id" is sheet_id, apart from the row's. */
export const snake = (key: string) => (key === 'id' ? 'sheet_id' : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
const quote = (name: string) => `"${name}"`;
const columnsOf = (tab: TabKey) => Object.keys(LAYOUT[tab].columns as Record<string, string>);

/** Columns that get a second column with their value as compared, for uniqueness and links. */
function keyed(tab: TabKey): string[] {
	const spec = SCHEMA[tab];
	return [...new Set((spec.unique ?? []).flat().filter((column) => !spec.exact?.includes(column) && !spec.links?.[column]))];
}

/** A value as the app compares it; null when empty. */
export function matchKey(tab: TabKey, column: string, value: string | undefined): string | null {
	const text = (value ?? '').trim();
	if (!text) return null;
	const spec = SCHEMA[tab];
	if (spec.exact?.includes(column)) return text;
	if (spec.emails?.includes(column)) return normalizeEmail(text);
	return normalize(text) || null;
}

/** The SQL columns of a tab's table, in order, besides id and rev. */
export function sqlColumns(tab: TabKey): string[] {
	const spec = SCHEMA[tab];
	return columnsOf(tab).flatMap((column) => [
		...(spec.links?.[column] ? [`${snake(column)}_id`] : []),
		snake(column),
		...(keyed(tab).includes(column) ? [`${snake(column)}_key`] : [])
	]);
}

/** The CREATE TABLE statements, as in migrations/0009_data.sql. */
export function schemaSql(): string[] {
	return TAB_ORDER.flatMap((tab) => {
		const spec = SCHEMA[tab];
		const lines = ['"id" INTEGER PRIMARY KEY AUTOINCREMENT', '"rev" INTEGER NOT NULL DEFAULT 0'];
		for (const column of columnsOf(tab)) {
			const link = spec.links?.[column];
			if (link) {
				const target = SCHEMA[link.tab].table;
				lines.push(`${quote(`${snake(column)}_id`)} INTEGER${link.required ? ' NOT NULL' : ''} REFERENCES ${quote(target)} ("id") ON DELETE ${link.required ? 'CASCADE' : link.tab === tab ? 'SET NULL' : 'RESTRICT'}`);
			}
			lines.push(`${quote(snake(column))} TEXT`);
			if (keyed(tab).includes(column)) lines.push(`${quote(`${snake(column)}_key`)} TEXT`);
		}
		lines.push(`"updated_at" TEXT NOT NULL DEFAULT (datetime('now'))`);
		const compared = (column: string) => (spec.links?.[column] ? `${snake(column)}_id` : keyed(tab).includes(column) ? `${snake(column)}_key` : snake(column));
		for (const set of spec.unique ?? []) lines.push(`UNIQUE (${set.map((column) => quote(compared(column))).join(', ')})`);
		const stored = (column: string) => (spec.links?.[column] ? `${snake(column)}_id` : snake(column));
		for (const anyOf of spec.required ?? []) lines.push(`CHECK (${anyOf.map((column) => `${quote(stored(column))} IS NOT NULL`).join(' OR ')})`);
		return [`CREATE TABLE IF NOT EXISTS ${quote(spec.table)} (\n\t${lines.join(',\n\t')}\n)`];
	});
}

export class DataCheckError extends Error {
	constructor(
		/** A name linking to nothing, a second of a kind, a value missing, or a row others still link to. */
		readonly kind: 'link' | 'unique' | 'required' | 'used',
		readonly tab: TabKey,
		readonly column: string,
		readonly value: string
	) {
		super(`${kind} ${tab}.${column}: ${value}`);
		this.name = 'DataCheckError';
	}
}

/** A save or delete of a row that changed since it was read: nothing was saved. */
export class DataConflictError extends Error {
	constructor(readonly tab: TabKey) {
		super(`conflict ${tab}`);
		this.name = 'DataConflictError';
	}
}

/**
 * SQLite's refusal as the error the app knows: "UNIQUE constraint failed: pieces.title_key" and
 * the like. The write guard's CHECK (see sql.ts) is a row changed meanwhile.
 */
export function constraintError(tab: TabKey, cause: unknown): Error | undefined {
	const message = cause instanceof Error ? cause.message : String(cause);
	if (/write_guard|changed > 0/.test(message)) return new DataConflictError(tab);
	const column = (message.match(/failed: [\w"]+\.([\w"]+)/)?.[1] ?? '').replace(/"/g, '');
	if (/UNIQUE constraint failed/i.test(message)) return new DataCheckError('unique', tab, column, '');
	if (/FOREIGN KEY constraint failed/i.test(message)) return new DataCheckError('link', tab, column, '');
	if (/(NOT NULL|CHECK) constraint failed/i.test(message)) return new DataCheckError('required', tab, column, '');
	return undefined;
}

/** A row as stored: SQL column → value. */
export type SqlRow = Record<string, string | number | null>;

/** Finds the row a link names: the id of the row in `tab` whose `by` compares equal to `text`. */
export type Resolve = (tab: TabKey, by: string, text: string) => number | undefined;

/** Cells (column key → text) as a row for the table; links resolved, checks applied. */
export function encode(tab: TabKey, cells: Record<string, string>, resolve: Resolve): SqlRow {
	const spec = SCHEMA[tab];
	const row: SqlRow = {};
	for (const column of columnsOf(tab)) {
		const value = (cells[column] ?? '').trim();
		const link = spec.links?.[column];
		if (link) {
			const id = value ? resolve(link.tab, link.by, value) : undefined;
			if (link.required && id === undefined) throw new DataCheckError(value ? 'link' : 'required', tab, column, value);
			row[`${snake(column)}_id`] = id ?? null;
			// A link that matches nothing keeps its name, as the sheet did.
			row[snake(column)] = id === undefined ? value || null : null;
		} else row[snake(column)] = value || null;
		if (keyed(tab).includes(column)) row[`${snake(column)}_key`] = matchKey(tab, column, value);
	}
	for (const anyOf of spec.required ?? []) {
		if (!anyOf.some((column) => cells[column]?.trim())) throw new DataCheckError('required', tab, anyOf[0], '');
	}
	return row;
}

/** A stored row as cells; a link as the text of the row it points to. */
export function decode(tab: TabKey, row: SqlRow, target: (tab: TabKey, id: number) => SqlRow | undefined): Record<string, string> {
	const spec = SCHEMA[tab];
	const cells: Record<string, string> = {};
	for (const column of columnsOf(tab)) {
		const link = spec.links?.[column];
		const id = link ? row[`${snake(column)}_id`] : null;
		const value = link && typeof id === 'number' ? target(link.tab, id)?.[snake(link.by)] : row[snake(column)];
		if (value !== null && value !== undefined && value !== '') cells[column] = String(value);
	}
	return cells;
}

/** The values a row has for each unique set, as compared; sets with an empty value don't count. */
export function uniqueValues(tab: TabKey, row: SqlRow): { set: string[]; value: string }[] {
	const spec = SCHEMA[tab];
	return (spec.unique ?? []).flatMap((set) => {
		const parts = set.map((column) => {
			const link = spec.links?.[column];
			return link ? row[`${snake(column)}_id`] : keyed(tab).includes(column) ? row[`${snake(column)}_key`] : row[snake(column)];
		});
		return parts.some((part) => part === null || part === undefined) ? [] : [{ set, value: parts.join('\n') }];
	});
}

/** Lookups by link target, for resolve(): built from rows already stored or being imported. */
export class LinkIndex {
	private readonly maps = new Map<string, Map<string, number>>();

	add(tab: TabKey, id: number, row: SqlRow) {
		for (const column of columnsOf(tab)) {
			const name = `${tab}.${column}`;
			if (!LINK_TARGETS.has(name)) continue;
			const key = matchKey(tab, column, String(row[snake(column)] ?? ''));
			if (!key) continue;
			const map = this.maps.get(name) ?? new Map<string, number>();
			// The first row with a name wins, as in the builders.
			if (!map.has(key)) map.set(key, id);
			this.maps.set(name, map);
		}
	}

	resolve: Resolve = (tab, by, text) => {
		const key = matchKey(tab, by, text);
		return key ? this.maps.get(`${tab}.${by}`)?.get(key) : undefined;
	};
}

export interface SkippedRow {
	tab: TabKey;
	/** The row's number in the sheet's tab. */
	row: number;
	kind: DataCheckError['kind'];
	column: string;
	value: string;
}

export interface PreparedImport {
	/** Rows by tab with the ids they get, in order. */
	rows: Partial<Record<TabKey, { id: number; row: SqlRow }[]>>;
	skipped: SkippedRow[];
}

/**
 * The sheet's rows as they go into D1: links resolved among themselves, and the rows that
 * break a check left out with the reason. Those are rows the app already ignores (a second
 * piece with the same title, a programme row whose concert doesn't exist).
 */
export function prepareImport(tabs: Partial<Record<TabKey, { row: number; cells: Record<string, string> }[]>>): PreparedImport {
	const index = new LinkIndex();
	const rows: PreparedImport['rows'] = {};
	const skipped: SkippedRow[] = [];
	// Link targets get their ids first; a concert can name another that comes after it, so links
	// are resolved in a second pass.
	const encoded = new Map<TabKey, { id: number; sheetRow: number; cells: Record<string, string> }[]>();
	for (const tab of TAB_ORDER) {
		const list = tabs[tab];
		if (!list) continue;
		const seen = new Set<string>();
		const kept: { id: number; sheetRow: number; cells: Record<string, string> }[] = [];
		for (const { row, cells } of list) {
			try {
				// Checks without links first, so duplicates are known before anything points at them.
				const plain = encode(tab, cells, () => 0);
				const clash = uniqueValues(tab, plain).find(({ set, value }) => seen.has(`${set.join(',')}\n${value}`));
				if (clash) throw new DataCheckError('unique', tab, clash.set.join(', '), clash.set.map((column) => cells[column] ?? '').join(', '));
				for (const { set, value } of uniqueValues(tab, plain)) seen.add(`${set.join(',')}\n${value}`);
				const id = kept.length + 1;
				kept.push({ id, sheetRow: row, cells });
				index.add(tab, id, plain);
			} catch (cause) {
				if (!(cause instanceof DataCheckError)) throw cause;
				skipped.push({ tab, row, kind: cause.kind, column: cause.column, value: cause.value });
			}
		}
		encoded.set(tab, kept);
	}
	for (const [tab, kept] of encoded) {
		const out: { id: number; row: SqlRow }[] = [];
		for (const { id, sheetRow, cells } of kept) {
			try {
				out.push({ id, row: encode(tab, cells, index.resolve) });
			} catch (cause) {
				if (!(cause instanceof DataCheckError)) throw cause;
				skipped.push({ tab, row: sheetRow, kind: cause.kind, column: cause.column, value: cause.value });
			}
		}
		rows[tab] = out;
	}
	return { rows, skipped };
}

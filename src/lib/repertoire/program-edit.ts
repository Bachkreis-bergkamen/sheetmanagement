import { rowOrchestra, sameOrchestra } from './orchestras.ts';
import { normalize, type ColumnKey, type Table } from './sheet.ts';

type ProgramColumns = ColumnKey<'program'> & string;
export type ProgramTable = Table<ProgramColumns>;

/** What a guest piece's row says itself, since it isn't in "Stücke" (see ensembles.ts). */
export const GUEST_FIELDS = ['composer', 'arranger', 'publisher', 'duration'] as const;
type GuestField = (typeof GUEST_FIELDS)[number];

/** One line of a programme as the editor sends it. */
export interface EditorEntry extends Partial<Record<GuestField, string>> {
	/** The piece's name as in the "Stücke" tab (or as typed in the sheet). */
	piece: string;
	notes: string;
}

const MAX_ENTRIES = 100;
const MAX_LENGTH = 300;

/** Checks what the browser sent; null if it isn't a list of entries. */
export function parseEntries(json: string): EditorEntry[] | null {
	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		return null;
	}
	if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null;
	const entries: EditorEntry[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') return null;
		const { piece, notes, ...rest } = item as Record<string, unknown>;
		if (typeof piece !== 'string' || !piece.trim() || (notes !== undefined && typeof notes !== 'string')) return null;
		const entry: EditorEntry = { piece: piece.trim().slice(0, MAX_LENGTH), notes: (notes ?? '').trim().slice(0, MAX_LENGTH) };
		for (const field of GUEST_FIELDS) {
			const value = rest[field];
			if (value !== undefined && typeof value !== 'string') return null;
			if (value?.trim()) entry[field] = value.trim().slice(0, MAX_LENGTH);
		}
		entries.push(entry);
	}
	return entries;
}

/** One orchestra's programme of a concert that names `orchestras`; left out: the whole concert's. */
export interface OrchestraScope {
	orchestra?: string;
	orchestras: string[];
	/** The concert's guest ensembles by short name; their rows always name them. */
	partners?: string[];
}

const rowsOf = (table: ProgramTable, concert: string, scope?: OrchestraScope) =>
	table.rows.filter(
		(row) =>
			normalize(row.values.concert) === normalize(concert) &&
			(!scope || sameOrchestra(rowOrchestra(row.values.orchestra, scope.orchestras, scope.partners), scope.orchestra))
	);

/**
 * The concert's programme rows as they are in the sheet. The editor sends this back
 * when saving; if the sheet changed in between, someone else edited the programme.
 */
export function programVersion(table: ProgramTable, concert: string, scope?: OrchestraScope): string {
	return JSON.stringify(
		rowsOf(table, concert, scope).map(({ values: v }) => [v.position, v.piece, v.notes, ...GUEST_FIELDS.map((field) => v[field] ?? '')])
	);
}

/**
 * Rows to append (numbered 1, 2, 3 …) and the old rows to delete afterwards. With several
 * orchestras, only the scope's rows go, and the new ones name their orchestra.
 */
export function planProgramSave(table: ProgramTable, concert: string, entries: EditorEntry[], scope?: OrchestraScope) {
	const orchestra = scope && scope.orchestras.length + (scope.partners?.length ?? 0) > 1 ? (scope.orchestra ?? '') : '';
	return {
		append: entries.map((entry, i) => ({
			concert,
			position: String(i + 1),
			piece: entry.piece,
			notes: entry.notes,
			...(orchestra ? { orchestra } : {}),
			// Only when there is something: a sheet without these columns can still save our pieces.
			...Object.fromEntries(GUEST_FIELDS.flatMap((field) => (entry[field] ? [[field, entry[field]]] : [])))
		})),
		remove: rowsOf(table, concert, scope).map((row) => row.row)
	};
}

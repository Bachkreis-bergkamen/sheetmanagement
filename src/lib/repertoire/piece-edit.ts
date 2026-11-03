import { t } from '#lib/i18n/index.ts';
import { cleanLink } from '#lib/links.ts';
import { formatDuration, parseDuration } from './duration.ts';
import { LIST_COLUMNS, tidyList } from './lists.ts';
import { isNoRecording, normalize, type ColumnKey, type Table, type TableRow } from './sheet.ts';

/**
 * Editing a piece's row in "Stücke" from the app. Like the programme editor: the form
 * carries a version of the row it started from, and a save that finds the row changed
 * meanwhile is refused instead of overwriting someone else's edit.
 */

type PieceColumn = ColumnKey<'pieces'> & string;
type ProgramColumn = ColumnKey<'program'> & string;

/** What the app lets people change; the Drive folder id stays the app's. */
export const EDITABLE = [
	'title',
	'composer',
	'composerFull',
	'catalogue',
	'arranger',
	'genre',
	'difficulty',
	'notes',
	'reviewedAt',
	'recording',
	'duration',
	'publisher',
	'instrumentation'
] as const;
export type EditableColumn = (typeof EDITABLE)[number];
export type PieceValues = Record<EditableColumn, string>;

export function pieceValues(row: TableRow<PieceColumn>): PieceValues {
	return Object.fromEntries(EDITABLE.map((column) => [column, row.values[column] ?? ''])) as PieceValues;
}

/** Changes whenever one of the editable cells changes. */
export function pieceVersion(row: TableRow<PieceColumn>): string {
	return JSON.stringify(EDITABLE.map((column) => row.values[column] ?? ''));
}

/** The piece's row: by its Drive folder, or for pieces without sheet music by title. */
export function findPieceRow(
	table: Table<PieceColumn>,
	piece: { driveFolderId?: string; title: string }
): TableRow<PieceColumn> | undefined {
	if (piece.driveFolderId) return table.rows.find((row) => row.values.driveFolderId === piece.driveFolderId);
	const title = normalize(piece.title);
	return table.rows.find((row) => !row.values.driveFolderId && normalize(row.values.title) === title);
}

export type EditProblem = 'title-missing' | 'title-taken' | 'bad-link' | 'bad-duration';

/** Cleans the form's values; a problem instead when they can't be saved. */
export function checkPieceValues(
	values: PieceValues,
	table: Table<PieceColumn>,
	ownRow: number
): { values: PieceValues } | { problem: EditProblem } {
	const cleaned = Object.fromEntries(EDITABLE.map((column) => [column, values[column].trim()])) as PieceValues;
	if (!cleaned.title) return { problem: 'title-missing' };
	// Programme rows find pieces by title, so it has to stay unique.
	const title = normalize(cleaned.title);
	if (table.rows.some((row) => row.row !== ownRow && normalize(row.values.title) === title)) return { problem: 'title-taken' };
	// Several composers, genres …: "Mozart ,Haydn;" is saved as "Mozart, Haydn".
	for (const column of LIST_COLUMNS) cleaned[column] = tidyList(cleaned[column]);
	// "keins": the piece has no recording; written the same way every time.
	if (isNoRecording(cleaned.recording)) cleaned.recording = t.sheetValues.noRecording;
	else if (cleaned.recording) {
		const link = cleanLink(cleaned.recording);
		if (!link) return { problem: 'bad-link' };
		cleaned.recording = link;
	}
	// Written the same way every time ("7:30"), whatever was typed ("7 Min.", "7'30").
	if (cleaned.duration) {
		const seconds = parseDuration(cleaned.duration);
		if (!seconds) return { problem: 'bad-duration' };
		cleaned.duration = formatDuration(seconds);
	}
	return { values: cleaned };
}

/**
 * The values to write: columns an older sheet doesn't have yet ("Dauer", "Verlag") are left
 * out while empty, so the rest still saves. Filled in, they're kept and the save says which
 * columns are missing.
 */
export function writableValues(values: PieceValues, table: Table<PieceColumn>): Partial<PieceValues> {
	return Object.fromEntries(
		Object.entries(values).filter(([column, value]) => value || !table.missing.includes(column as PieceColumn))
	) as Partial<PieceValues>;
}

/** Programme rows that name the piece by its old title, to follow a rename. */
export function renameInProgram(
	program: Table<ProgramColumn>,
	oldTitle: string,
	newTitle: string
): { row: number; values: { piece: string } }[] {
	if (oldTitle === newTitle) return [];
	const old = normalize(oldTitle);
	return program.rows.filter((row) => normalize(row.values.piece) === old).map((row) => ({ row: row.row, values: { piece: newTitle } }));
}

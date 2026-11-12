import { bare, distance, searchText } from '#lib/music/text.ts';
import { checkConcert } from './concert-edit.ts';
import { normalize, type ColumnKey, type Table } from './sheet.ts';

/**
 * Adding the orchestra's history from the app ("archiv.bearbeiten"): past concerts with
 * dates as precise as they are known, and pieces that were played but have no sheet
 * music in Drive. Programmes then use the existing programme editor.
 */

export interface NewConcert {
	date: string;
	title: string;
	location: string;
	orchestra: string;
}

export interface NewPiece {
	title: string;
	composer: string;
	catalogue: string;
}

export type ArchiveProblem = 'title-missing' | 'title-taken' | 'day-taken' | 'bad-date';

const trimmed = <T extends object>(values: T): T =>
	Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value).trim()])) as T;

/** Programme rows refer to pieces by title: it must be unique. */
const taken = (table: Table<string>, title: string) => {
	const wanted = normalize(title);
	return table.rows.some((row) => normalize(row.values.title ?? '') === wanted);
};

/** A past concert for the archive: refused only for the same name on the same day (concert-edit.ts). */
export function checkNewConcert(
	input: NewConcert,
	concerts: Table<ColumnKey<'concerts'> & string>
): { values: NewConcert } | { problem: ArchiveProblem } {
	return checkConcert(input, concerts);
}

export function checkNewPiece(
	input: NewPiece,
	pieces: Table<ColumnKey<'pieces'> & string>
): { values: NewPiece } | { problem: ArchiveProblem } {
	const values = trimmed(input);
	if (!values.title) return { problem: 'title-missing' };
	if (taken(pieces, values.title)) return { problem: 'title-taken' };
	return { values };
}

/** Words that only say how a title is written: "Ungarischer Tanz Nr. 5" and "Ungarischer Tanz 5" are one piece. */
const FILLER = new Set(['nr', 'no', 'num', 'nummer', 'number', 'op', 'opus', 'the', 'a', 'an', 'der', 'die', 'das', 'ein', 'eine']);
const words = (title: string) =>
	searchText(title)
		.split(/[^a-z0-9]+/)
		.filter((word) => word && !FILLER.has(word));
const surname = (composer = '') => bare(composer.trim().split(/\s+/).at(-1) ?? '');

/**
 * Pieces in the archive that may be the one about to be added (#192): the same title
 * written another way, a title one or two letters off, or a similar title by the same
 * composer. Shown before a new piece is created, so it isn't entered twice.
 */
export function similarPieces<P extends { title: string; composer?: string }>(input: { title: string; composer?: string }, pieces: P[], limit = 5): P[] {
	const wanted = words(input.title);
	if (!wanted.length) return [];
	const key = wanted.join(' ');
	const composer = surname(input.composer);
	const numbers = (list: string[]) => list.filter((word) => /\d/.test(word)).join(' ');
	const score = (piece: P) => {
		const theirs = words(piece.title);
		const theirKey = theirs.join(' ');
		if (theirKey === key) return 3;
		// "Tanz 5" and "Tanz 6" are two pieces, however close the letters.
		if (numbers(theirs) && numbers(wanted) && numbers(theirs) !== numbers(wanted)) return 0;
		if (distance(theirKey, key) <= (key.length >= 12 ? 2 : key.length >= 6 ? 1 : 0)) return 2;
		const other = surname(piece.composer);
		const sameComposer = !!composer && !!other && distance(composer, other) <= 1;
		if (!sameComposer) return 0;
		// Shares most of its words, e.g. "Sinfonie 5" and "5. Sinfonie c-Moll".
		const shared = wanted.filter((word) => theirs.includes(word)).length;
		return shared / Math.min(wanted.length, theirs.length || 1) >= 0.6 ? 1 : 0;
	};
	return pieces
		.map((piece) => ({ piece, score: score(piece) }))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ piece }) => piece);
}

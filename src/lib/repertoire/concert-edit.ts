import { concertKey, concertRef, ConcertNames, type NamedConcert } from './concert-ref.ts';
import { parseFuzzyDate } from './dates.ts';
import { normalize, type ColumnKey, type Table, type TabKey } from './sheet.ts';

/**
 * Adding and changing concerts in the archive ("archiv.bearbeiten"). A concert is its name and
 * its day, so a name may come again on another day. Other rows name a concert by text
 * (concert-ref.ts); when a name becomes shared, or a concert gets another name or day, those
 * rows are rewritten to the text that names it now, so nothing loses its concert.
 */

export interface ConcertValues {
	title: string;
	date: string;
	location: string;
	orchestra: string;
}

export type ConcertProblem = 'title-missing' | 'day-taken' | 'bad-date';

/** The columns in other tabs that name a concert. */
export const CONCERT_REFS = [
	['program', 'concert'],
	['concerts', 'sameProgramAs'],
	['wishes', 'concert'],
	['pieceNotes', 'concert'],
	['partAssignments', 'concert']
] as const satisfies readonly (readonly [TabKey, string])[];

type ConcertRow = Table<ColumnKey<'concerts'> & string>['rows'][number];

const trimmed = (values: ConcertValues): ConcertValues => ({
	title: values.title.trim(),
	date: values.date.trim(),
	location: values.location.trim(),
	orchestra: values.orchestra.trim()
});

const named = (row: ConcertRow): NamedConcert & { row: number; dateText: string } => ({
	row: row.row,
	title: row.values.title ?? '',
	date: parseFuzzyDate(row.values.date ?? ''),
	dateText: row.values.date ?? ''
});

/**
 * Checks a new or changed concert against the others in "Konzerte" (`ownRow` is the one being
 * changed). Only the same name on the same day is taken; an unknown day counts as a day.
 */
export function checkConcert(input: ConcertValues, concerts: Table<ColumnKey<'concerts'> & string>, ownRow?: number): { values: ConcertValues } | { problem: ConcertProblem } {
	const values = trimmed(input);
	if (!values.title) return { problem: 'title-missing' };
	// "1957", "1957-12", "21.12.1957" … or empty when nobody knows.
	if (values.date && !parseFuzzyDate(values.date)) return { problem: 'bad-date' };
	const wanted = concertKey(values.title, values.date);
	if (concerts.rows.some((row) => row.row !== ownRow && (row.values.title ?? '').trim() && concertKey(row.values.title, row.values.date ?? '') === wanted)) {
		return { problem: 'day-taken' };
	}
	return { values };
}

export interface RefChange {
	/** The texts that named the concert before. */
	from: string[];
	/** The text that names it now. */
	to: string;
}

/**
 * What other rows have to say instead, once `next` is the list of concerts (by sheet row; a new
 * one with row -1): every concert whose text changed, from what named it before to what names
 * it now. A concert whose name became shared changes from "Anlass" to "Anlass (21.12.1957)".
 */
export function refChanges(before: Table<ColumnKey<'concerts'> & string>, next: { row: number; values: ConcertValues }[]): RefChange[] {
	const old = before.rows.filter((row) => (row.values.title ?? '').trim()).map(named);
	const oldNames = new ConcertNames(old);
	const now = next.filter((concert) => concert.values.title.trim()).map((concert) => ({ row: concert.row, title: concert.values.title, date: parseFuzzyDate(concert.values.date) }));
	const nowNames = new ConcertNames(now);
	const changes: RefChange[] = [];
	for (const concert of now) {
		const was = old.find((other) => other.row === concert.row);
		if (!was) continue;
		const to = nowNames.ref(concert);
		// Named as before: nothing to follow.
		if (normalize(oldNames.ref(was)) === normalize(to)) continue;
		// The bare name only when it named this concert alone; a shared one named none of them.
		const bare = oldNames.shared(was) ? [] : [was.title.trim()];
		const from = [...new Set([oldNames.ref(was), ...bare, concertRef(was, true)])].filter((text) => text && normalize(text) !== normalize(to));
		if (from.length) changes.push({ from, to });
	}
	return changes;
}

/**
 * The cells in a tab to rewrite for the changes: rows naming a concert by an old text get the
 * new one. A text that named several concerts before (a bare shared name) is left alone.
 */
export function rewriteRefs<K extends string>(table: Table<K>, column: K, changes: RefChange[]): { row: number; values: Partial<Record<K, string>> }[] {
	const norm = normalize;
	const map = new Map<string, string | null>();
	for (const change of changes) {
		for (const text of change.from) {
			const key = norm(text);
			// Two concerts claiming the same old text: which one is meant isn't known.
			map.set(key, map.has(key) && map.get(key) !== change.to ? null : change.to);
		}
	}
	return table.rows.flatMap((row) => {
		const value = (row.values as Record<string, string>)[column] ?? '';
		const to = value.trim() ? map.get(norm(value)) : undefined;
		return to && to !== value ? [{ row: row.row, values: { [column]: to } as Partial<Record<K, string>> }] : [];
	});
}

import { searchText } from '#lib/music/text.ts';
import { fuzzyDateKey, parseFuzzyDate, type FuzzyDate } from './dates.ts';

/** As sheet.ts compares names; here so that sheet.ts can use this module. */
const normalize = (text: string) => searchText(text.replace(/\s+/g, ' ').trim());

/**
 * A concert is its name and its day: the Weihnachtskonzert 1957 and the one 1958 may both be
 * called "Weihnachtskonzert". Other rows (programme, "Programm wie", notes) name a concert by
 * text: the name alone while no other concert has it, else the name with the date in
 * brackets, "Weihnachtskonzert (21.12.1957)".
 */

export interface NamedConcert {
	title: string;
	date: FuzzyDate | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "21.12.1957", "12.1957" or "1957": the date as people in the orchestra write it. */
export function numericDate(date: FuzzyDate): string {
	if (!date.month) return String(date.year);
	if (!date.day) return `${pad(date.month)}.${date.year}`;
	return `${pad(date.day)}.${pad(date.month)}.${date.year}`;
}

/** The name and the date of a concert as compared: equal for the same concert, however written. */
export function concertKey(title: string, date: FuzzyDate | string | null | undefined): string {
	const parsed = typeof date === 'string' ? parseFuzzyDate(date) : date;
	const day = parsed ? fuzzyDateKey(parsed) : normalize(typeof date === 'string' ? date : '');
	return `${normalize(title)}\u001f${day}`;
}

/** "Weihnachtskonzert (21.12.1957)" → the name and the date; null when the brackets hold no date. */
export function splitConcertRef(text: string): { title: string; date: FuzzyDate } | null {
	const match = text.trim().match(/^(.*\S)\s*\(([^()]+)\)$/);
	const date = match ? parseFuzzyDate(match[2]) : null;
	return match && date ? { title: match[1], date } : null;
}

/** The text that names the concert: the date added when its name isn't enough. */
export function concertRef(concert: NamedConcert, shared: boolean): string {
	return shared && concert.date ? `${concert.title.trim()} (${numericDate(concert.date)})` : concert.title.trim();
}

/**
 * Finds concerts by the text other rows name them with. A name several concerts have finds
 * none of them ("ambiguous"): which one is meant needs the date.
 */
export class ConcertNames<C extends NamedConcert> {
	private readonly byTitle = new Map<string, C[]>();

	constructor(concerts: Iterable<C>) {
		for (const concert of concerts) {
			const title = normalize(concert.title);
			if (!title) continue;
			const list = this.byTitle.get(title) ?? [];
			list.push(concert);
			this.byTitle.set(title, list);
		}
	}

	/** Other concerts have the same name. */
	shared(concert: NamedConcert): boolean {
		return (this.byTitle.get(normalize(concert.title))?.length ?? 0) > 1;
	}

	ref(concert: C): string {
		return concertRef(concert, this.shared(concert));
	}

	find(text: string): C | 'ambiguous' | undefined {
		const value = text.trim();
		if (!value) return undefined;
		// The whole text as a name first: "Jubiläum (1957)" may be what the concert is called.
		const named = this.byTitle.get(normalize(value));
		if (named?.length === 1) return named[0];
		const split = splitConcertRef(value);
		if (split) {
			const day = fuzzyDateKey(split.date);
			const dated = (this.byTitle.get(normalize(split.title)) ?? []).filter((concert) => concert.date && fuzzyDateKey(concert.date) === day);
			if (dated.length === 1) return dated[0];
		}
		return named?.length ? 'ambiguous' : undefined;
	}

	/** The concert the text names, or undefined when it names none or isn't clear. */
	get(text: string): C | undefined {
		const found = this.find(text);
		return found === 'ambiguous' ? undefined : found;
	}
}

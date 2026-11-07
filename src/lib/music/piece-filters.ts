import { splitList } from '#lib/repertoire/lists.ts';
import { searchText } from './text.ts';
import { suggestGenre } from './wikidata.ts';

/**
 * What the archive's list filters by besides orchestra and state: a piece's genres, its
 * difficulty and how long it is. Genres come from the sheet's "Genre" ("Romantik, Filmmusik")
 * and from the Drive folder a piece sits in: "Weihnachtsstücke" counts as Weihnachten, so the
 * Christmas pieces are one choice among the genres rather than a filter of their own.
 */

const same = (a: string, b: string) => searchText(a) === searchText(b);

/** A piece's genres, in the configured spelling where one fits. */
export function pieceGenres(piece: { genre?: string; category?: string }, genres: string[]): string[] {
	const spelled = (name: string) => genres.find((genre) => same(genre, name)) ?? name;
	const result = splitList(piece.genre).map(spelled);
	// A folder that names no genre ("Zugaben") stays a choice of its own.
	if (piece.category) result.push(suggestGenre({ category: piece.category }, genres) ?? piece.category);
	return result.filter((name, i) => result.findIndex((other) => same(other, name)) === i);
}

/** The genres in use: in the configured order (epochs first), then the rest by name. */
export function genreOptions(inUse: string[], genres: string[]): string[] {
	const unique = inUse.filter((name, i) => inUse.findIndex((other) => same(other, name)) === i);
	const rank = (name: string) => {
		const at = genres.findIndex((genre) => same(genre, name));
		return at < 0 ? genres.length : at;
	};
	return unique.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export type Length = 'kurz' | 'mittel' | 'lang';

/** Up to 5 minutes, up to 10, longer; nothing when the sheet has no "Dauer". */
export function lengthOf(seconds: number | undefined): Length | undefined {
	if (!seconds) return undefined;
	return seconds <= 5 * 60 ? 'kurz' : seconds <= 10 * 60 ? 'mittel' : 'lang';
}

const DIFFICULTY_ORDER = ['sehr leicht', 'leicht', 'einfach', 'mittel', 'mittelschwer', 'anspruchsvoll', 'schwer', 'sehr schwer'];

/** The difficulties in use, easy to hard as people write them ("leicht", "mittel", "schwer", or "1"–"5"). */
export function difficultyOptions(inUse: string[]): string[] {
	const unique = [...new Set(inUse.map((value) => value.trim()).filter(Boolean))];
	const rank = (value: string) => {
		const number = Number.parseFloat(value.replace(',', '.'));
		if (Number.isFinite(number)) return number;
		const at = DIFFICULTY_ORDER.indexOf(searchText(value));
		return at < 0 ? 100 : 10 + at;
	};
	return unique.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

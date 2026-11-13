import { t } from '#lib/i18n/index.ts';
import { joinList, splitList } from './lists.ts';

/**
 * Medleys, suites and potpourris hold many songs by many composers. "Inhalt" lists them, one
 * per line with its composer ("Habanera – Bizet" or "Habanera (Bizet)"), so each song is found
 * by the search and the piece page can show who wrote what. The composers come from there
 * when "Komponist" is left empty, and a long list of names is shortened wherever it's shown.
 */

export interface Song {
	title: string;
	/** As written; may name several ("Lennon, McCartney"). */
	composer?: string;
}

/** One song per line; a single line may also separate them with ";". */
export function parseContents(text: string | undefined): Song[] {
	const lines = (text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const items = lines.length === 1 ? lines[0].split(';') : lines;
	return items.map((item) => item.trim().replace(/^(?:\d+[.)]|[-–—•*])\s+/, '')).filter(Boolean).map(song);
}

function song(text: string): Song {
	// "Habanera (Bizet)": the last brackets name the composer.
	const bracket = /^(.+?)\s*\(([^()]+)\)$/.exec(text);
	if (bracket) return { title: bracket[1].trim(), composer: bracket[2].trim() };
	// "Habanera – Bizet": the last dash with spaces around it.
	const dash = /^(.+)\s+[–—-]\s+(.+)$/.exec(text);
	if (dash) return { title: dash[1].trim(), composer: dash[2].trim() };
	return { title: text };
}

/** The composers of all songs, each once, in the order they come: "Bizet, Offenbach". */
export function contentsComposers(text: string | undefined): string | undefined {
	return joinList(splitList(parseContents(text).map((item) => item.composer ?? '').join(','))) || undefined;
}

/** The contents as the sheet keeps them: one song per line, without empty lines. */
export const tidyContents = (text: string) =>
	text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.join('\n');

/** How many names a composer line shows before it shortens to "und mehr". */
export const SHOWN_COMPOSERS = 2;

/**
 * A list of composers short enough for a line: up to two in full, else the first two and
 * "und mehr". `names` are those to show, `more` how many were left out.
 */
export function shortComposers(text: string | undefined): { names: string[]; more: number } {
	const names = splitList(text);
	if (names.length <= SHOWN_COMPOSERS) return { names, more: 0 };
	return { names: names.slice(0, SHOWN_COMPOSERS), more: names.length - SHOWN_COMPOSERS };
}

/** "Bizet, Offenbach und mehr" for a medley; a short list as it is. */
export function composerLine(text: string | undefined): string | undefined {
	const { names, more } = shortComposers(text);
	if (!names.length) return undefined;
	return more ? `${joinList(names)} ${t.pieces.moreComposers}` : joinList(names);
}

/** Whether a piece has so many composers that one face or one "more by" doesn't stand for it. */
export const manyComposers = (text: string | undefined) => splitList(text).length > SHOWN_COMPOSERS;

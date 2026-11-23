import type { OrchestraConfig } from '#lib/config/index.ts';
import { splitList } from '#lib/repertoire/lists.ts';
import { readInstrumentation, type ScoredVoice } from './instrumentation.ts';
import { genreKeys, type GenreKey } from './piece-art.ts';
import { searchText } from './text.ts';

/**
 * Missing parts of public-domain works on IMSLP (#198): the work's page found by composer,
 * title and catalogue number, and which parts its "Parts" section has. Downloading stays a
 * person's job (licences differ per edition); the app only finds the page.
 */

export const IMSLP_ORIGIN = 'https://imslp.org';

export interface ImslpWork {
	/** The page's title, e.g. "Brandenburg Concerto No.3 in G major, BWV 1048 (Bach, Johann Sebastian)". */
	title: string;
	url: string;
	/** The descriptions of the files under "Parts": "Violin 1", "Clarinet 1 (B♭)", "Complete Parts". */
	parts: string[];
}

export interface PieceForImslp {
	title: string;
	composer?: string;
	catalogue?: string;
}

export const workUrl = (title: string) => `${IMSLP_ORIGIN}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** IMSLP's own search, for when no page was found or someone wants to look further. */
export const searchUrl = (piece: PieceForImslp) => `${IMSLP_ORIGIN}/index.php?${new URLSearchParams({ search: searchWords(piece), title: 'Special:Search' })}`;

/** Genres IMSLP doesn't have: they're under copyright almost always. */
const NOT_ON_IMSLP: GenreKey[] = ['filmmusik', 'musical', 'jazz', 'pop-rock'];

/**
 * Whether looking on IMSLP can help at all: a piece with a composer, not film music, a musical,
 * jazz or pop, and not an arrangement, whose parts IMSLP wouldn't have even when it has the
 * original. The search itself still says when there's nothing.
 */
export function mayBeOnImslp(piece: { composer?: string; genre?: string; arranger?: string }): boolean {
	if (!surname(piece.composer) || piece.arranger?.trim()) return false;
	return !genreKeys(piece.genre).some((key) => NOT_ON_IMSLP.includes(key));
}

/** The composer's surname: "Bach, Johann Sebastian" → Bach, "Johann Sebastian Bach" → Bach. */
export function surname(composer: string | undefined): string {
	const first = splitList(composer)[0]?.trim() ?? '';
	if (first.includes(',')) return first.split(',')[0].trim();
	return first.split(/\s+/).at(-1) ?? '';
}

/** What IMSLP is asked: title, catalogue number and surname. */
export function searchWords(piece: PieceForImslp): string {
	const catalogue = piece.catalogue?.trim() ?? '';
	// The title often holds the catalogue number already ("Suite Nr. 3, BWV 1068").
	const title = catalogue && searchText(piece.title).includes(searchText(catalogue)) ? piece.title : `${piece.title} ${catalogue}`;
	return `${title} ${surname(piece.composer)}`.replace(/\s+/g, ' ').trim();
}

/** A catalogue number as IMSLP writes it: "Op. 84" → "Op.84", "KV 525" → "K.525", "op. 64 Nr. 2" → "Op.64 No.2". */
export function imslpCatalogue(catalogue: string): string {
	return catalogue
		.trim()
		.replace(/^(?:op|opus)\.?\s*/i, 'Op.')
		.replace(/^(?:kv|k)\.?\s*(?=\d)/i, 'K.')
		.replace(/\b(?:nr|no)\.?\s*(?=\d)/gi, 'No.')
		.replace(/\s+/g, ' ');
}

/** Words in titles that say what kind of piece, not which: IMSLP titles are mostly in English or the original language. */
const GENERIC = /^(ouvert[uü]re|overture|konzert|concerto|sinfonie|symphonie|symphony|suite|orchestersuite|serenade|sonate|sonata|tanz|tänze|marsch|nr|no|satz|aus|für|und|der|die|das|in|op|bwv|kv|hwv|dur|moll)$/;

/**
 * The searches to try, in order: the catalogue number in IMSLP's spelling with the composer (it
 * finds the work whatever the title), the title with the composer, and the title's own words.
 */
export function searchQueries(piece: PieceForImslp): string[] {
	const name = surname(piece.composer);
	const catalogue = piece.catalogue?.trim() ? imslpCatalogue(piece.catalogue) : '';
	const titleWords = piece.title
		.replace(/[,;:()"„“]/g, ' ')
		.split(/\s+/)
		.filter((word) => word && !GENERIC.test(word.toLowerCase().replace(/\.$/, '')) && !/^\d+\.?$/.test(word));
	const queries = [catalogue && `${catalogue} ${name}`, searchWords(piece), titleWords.length && `${titleWords.join(' ')} ${name}`];
	return [...new Set(queries.filter((query): query is string => !!query).map((query) => query.replace(/\s+/g, ' ').trim()))];
}

/** "BWV 1048", "KV 525", "Op. 68 Nr. 2" → "bwv1048": compared without spaces and dots. */
const catalogueKey = (text: string) => searchText(text).replace(/[\s.]+/g, '').replace(/^(kv|k)(?=\d)/, 'k');

/**
 * The search result that is the piece's work page: by the composer (IMSLP puts "(Surname, First
 * names)" after every work's title), with the catalogue number when the piece has one. Null
 * rather than a guess: a wrong page would send the librarian looking at the wrong work.
 */
export function pickWork(results: { title: string }[], piece: PieceForImslp): string | null {
	const name = searchText(surname(piece.composer));
	if (!name) return null;
	const byComposer = results.filter(({ title }) => {
		const by = /\(([^()]+)\)\s*$/.exec(title)?.[1] ?? '';
		return searchText(by.split(',')[0]) === name;
	});
	const catalogue = piece.catalogue ? catalogueKey(piece.catalogue) : '';
	if (catalogue) {
		// "BWV 1048" must not match "BWV 10480": the number may not go on.
		const numbered = byComposer.find(({ title }) => {
			const key = catalogueKey(title);
			const at = key.indexOf(catalogue);
			return at >= 0 && !/\d/.test(key[at + catalogue.length] ?? '');
		});
		return numbered?.title ?? null;
	}
	const words = searchText(piece.title).split(/\s+/).filter((word) => word.length > 2);
	return byComposer.find(({ title }) => words.every((word) => searchText(title).includes(word)))?.title ?? null;
}

/** The file descriptions in the page's "Parts" section, without the ones that aren't parts. */
export function partDescriptions(wikitext: string): string[] {
	const start = /^===\s*Parts\s*===\s*$/m.exec(wikitext);
	if (!start) return [];
	const rest = wikitext.slice(start.index + start[0].length);
	// Up to the next heading of the same level ("===Arrangements and Transcriptions==="), not "====Movement====".
	const end = /^===[^=].*[^=]===\s*$/m.exec(rest);
	const section = end ? rest.slice(0, end.index) : rest;
	return [...section.matchAll(/^\|File Description \d+=(.*)$/gm)]
		.map((match) =>
			match[1]
				.replace(/\{\{flat\}\}/gi, '♭')
				.replace(/\{\{sharp\}\}/gi, '♯')
				.replace(/\{\{[^}]*\}\}|\[\[|\]\]/g, '')
				.trim()
		)
		// Not scores and engraving files, nor a numbered movement's files ("1. Lied: Die Trommel gerühret").
		.filter((text) => text && !/score|engraving|mxl|musescore|sibelius|finale|midi/i.test(text) && !/^\d+\.\s/.test(text));
}

/** Whether IMSLP has every part in one file ("Complete Parts"), which may well hold the one missing. */
export const hasCompleteParts = (parts: string[]) => parts.some((text) => /^(complete|all)\s+parts\b/i.test(text));

/** IMSLP's parts as voices of the app's instruments: "Violin 1" → Geige 1. */
export function imslpVoices(parts: string[], config: OrchestraConfig): ScoredVoice[] {
	// "Clarinet 1 (B♭)" is read as Clarinet 1 in B, "Cellos/Basses" as Cellos & Basses.
	const plain = (text: string) =>
		text
			.replace(/\(([A-G])♭\)/g, 'in $1')
			.replace(/\(([A-G])\)/g, 'in $1')
			.replace(/\s*\/\s*/g, ' & ');
	return readInstrumentation(parts.map(plain).join(';'), config);
}

/**
 * Whether IMSLP has a part for a missing one: the same instrument, and the same number unless
 * one of them has none (a "Flute" part for "Flöte 2", or a "Violin 2" for a part for all violins).
 */
export function imslpHas(missing: Pick<ScoredVoice, 'instrument' | 'numbers'>[], available: ScoredVoice[]): boolean {
	return (
		missing.length > 0 &&
		missing.every((voice) =>
			available.some(
				(other) =>
					other.instrument === voice.instrument && (!voice.numbers.length || !other.numbers.length || voice.numbers.some((number) => other.numbers.includes(number)))
			)
		)
	);
}

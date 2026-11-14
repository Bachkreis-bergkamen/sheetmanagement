import { LANGUAGE } from '#lib/i18n/index.ts';
import {
	BAND_KINDS,
	type Candidate,
	candidateName,
	candidatePicture,
	candidateQuery,
	candidateStill,
	composedBy,
	FILM_KINDS,
	filmQuery,
	iconTerms,
	ICON_SETS,
	iconUrl,
	isLogoFile,
	MUSICAL_KINDS,
	namedExactly,
	pickIcon,
	rankCandidates,
	readCandidates
} from '#lib/music/film-art.ts';
import { searchText } from '#lib/music/text.ts';
import { splitList } from '#lib/repertoire/lists.ts';
import { cached } from './cache.ts';
import { appEnv, runInBackground } from './env.ts';
import { portraitHeaders, portraitImageUrl, portraitPageUrl, sparqlRows } from './portraits.ts';

/**
 * A film's picture for a piece's banner (#312): its title logo from Wikimedia Commons, else an
 * open icon for what it's about; for pop and jazz the band's logo (#319). Found through Wikidata
 * like the composers' portraits, cached for a month, and passed on by /api/filmbild, so members'
 * devices never contact the sources.
 *
 * Each lookup is one search and one small query that returns only the few facts a picture needs:
 * reading whole entities (hundreds of KB for Star Wars) cost the Worker more CPU than a request
 * has, and such pieces didn't open (#318).
 */

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const ICONIFY = 'https://api.iconify.design';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** A page doesn't wait longer than this for a first lookup; it shows the genre's drawing meanwhile. */
const LOOKUP_TIMEOUT_MS = 2500;
const HITS = 15;

export interface FilmArt {
	/** The film or band as Wikidata names it, for the picture's description. */
	name: string;
	/** The logo's file on Wikimedia Commons, else a poster's or a musical production's photo. */
	logo?: string;
	/** Else an icon, e.g. "noto:lion". */
	icon?: string;
}

type Json = Record<string, any>;

/** Item ids for a query among items of some classes, in the search's order. */
async function search(query: string, kinds: string[]): Promise<string[]> {
	const classes = kinds.map((kind) => `P31=${kind}`).join('|');
	const url = `${WIKIDATA}?${new URLSearchParams({ action: 'query', list: 'search', srsearch: `${query} haswbstatement:${classes}`, srlimit: String(HITS), srprop: '', format: 'json' })}`;
	const response = await fetch(url, { headers: portraitHeaders, signal: AbortSignal.timeout(8000) });
	if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
	const hits: Json[] = (await response.json())?.query?.search ?? [];
	return hits.map((hit) => hit.title).filter((id): id is string => typeof id === 'string');
}

async function candidates(ids: string[]): Promise<Candidate[]> {
	return ids.length ? readCandidates(await sparqlRows(candidateQuery(ids))) : [];
}

/** A logo file on Commons named after the work, found by a search of the file names. */
async function commonsLogo(name: string): Promise<string | undefined> {
	const url = `${COMMONS}?${new URLSearchParams({ action: 'query', list: 'search', srnamespace: '6', srsearch: `intitle:logo ${name}`, srlimit: '10', srprop: '', format: 'json' })}`;
	const response = await fetch(url, { headers: portraitHeaders, signal: AbortSignal.timeout(8000) });
	if (!response.ok) throw new Error(`Commons answered ${response.status}`);
	const hits: Json[] = (await response.json())?.query?.search ?? [];
	const file = hits.map((hit) => hit.title).find((title): title is string => typeof title === 'string' && isLogoFile(title, name));
	return file?.replace(/^File:/, '');
}

async function icon(terms: string[]): Promise<string | undefined> {
	for (const term of terms) {
		const response = await fetch(`${ICONIFY}/search?${new URLSearchParams({ query: term, prefixes: ICON_SETS.join(','), limit: '32' })}`, {
			headers: portraitHeaders,
			signal: AbortSignal.timeout(5000)
		});
		if (!response.ok) continue;
		const found = pickIcon((await response.json())?.icons);
		if (found) return found;
	}
	return undefined;
}

/** The best hit with a logo, else an icon for what the best hit is about. */
async function lookUpFilm(query: string, musical: boolean): Promise<FilmArt | null> {
	// A musical's film and a musical film's stage show both do.
	const kinds = musical ? [...MUSICAL_KINDS, ...FILM_KINDS] : [...FILM_KINDS, ...MUSICAL_KINDS];
	const ids = await search(query, kinds);
	return pictureOf(query, rankCandidates(query, ids, await candidates(ids), kinds));
}

/**
 * A musical for a piece without the genre: only one by the piece's own composers, so a
 * song called "Elisabeth" never gets the musical's picture.
 */
async function lookUpMusical(query: string, composers: string): Promise<FilmArt | null> {
	const ids = await search(query, MUSICAL_KINDS);
	const ranked = rankCandidates(query, ids, await candidates(ids), MUSICAL_KINDS).filter((candidate) => composedBy(candidate, composers));
	if (!ranked.length) return null;
	// It is the musical: then like one with the genre, so its film's logo comes before a photo of the stage.
	return (await lookUpFilm(query, true)) ?? pictureOf(query, ranked);
}

/**
 * The best of the ranked hits' pictures: a logo, a logo file on Commons named for it, a free
 * poster or a photo of a musical's production, the franchise's logo, else an icon.
 */
async function pictureOf(query: string, ranked: Candidate[]): Promise<FilmArt | null> {
	for (const candidate of ranked) {
		const logo = candidatePicture(candidate);
		if (logo) return { name: candidateName(candidate, LANGUAGE) ?? query, logo };
	}
	// No logo on Wikidata: a file on Commons named for it ("007 logo", "The Lord of the Rings logo").
	const named = [...new Set([query, ...(ranked[0] ? [ranked[0].labels.en, ranked[0].labels.mul] : [])].filter((name): name is string => !!name))];
	for (const name of named.slice(0, 2)) {
		const logo = await commonsLogo(name).catch(() => undefined);
		if (logo) return { name: (ranked[0] && candidateName(ranked[0], LANGUAGE)) ?? query, logo };
	}
	// A poster, or a musical's production ("Lin-Manuel Miranda in Hamilton"): of the work itself.
	for (const candidate of ranked) {
		const still = candidateStill(candidate);
		if (still) return { name: candidateName(candidate, LANGUAGE) ?? query, logo: still };
	}
	// Else the franchise's: broader ("Marvel Cinematic Universe"), but of the same world.
	const franchise = ranked.find((candidate) => candidate.franchiseLogo);
	if (franchise?.franchiseLogo) return { name: candidateName(franchise, LANGUAGE) ?? query, logo: franchise.franchiseLogo };
	const best = ranked[0];
	const found = best && (await icon(iconTerms(best.subjects)));
	return found ? { name: candidateName(best, LANGUAGE) ?? query, icon: found } : null;
}

/** A band's logo: only for a band named exactly so, never a stranger's. */
async function lookUpBand(name: string): Promise<FilmArt | null> {
	const found = (await candidates(await search(name, BAND_KINDS))).find((candidate) => namedExactly(candidate, name) && candidate.logo);
	return found?.logo ? { name: candidateName(found, LANGUAGE) ?? name, logo: found.logo } : null;
}

async function cachedArt(key: string, build: () => Promise<FilmArt | null>): Promise<FilmArt | null> {
	try {
		const { value } = await cached<FilmArt | null>({
			key,
			maxAgeMs: MAX_AGE_MS,
			build,
			kv: appEnv().CACHE,
			waitUntil: runInBackground,
			timeoutMs: LOOKUP_TIMEOUT_MS
		});
		return value;
	} catch (cause) {
		console.error('Looking up a film picture failed:', cause instanceof Error ? cause.message : cause);
		return null;
	}
}

const keyOf = (text: string) => searchText(text).replace(/\s+/g, ' ').trim();

/** The picture for a piece of film music or a musical, cached; null when there's none or the sources don't answer in time. */
export async function filmArt(title: string, musical = false): Promise<FilmArt | null> {
	const query = filmQuery(title);
	const key = keyOf(query);
	if (!key) return null;
	return cachedArt(`film-art:v7:${musical ? 'musical' : 'film'}:${key}`, () => lookUpFilm(query, musical));
}

/**
 * The picture of the musical a piece is from when its genre doesn't say so: looked up by
 * the title and taken only if the musical is by the piece's composers. Cached like a film's.
 */
export async function musicalArt(title: string, composers: string | undefined): Promise<FilmArt | null> {
	const query = filmQuery(title);
	const key = keyOf(query);
	const by = keyOf(composers ?? '');
	if (!key || !by) return null;
	return cachedArt(`musical-art:v1:${key}:${by}`, () => lookUpMusical(query, composers!));
}

/** The logo of a band among a piece's composers ("Queen", "ABBA"), cached. */
export async function bandArt(name: string): Promise<FilmArt | null> {
	const key = keyOf(name);
	if (!key) return null;
	return cachedArt(`band-art:v1:${key}`, () => lookUpBand(name.trim()));
}

/** The first of a piece's composers that is a band with a logo, with the name it was found by; looked up side by side. */
export async function bandFor(composers: string | undefined): Promise<(FilmArt & { query: string }) | null> {
	const names = splitList(composers).slice(0, 3);
	const found = await Promise.all(names.map(bandArt));
	const i = found.findIndex(Boolean);
	return i === -1 ? null : { ...found[i]!, query: names[i] };
}

/** Where the picture itself is: a 600 px rendering of the logo, or the icon's SVG. */
export function filmImageUrl(art: FilmArt): string | null {
	if (art.logo) return portraitImageUrl(art.logo).replace('width=400', 'width=600');
	return art.icon ? iconUrl(art.icon) : null;
}

/** Where the credit under the picture leads: the logo's page on Commons, or the icon set on Iconify. */
export function filmSourceUrl(art: FilmArt): string {
	if (art.logo) return portraitPageUrl(art.logo);
	return `https://icon-sets.iconify.design/${art.icon?.split(':')[0] ?? ''}/`;
}

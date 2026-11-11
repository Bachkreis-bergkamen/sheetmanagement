import { LANGUAGE } from '#lib/i18n/index.ts';
import { FILM, FILM_SERIES, filmQuery, iconTerms, ICON_SETS, iconUrl, logoFile, MUSICAL, pickIcon, subjectIds, TV_SERIES } from '#lib/music/film-art.ts';
import { searchText } from '#lib/music/text.ts';
import { cached } from './cache.ts';
import { appEnv, runInBackground } from './env.ts';
import { portraitHeaders, portraitImageUrl, portraitPageUrl } from './portraits.ts';

/**
 * A film's picture for a piece's banner (#312): its title logo from Wikimedia Commons, else an
 * open icon for what it's about. Found through Wikidata like the composers' portraits, cached
 * for a month, and passed on by /api/filmbild, so members' devices never contact the sources.
 */

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const ICONIFY = 'https://api.iconify.design';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** A page doesn't wait longer than this for a first lookup; it shows the genre's drawing meanwhile. */
const LOOKUP_TIMEOUT_MS = 2500;

export interface FilmArt {
	/** The film as Wikidata names it, for the picture's description. */
	name: string;
	/** The logo's file on Wikimedia Commons. */
	logo?: string;
	/** Else an icon, e.g. "noto:lion". */
	icon?: string;
}

type Json = Record<string, any>;

async function wikidata(params: Record<string, string>): Promise<Json> {
	const response = await fetch(`${WIKIDATA}?${new URLSearchParams({ ...params, format: 'json' })}`, { headers: portraitHeaders, signal: AbortSignal.timeout(8000) });
	if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
	return response.json();
}

/** The best match among items of one class; only the first counts, like for portraits. */
async function find(query: string, kind: string): Promise<string | undefined> {
	const search = await wikidata({ action: 'query', list: 'search', srsearch: `${query} haswbstatement:P31=${kind}`, srlimit: '1' });
	const id = search.query?.search?.[0]?.title;
	return typeof id === 'string' ? id : undefined;
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

const entityOf = async (id: string): Promise<Json | undefined> =>
	(await wikidata({ action: 'wbgetentities', ids: id, props: 'claims|labels', languages: 'de|en' })).entities?.[id];

/** The picture of one item: its logo, else its series' logo (P179), else an icon for its subjects. */
async function pictureOf(entity: Json | undefined): Promise<Omit<FilmArt, 'name'> | null> {
	const logo = logoFile(entity);
	if (logo) return { logo };
	const series = entity?.claims?.P179?.[0]?.mainsnak?.datavalue?.value?.id;
	const seriesLogo = typeof series === 'string' ? logoFile(await entityOf(series)) : undefined;
	if (seriesLogo) return { logo: seriesLogo };
	const subjects = subjectIds(entity).slice(0, 6);
	if (!subjects.length) return null;
	const labels = (await wikidata({ action: 'wbgetentities', ids: subjects.join('|'), props: 'labels', languages: 'en' })).entities ?? {};
	const found = await icon(iconTerms(subjects.map((subject) => labels[subject]?.labels?.en?.value ?? '')));
	return found ? { icon: found } : null;
}

/** The best match of each kind in turn, until one has a picture. */
async function lookUp(query: string, musical: boolean): Promise<FilmArt | null> {
	const [first, second] = LANGUAGE === 'en' ? ['en', 'de'] : ['de', 'en'];
	for (const kind of musical ? [MUSICAL, FILM] : [FILM, FILM_SERIES, TV_SERIES]) {
		const id = await find(query, kind);
		if (!id) continue;
		const entity = await entityOf(id);
		const picture = await pictureOf(entity);
		if (picture) return { name: entity?.labels?.[first]?.value ?? entity?.labels?.[second]?.value ?? query, ...picture };
	}
	return null;
}

/** The picture for a piece of film music or a musical, cached; null when there's none or the sources don't answer in time. */
export async function filmArt(title: string, musical = false): Promise<FilmArt | null> {
	const query = filmQuery(title);
	const key = searchText(query).replace(/\s+/g, ' ').trim();
	if (!key) return null;
	try {
		const { value } = await cached<FilmArt | null>({
			key: `film-art:v1:${musical ? 'musical' : 'film'}:${key}`,
			maxAgeMs: MAX_AGE_MS,
			build: () => lookUp(query, musical),
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

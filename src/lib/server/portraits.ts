import { splitList } from '#lib/repertoire/lists.ts';
import { LANGUAGE } from '#lib/i18n/index.ts';
import { searchText } from '#lib/music/text.ts';
import { cached } from './cache.ts';
import { appEnv, runInBackground } from './env.ts';

/**
 * A composer's portrait for a piece's banner, from Wikimedia Commons by way of Wikidata. Only
 * for composers who died before 1900, so the picture is in the public domain. The server looks
 * it up and passes the image on (/api/portraet), so members' devices never contact Wikimedia.
 */

const API = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';
/** Wikimedia asks servers to say who they are. */
const HEADERS = { 'user-agent': 'Notenarchiv/1.0 (https://github.com/lgreil/sheetmanagement)' };
/** Portraits and lifetimes don't change; misses are looked up again after the same time. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** A page doesn't wait longer than this for a first lookup; it shows the genre's picture meanwhile. */
const LOOKUP_TIMEOUT_MS = 2500;
const DIED_BEFORE = 1900;
/** "Composer" on Wikidata. */
const COMPOSER = 'Q36834';

export interface Portrait {
	/** The person as Wikidata names them, for the picture's description. */
	name: string;
	/** The file on Wikimedia Commons, e.g. "Beethoven.jpg". */
	file: string;
}

type Json = Record<string, any>;

async function call(params: Record<string, string>): Promise<Json> {
	const url = `${API}?${new URLSearchParams({ ...params, format: 'json' })}`;
	const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
	if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
	return response.json();
}

/** The year someone died (P570), when Wikidata knows it to the year. */
export function deathYear(claims: Json): number | undefined {
	for (const claim of claims.P570 ?? []) {
		const value = claim.mainsnak?.datavalue?.value;
		if (value?.time && value.precision >= 9) return Number(value.time.slice(1, 5)) * (value.time.startsWith('-') ? -1 : 1);
	}
	return undefined;
}

/** A portrait from an entity: its image (P18), if the person died before 1900. */
export function portraitOf(entity: Json | undefined): Portrait | null {
	const claims = entity?.claims ?? {};
	const file = claims.P18?.[0]?.mainsnak?.datavalue?.value;
	const labels = Object.fromEntries(Object.entries(entity?.labels ?? {}).map(([language, label]) => [language, (label as Json)?.value]));
	return portraitFrom({ file: typeof file === 'string' ? file : undefined, died: deathYear(claims), labels });
}

/** A portrait from the few facts it needs: the image, the year of death and the names by language. */
export function portraitFrom({ file, died, labels }: { file?: string; died?: number; labels: Record<string, string | undefined> }): Portrait | null {
	if (!file || died === undefined || died >= DIED_BEFORE) return null;
	const [first, second] = LANGUAGE === 'en' ? ['en', 'de'] : ['de', 'en'];
	return { name: labels[first] ?? labels.mul ?? labels[second] ?? '', file };
}

/** Rows from Wikidata's query service. */
export async function sparqlRows(query: string): Promise<Record<string, { value: string } | undefined>[]> {
	const response = await fetch(`${SPARQL}?${new URLSearchParams({ query })}`, {
		headers: { ...HEADERS, accept: 'application/sparql-results+json' },
		signal: AbortSignal.timeout(8000)
	});
	if (!response.ok) throw new Error(`Wikidata's query service answered ${response.status}`);
	return (await response.json())?.results?.bindings ?? [];
}

/**
 * Only the best match counts: "Strauss" finds Richard Strauss first, who died in 1949, and
 * taking the next one could show a stranger's face. Asks only for the image, the year of death
 * and the names: a famous composer's whole entity is too much for a Worker to read (#318).
 */
async function lookUp(name: string): Promise<Portrait | null> {
	const search = await call({ action: 'query', list: 'search', srsearch: `${name} haswbstatement:P106=${COMPOSER}`, srlimit: '1', srprop: '' });
	const id = search.query?.search?.[0]?.title;
	if (typeof id !== 'string' || !/^Q\d+$/.test(id)) return null;
	const [row] = await sparqlRows(`SELECT (SAMPLE(?image_) AS ?image) (MIN(?year) AS ?died) (GROUP_CONCAT(DISTINCT ?label; separator="|") AS ?labels) WHERE {
 OPTIONAL { wd:${id} wdt:P18 ?image_ }
 OPTIONAL { wd:${id} p:P570/psv:P570 [ wikibase:timeValue ?date; wikibase:timePrecision ?precision ] FILTER(?precision >= 9) BIND(YEAR(?date) AS ?year) }
 OPTIONAL { wd:${id} rdfs:label ?l FILTER(LANG(?l) IN ("de", "en", "mul")) BIND(CONCAT(LANG(?l), ":", STR(?l)) AS ?label) }
}`);
	return portraitFrom(portraitFacts(row));
}

/** The facts in a row of the query above. */
export function portraitFacts(row: Record<string, { value: string } | undefined> | undefined) {
	const labels: Record<string, string> = {};
	for (const each of (row?.labels?.value ?? '').split('|')) {
		const at = each.indexOf(':');
		if (at > 0) labels[each.slice(0, at)] ??= each.slice(at + 1);
	}
	const url = row?.image?.value;
	const died = row?.died?.value ? Number(row.died.value) : undefined;
	return {
		file: url ? decodeURIComponent(url.slice(url.lastIndexOf('/') + 1)) : undefined,
		died: Number.isFinite(died) ? died : undefined,
		labels
	};
}

/** The portrait for one name, cached; null when there's none or Wikidata doesn't answer in time. */
export async function composerPortrait(name: string): Promise<Portrait | null> {
	const key = searchText(name).replace(/\s+/g, ' ').trim();
	if (!key) return null;
	try {
		const { value } = await cached<Portrait | null>({
			key: `portrait:v1:${key}`,
			maxAgeMs: MAX_AGE_MS,
			build: () => lookUp(name),
			kv: appEnv().CACHE,
			waitUntil: runInBackground,
			timeoutMs: LOOKUP_TIMEOUT_MS
		});
		return value;
	} catch (cause) {
		console.error('Looking up a portrait failed:', cause instanceof Error ? cause.message : cause);
		return null;
	}
}

/** The first composer of a list who has a portrait, with the name it was found by; looked up side by side. */
export async function portraitFor(composers: string | undefined): Promise<(Portrait & { query: string }) | null> {
	const names = splitList(composers).slice(0, 3);
	const found = await Promise.all(names.map(composerPortrait));
	const i = found.findIndex(Boolean);
	return i === -1 ? null : { ...found[i]!, query: names[i] };
}

/** The picture itself, as a 400 px wide thumbnail. */
export function portraitImageUrl(file: string): string {
	return `https://commons.wikimedia.org/w/index.php?${new URLSearchParams({ title: `Special:FilePath/${file}`, width: '400' })}`;
}

/** The file's page on Commons, for the credit under the picture. */
export function portraitPageUrl(file: string): string {
	return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
}

export const portraitHeaders = HEADERS;

import { LANGUAGE } from '#lib/i18n/index.ts';

/**
 * Background for a piece from Wikipedia (#411), from the browser and only on request: a search
 * for the title and composer, then the article's introduction as plain text. Like Wikidata,
 * Wikipedia needs no key and allows requests from other sites (origin=*); the app's server
 * isn't involved. The text is under CC BY-SA, so whatever is taken over says where it's from.
 */

type Fetch = typeof fetch;
type Json = Record<string, any>;
export type WikiLanguage = 'de' | 'en';

/** The app's language first, the other one when nothing is found in it. */
export const WIKI_LANGUAGES: readonly WikiLanguage[] = LANGUAGE === 'en' ? ['en', 'de'] : ['de', 'en'];

export interface WikiCandidate {
	title: string;
	/** A few words around the match, as plain text. */
	snippet: string;
	language: WikiLanguage;
}

export interface WikiArticle {
	title: string;
	/** The introduction, paragraphs separated by an empty line. */
	text: string;
	url: string;
	language: WikiLanguage;
}

/** Wikipedia asks for a pause (HTTP 429). */
export class WikipediaBusyError extends Error {
	constructor() {
		super('Wikipedia: 429');
		this.name = 'WikipediaBusyError';
	}
}

async function call(language: WikiLanguage, params: Record<string, string>, fetchImpl: Fetch): Promise<Json> {
	const url = `https://${language}.wikipedia.org/w/api.php?${new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' })}`;
	const response = await fetchImpl(url);
	if (response.status === 429) throw new WikipediaBusyError();
	if (!response.ok) throw new Error(`Wikipedia: ${response.status}`);
	return response.json();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#039': "'", nbsp: ' ' };
/** A search snippet is HTML with the match marked: plain text, entities read. */
export const plainSnippet = (html: string) =>
	html
		.replace(/<[^>]*>/g, '')
		.replace(/&(amp|lt|gt|quot|#039|nbsp);/g, (_, name: string) => ENTITIES[name])
		.replace(/\s+/g, ' ')
		.trim();

/** What to search for: the title and the composer's last name, which is how articles are named. */
export function wikiQuery(title: string, composer?: string): string {
	const name = composer?.split(/[,;]/)[0].trim().split(/\s+/).at(-1);
	return [title.trim(), name].filter(Boolean).join(' ');
}

/** Up to five articles; in the app's language, else in the other one. */
export async function searchWikipedia(query: string, fetchImpl: Fetch = fetch): Promise<WikiCandidate[]> {
	if (!query.trim()) return [];
	for (const language of WIKI_LANGUAGES) {
		const json = await call(language, { action: 'query', list: 'search', srsearch: query, srlimit: '5', srprop: 'snippet' }, fetchImpl);
		const found = ((json.query?.search ?? []) as Json[]).map((hit) => ({ title: String(hit.title), snippet: plainSnippet(String(hit.snippet ?? '')), language }));
		if (found.length) return found;
	}
	return [];
}

/** The article's introduction; undefined when it has none (a disambiguation page, say). */
export async function wikipediaArticle(title: string, language: WikiLanguage, fetchImpl: Fetch = fetch): Promise<WikiArticle | undefined> {
	const json = await call(
		language,
		{ action: 'query', prop: 'extracts|info|pageprops', exintro: '1', explaintext: '1', inprop: 'url', redirects: '1', titles: title },
		fetchImpl
	);
	const page = (json.query?.pages ?? [])[0] as Json | undefined;
	if (!page || page.missing || page.pageprops?.disambiguation !== undefined) return undefined;
	const text = String(page.extract ?? '')
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean)
		.join('\n\n');
	if (!text) return undefined;
	return { title: String(page.title), text, url: String(page.fullurl ?? `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`), language };
}

/** A web search for what Wikipedia doesn't know: history, the arranger, the recording. */
export function webSearchUrl(title: string, composer?: string): string {
	return `https://www.google.com/search?${new URLSearchParams({ q: [title, composer].filter(Boolean).join(' ') })}`;
}

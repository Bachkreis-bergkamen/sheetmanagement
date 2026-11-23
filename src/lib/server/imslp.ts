import { IMSLP_ORIGIN, partDescriptions, pickWork, searchQueries, searchWords, workUrl, type ImslpWork, type PieceForImslp } from '#lib/music/imslp.ts';
import { searchText } from '#lib/music/text.ts';
import { cached } from './cache.ts';
import { appEnv, runInBackground } from './env.ts';

/**
 * The IMSLP lookup for missing parts (#198), through IMSLP's MediaWiki API. Only the server asks,
 * once per work and month; members' devices only follow the link to the page.
 */

const API = `${IMSLP_ORIGIN}/api.php`;
/** IMSLP, like Wikimedia, asks servers to say who they are. */
const HEADERS = { 'user-agent': 'Notenarchiv/1.0 (https://github.com/Bachkreis-bergkamen/sheetmanagement)', accept: 'application/json' };
/** Pages change slowly; a work without parts is asked again after the same time. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

type Json = Record<string, any>;

async function call(params: Record<string, string>, fetchImpl: typeof fetch): Promise<Json> {
	const response = await fetchImpl(`${API}?${new URLSearchParams({ ...params, format: 'json' })}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!response.ok) throw new Error(`IMSLP answered ${response.status}`);
	return response.json();
}

/** The work's page and its parts, or null when IMSLP has no page that is clearly this work. */
export async function findOnImslp(piece: PieceForImslp, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<ImslpWork | null> {
	let title: string | null = null;
	// The first search that clearly finds the work counts; most pieces need one.
	for (const query of searchQueries(piece)) {
		const search = await call({ action: 'query', list: 'search', srsearch: query, srnamespace: '0', srlimit: '10', srprop: '' }, fetchImpl);
		title = pickWork((search.query?.search ?? []) as { title: string }[], piece);
		if (title) break;
	}
	if (!title) return null;
	// A redirect ("…, BWV 1048 (Bach, Johann Sebastian)" without the key) leads to the work itself.
	const page = await call({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' }, fetchImpl);
	const wikitext = page.parse?.wikitext?.['*'];
	if (typeof wikitext !== 'string') return null;
	const shown = typeof page.parse?.title === 'string' ? page.parse.title : title;
	return { title: shown, url: workUrl(shown), parts: partDescriptions(wikitext) };
}

/** The lookup, cached a month per piece; throws when IMSLP can't be reached. */
export async function imslpWork(piece: PieceForImslp): Promise<ImslpWork | null> {
	const key = searchText(searchWords(piece)).replace(/\s+/g, ' ').trim();
	const { value } = await cached<ImslpWork | null>({
		key: `imslp:v1:${key}`,
		maxAgeMs: MAX_AGE_MS,
		build: () => findOnImslp(piece),
		kv: appEnv().CACHE,
		waitUntil: runInBackground,
		timeoutMs: TIMEOUT_MS * 2
	});
	return value;
}

import type { Trip, TripPicture } from '#lib/trips/trips.ts';
import { config } from '#lib/config/index.ts';
import type { TripStore } from './trips-store.ts';

/**
 * A picture of the place a trip goes to (#334): a recognisable sight from Wikimedia Commons,
 * found through Wikidata, where a town's "image" (P18) is usually a photo of its landmark or
 * skyline, not its coat of arms. Looked up once when the place changes and kept with the trip;
 * the app serves the image from its own address (/fahrten/[id]/bild), so members' browsers
 * never ask Wikimedia themselves.
 */

/** Wikimedia asks automated clients to say who they are. */
const USER_AGENT = 'sheetmanagement-trips/1.0 (https://github.com/Bachkreis-bergkamen/sheetmanagement)';
const WIDTH = 1600;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** What to look up: the organisers' own words, else the first place of the trip. */
export function pictureQuery(trip: Pick<Trip, 'pictureSearch' | 'noPicture' | 'stops'>): string {
	if (trip.noPicture) return '';
	return (trip.pictureSearch ?? trip.stops[0]?.place ?? '').trim();
}

/**
 * The searches to try, most specific first: "Jugendherberge Haltern am See" finds no picture of
 * the hostel, but "Haltern am See" does. Parts after a comma come next ("Altstadt, Florenz").
 */
export function searchesFor(query: string): string[] {
	const words = query.split(/\s+/).filter(Boolean);
	// "am See" and "See" are parts of "Haltern am See", not places of their own.
	const joins = (word = '') => /^(am|an|im|in|bei|auf|zum|zur|unter|ob|a|di|de|del|della|sur|sous|upon|on)$/i.test(word.replace(/,$/, ''));
	const tries = [query];
	for (let drop = 1; drop < Math.min(words.length, 4); drop++) if (!joins(words[drop]) && !joins(words[drop - 1])) tries.push(words.slice(drop).join(' '));
	for (const part of query.split(',').map((piece) => piece.trim()).reverse()) if (part) tries.push(part);
	return [...new Set(tries.map((one) => one.replace(/,$/, '').trim()))].filter((one) => one.length > 2).slice(0, 6);
}

/** Where Commons keeps its images; the app fetches the picture from nowhere else. */
export function isWikimediaImage(url: string): boolean {
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === 'https:' && (hostname === 'upload.wikimedia.org' || hostname === 'thumb.wikimedia.org');
	} catch {
		return false;
	}
}

/** The image's address without Commons' "utm_" tracking parameters. */
const cleanUrl = (url: string) => {
	const clean = new URL(url);
	for (const key of [...clean.searchParams.keys()]) if (key.startsWith('utm_')) clean.searchParams.delete(key);
	return clean.toString();
};

const api = (host: string, params: Record<string, string>) => `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`;

async function json<T>(fetcher: Fetcher, url: string): Promise<T | null> {
	const response = await fetcher(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
	return response.ok ? ((await response.json()) as T) : null;
}

/** Text from the HTML Commons gives for the author: "<a …>Jane Doe</a>" → "Jane Doe". */
export const plain = (html = '') =>
	html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 200);

interface Claim {
	mainsnak?: { datavalue?: { value?: unknown } };
}
interface Entity {
	id: string;
	labels?: Record<string, { value: string }>;
	claims?: Record<string, Claim[]>;
}

/** Looks a place up; null when nothing with a photo is found, or Wikimedia doesn't answer. */
export async function findPicture(query: string, fetcher: Fetcher = fetch): Promise<TripPicture | null> {
	const language = config.locale.slice(0, 2) || 'de';
	for (const search of searchesFor(query)) {
		const found = await json<{ search?: { id: string }[] }>(fetcher, api('www.wikidata.org', { action: 'wbsearchentities', search, language, uselang: language, type: 'item', limit: '5' }));
		const ids = found?.search?.map((hit) => hit.id) ?? [];
		if (!ids.length) continue;
		const entities = await json<{ entities?: Record<string, Entity> }>(fetcher, api('www.wikidata.org', { action: 'wbgetentities', ids: ids.join('|'), props: 'labels|claims', languages: `${language}|en` }));
		for (const id of ids) {
			const entity = entities?.entities?.[id];
			// Places only: things with coordinates. A photo, not a drawing: no SVG coats of arms or maps.
			const file = entity?.claims?.P18?.map((claim) => claim.mainsnak?.datavalue?.value).find((value): value is string => typeof value === 'string' && !/\.svg$/i.test(value));
			const where = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value as { latitude?: number; longitude?: number } | undefined;
			if (!entity || !file || !where) continue;
			const info = await json<{ query?: { pages?: { imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }[] } }>(
				fetcher,
				api('commons.wikimedia.org', { action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(WIDTH), iiextmetadatafilter: 'Artist|LicenseShortName' })
			);
			const image = info?.query?.pages?.[0]?.imageinfo?.[0];
			if (!image?.thumburl || !isWikimediaImage(image.thumburl)) continue;
			const artist = plain(image.extmetadata?.Artist?.value);
			const license = plain(image.extmetadata?.LicenseShortName?.value);
			return {
				url: cleanUrl(image.thumburl),
				page: image.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
				title: entity.labels?.[language]?.value ?? entity.labels?.en?.value ?? search,
				...(artist ? { artist } : {}),
				...(license ? { license } : {}),
				...(typeof where.latitude === 'number' && typeof where.longitude === 'number' ? { lat: where.latitude, lon: where.longitude } : {})
			};
		}
	}
	return null;
}

/**
 * Looks the trip's picture up when its place changed since the last look, and keeps what was
 * found (or that nothing was). Never fails the page: without Wikimedia the trip has no picture.
 */
export async function ensurePicture(store: TripStore, trip: Trip, fetcher: Fetcher = fetch): Promise<Trip> {
	const query = pictureQuery(trip);
	if ((trip.pictureFor ?? null) === query && (query || !trip.picture)) return trip;
	try {
		const picture = query ? await findPicture(query, fetcher) : null;
		await store.setPicture(trip.id, picture, query);
		return { ...trip, picture: picture ?? undefined, pictureFor: query };
	} catch (cause) {
		console.error('Looking up the picture of a trip failed:', cause);
		return trip;
	}
}

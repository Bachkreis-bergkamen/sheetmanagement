import type { Trip, TripPicture } from '#lib/trips/trips.ts';
import { config } from '#lib/config/index.ts';

/**
 * A picture of the place a trip goes to (#334): the best-known sight nearby with a good photo.
 * A town's own "image" on Wikidata is often an aerial view or its station, so instead Wikidata is
 * asked for the things around the place's coordinates (from OpenStreetMap, see trip-geo.ts),
 * ranked by how many Wikipedias have an article on them: the Kölner Dom in Köln, the Duomo in
 * Florence. Their photos on Wikimedia Commons are then weighed: large, wider than tall, not taken
 * from above, and better still when Commons marks them as quality or featured pictures.
 *
 * The app serves the chosen image from its own address (/fahrten/[id]/bild), so members'
 * browsers never ask Wikimedia themselves.
 */

/** Wikimedia asks automated clients to say who they are. */
const USER_AGENT = 'sheetmanagement-trips/1.0 (https://github.com/Bachkreis-bergkamen/sheetmanagement)';
/** Sharp in the page's header on a sharp display; Commons rounds wider requests up to 3840. */
const WIDTH = 1920;
/** Smaller photos look soft in the header. */
const MIN_WIDTH = 1400;
/** How far around the place to look, in kilometres. */
const RADIUS_KM = 5;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** At most this many pictures a trip; a long tour shows its first places. */
export const PICTURES_MAX = 8;

/**
 * What the trip's pictures are looked up for, in their order: the first place (or the organisers'
 * own words instead), then the other places. None when the pictures are switched off.
 */
export function pictureQueries(trip: Pick<Trip, 'pictureSearch' | 'noPicture' | 'stops'>): string[] {
	if (trip.noPicture) return [];
	const first = (trip.pictureSearch ?? trip.stops[0]?.place ?? '').trim();
	return [...new Set([first, ...trip.stops.slice(1).map((stop) => stop.place.trim())].filter(Boolean))].slice(0, PICTURES_MAX);
}

/** The pictures to show, each with its place; two places near each other may find the same one, shown once. */
export function shownPictures(trip: Pick<Trip, 'pictureSearch' | 'noPicture' | 'stops' | 'pictures'>): { place: string; picture: TripPicture }[] {
	const seen = new Set<string>();
	return pictureQueries(trip).flatMap((place) => {
		const picture = trip.pictures?.[place];
		if (!picture || seen.has(picture.url)) return [];
		seen.add(picture.url);
		return [{ place, picture }];
	});
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

/**
 * The same image smaller, for the list of trips. Commons makes thumbnails only in its standard
 * widths (…, 330, 500, 960, 1280, 1920) and answers 400 to any other, so this is one of them:
 * 960, sharp on a phone's card at two or three pixels per point.
 */
export const smaller = (url: string, width = 960) => url.replace(/\/\d+px-([^/?]+)/, `/${width}px-$1`);

/** Text from the HTML Commons gives for the author: "<a …>Jane Doe</a>" → "Jane Doe". */
/** The few entities Commons uses, decoded in one pass, so "&amp;lt;" stays "&lt;" and nothing is decoded twice. */
const ENTITIES: Record<string, string> = { amp: '&', quot: '"', '#39': "'", '#039': "'", nbsp: ' ', lt: '<', gt: '>' };

/**
 * Text from the HTML Commons gives for the author: "<a …>Jane Doe</a>" → "Jane Doe". The tags go
 * first, then the entities; angle brackets left after that go too, so no tag can come out of it.
 * Svelte escapes the text anyway; this is for a clean credit line.
 */
export const plain = (html = '') =>
	html
		.replace(/<[^>]*>/g, ' ')
		.replace(/&(amp|quot|#0?39|nbsp|lt|gt);/g, (_, name: string) => ENTITIES[name])
		.replace(/[<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 200);

/**
 * Not sights, however many articles they have: stations and stops, streets, people, companies,
 * banks, schools, universities, hospitals, power stations, clubs, trade fairs and festivals.
 */
const NOT_SIGHTS = [
	'Q55488', 'Q18543139', 'Q1339195', 'Q928830', 'Q2175765', 'Q55485', 'Q4663385', 'Q12819564', 'Q1793804', 'Q953806',
	'Q79007', 'Q34442', 'Q5', 'Q4830453', 'Q783794', 'Q22687', 'Q3914', 'Q9842', 'Q3918', 'Q875538', 'Q902104', 'Q16917',
	'Q159719', 'Q847017', 'Q57305', 'Q132241', 'Q15275719', 'Q1248784'
];

/** The query for Wikidata: things with a photo around a point, the most-linked first. */
export function sightsQuery(lat: number, lon: number, radiusKm = RADIUS_KM): string {
	return `SELECT ?item ?itemLabel ?image ?links ?dist ?town WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral ; wikibase:radius "${radiusKm}" ; wikibase:distance ?dist . }
  ?item wdt:P18 ?image ; wikibase:sitelinks ?links .
  BIND(EXISTS { ?item wdt:P1082 [] } AS ?town)
  FILTER NOT EXISTS { ?item wdt:P36 [] }
  FILTER NOT EXISTS { ?item wdt:P580 [] }
  FILTER NOT EXISTS { ?item wdt:P585 [] }
  FILTER NOT EXISTS { ?item wdt:P170 [] }
  FILTER NOT EXISTS { VALUES ?not { ${NOT_SIGHTS.map((id) => `wd:${id}`).join(' ')} } ?item wdt:P31 ?not }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${config.locale.slice(0, 2) || 'de'},en" . }
} ORDER BY DESC(?links) LIMIT 25`;
}

export interface Candidate {
	title: string;
	/** The file's name on Commons, with spaces. */
	file: string;
	/** How many Wikipedias have an article on it. */
	links: number;
	/** How far from the place, in kilometres. */
	km: number;
	/** A town or village: its photo is weighed on its own, not by its many articles. */
	town: boolean;
}

export interface Photo {
	width: number;
	height: number;
	/** Commons' categories of the file, "|"-separated. */
	categories: string;
}

/**
 * How good a candidate is for the header: well-known and close first, then a large, wide photo,
 * better still a quality or featured one; hardly ever a photo from above. Null: not usable at all.
 */
export function score(candidate: Candidate, photo: Photo | undefined): number | null {
	if (!photo || !/\.(jpe?g|webp)$/i.test(candidate.file)) return null;
	if (photo.width < MIN_WIDTH || photo.width / photo.height < 0.6) return null;
	if (/bahnhof|station|haltestelle|flughafen|airport/i.test(candidate.title)) return null;
	const known = candidate.town ? 2.6 : Math.log(candidate.links + 1);
	const quality = /Quality images|Featured pictures|Valued images|Pictures of the day|Exzellente Bilder/i.test(photo.categories) ? 0.7 : 0;
	const wide = photo.width >= photo.height * 1.2 ? 0.5 : 0;
	const above = /aerial|luftbild|luftaufnahme|from above|from the air|drone|von oben/i.test(photo.categories) ? 1.2 : 0;
	// A sight should be close; the town is the town even from its edge, where hostels often are.
	return known - (candidate.town ? 0.1 : 0.25) * candidate.km + quality + wide - above;
}

async function json<T>(fetcher: Fetcher, url: string, accept = 'application/json'): Promise<T | null> {
	const response = await fetcher(url, { headers: { 'user-agent': USER_AGENT, accept }, signal: AbortSignal.timeout(8000) });
	return response.ok ? ((await response.json()) as T) : null;
}

interface Binding {
	item: { value: string };
	itemLabel?: { value: string };
	image: { value: string };
	links: { value: string };
	dist: { value: string };
	town?: { value: string };
}

interface ImageInfo {
	thumburl?: string;
	descriptionurl?: string;
	width?: number;
	height?: number;
	extmetadata?: Record<string, { value?: string }>;
}

/** The best photo of a sight around a place; null when there's none good enough, or Wikimedia doesn't answer. */
export async function findPicture({ lat, lon }: { lat: number; lon: number }, fetcher: Fetcher = fetch): Promise<TripPicture | null> {
	const sights = await json<{ results?: { bindings?: Binding[] } }>(fetcher, `https://query.wikidata.org/sparql?${new URLSearchParams({ query: sightsQuery(lat, lon), format: 'json' })}`, 'application/sparql-results+json');
	const seen = new Set<string>();
	let candidates: Candidate[] = (sights?.results?.bindings ?? []).flatMap((row) => {
		const file = decodeURIComponent(row.image.value.split('/').pop() ?? '').replace(/_/g, ' ');
		if (!file || seen.has(file)) return [];
		seen.add(file);
		return [{ title: row.itemLabel?.value ?? '', file, links: Number(row.links.value) || 0, km: Number(row.dist.value) || 0, town: row.town?.value === 'true' }];
	});
	// Only the place's own town: a neighbouring one is somewhere else.
	const nearestTown = Math.min(...candidates.filter((one) => one.town).map((one) => one.km));
	candidates = candidates.filter((one) => !one.town || one.km === nearestTown);
	if (!candidates.length) return null;

	// Every photo's size and categories in one request.
	const info = await json<{ query?: { pages?: { title: string; imageinfo?: ImageInfo[] }[] } }>(
		fetcher,
		`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
			action: 'query',
			format: 'json',
			formatversion: '2',
			titles: candidates.map((candidate) => `File:${candidate.file}`).join('|'),
			prop: 'imageinfo',
			iiprop: 'url|size|extmetadata',
			iiurlwidth: String(WIDTH),
			iiextmetadatafilter: 'Artist|LicenseShortName|Categories'
		})}`
	);
	const images = new Map((info?.query?.pages ?? []).map((page) => [page.title.replace(/^[^:]+:/, ''), page.imageinfo?.[0]]));
	const ranked = candidates
		.map((candidate) => {
			const image = images.get(candidate.file);
			const photo = image?.width && image.height ? { width: image.width, height: image.height, categories: image.extmetadata?.Categories?.value ?? '' } : undefined;
			return { candidate, image, value: score(candidate, photo) };
		})
		.filter((one): one is typeof one & { value: number; image: ImageInfo & { thumburl: string } } => one.value !== null && !!one.image?.thumburl && isWikimediaImage(one.image.thumburl))
		.sort((a, b) => b.value - a.value);
	const best = ranked[0];
	if (!best) return null;
	const artist = plain(best.image.extmetadata?.Artist?.value);
	const license = plain(best.image.extmetadata?.LicenseShortName?.value);
	return {
		url: cleanUrl(best.image.thumburl),
		page: best.image.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(best.candidate.file)}`,
		title: best.candidate.title,
		...(artist ? { artist } : {}),
		...(license ? { license } : {}),
		...((best.image.height ?? 0) > (best.image.width ?? 0) ? { tall: true } : {})
	};
}

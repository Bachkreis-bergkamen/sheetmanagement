import { searchText } from './text.ts';

/**
 * The picture for a film's music (#312): instead of a composer's portrait, the film's title logo
 * from Wikimedia Commons (Wikidata's "logo image", P154), which is mostly a plain wordmark and
 * free to show. Without a logo, an emoji-style icon for what the film is about (Wikidata's "main
 * subject", P921: "lion", "dinosaur") from the open icon sets Iconify serves. Pop and jazz get
 * their band's logo the same way (#319). The lookups run on the server (see server/film-art.ts);
 * this file holds what can be tested without the network.
 */

/** Wikidata classes of films: feature films, animated films (How to Train Your Dragon, 2010), series, franchises. */
export const FILM_KINDS = ['Q11424', 'Q202866', 'Q29168811', 'Q24856', 'Q5398426', 'Q196600'];
/** Stage musicals: "musical" and "dramatico-musical work" (Grease). */
export const MUSICAL_KINDS = ['Q2743', 'Q58483083'];
/** Bands and groups: musical group, rock band, duo, girl group, boy band. */
export const BAND_KINDS = ['Q215380', 'Q5741069', 'Q9212979', 'Q641066', 'Q216337'];

/**
 * Open icon sets with licences that allow showing them without a notice next to each icon:
 * Google's Noto Emoji (Apache 2.0) and Microsoft's Fluent Emoji (MIT). Colourful, one style.
 */
export const ICON_SETS = ['noto', 'fluent-emoji-flat'] as const;

/** Words and phrases around a film's name in an arrangement's title, which a search for the film doesn't want. */
const NOISE = new Set(
	[
		'theme', 'themes', 'music', 'musik', 'melodien', 'melodies', 'highlight', 'highlights', 'medley', 'suite', 'selection', 'selections',
		'potpourri', 'fantasy', 'fantasie', 'soundtrack', 'filmmusik', 'score', 'main title', 'main theme', 'end title', 'end titles', 'opening',
		'finale', 'aus', 'from', 'of', 'the best of', 'best of', 'arr', 'arr.', 'for', 'fur', 'orchestra', 'orchester', 'symphonic', 'symphony', 'symphonie', 'sinfonie',
		'reflections', 'tribute', 'overture', 'ouverture', 'concert'
	].map((phrase) => phrase.split(' '))
);
const LONGEST_NOISE = Math.max(...[...NOISE].map((phrase) => phrase.length));

const plain = (word: string) => searchText(word).replace(/[^a-z.]/g, '');

/** How many words at the start (or the end) of `words` are one noise phrase; 0 for none. */
function noiseAt(words: string[], fromEnd: boolean): number {
	for (let length = Math.min(LONGEST_NOISE, words.length); length > 0; length--) {
		const slice = (fromEnd ? words.slice(-length) : words.slice(0, length)).map(plain);
		if ([...NOISE].some((phrase) => phrase.length === length && phrase.every((word, i) => word === slice[i]))) return length;
	}
	return 0;
}

/**
 * The film's name in an arrangement's title: "Themes from Jurassic Park" → "Jurassic Park",
 * "Der König der Löwen (Medley)" → "Der König der Löwen", "Main Title: Interstellar" →
 * "Interstellar". Empty when nothing is left.
 */
export function filmQuery(title: string): string {
	// Articles stay ("Der König der Löwen"): only the arrangement's words go, and only at the edges.
	const strip = (part: string) => {
		const words = part.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
		for (let before = -1; before !== words.length; ) {
			before = words.length;
			words.splice(0, noiseAt(words, false));
			words.splice(words.length - noiseAt(words, true));
		}
		return words.join(' ').replace(/^[,:;\s]+|[,:;\s]+$/g, '').trim();
	};
	// "Main Title – Star Wars": the first part with more than the arrangement's words.
	const parts = title
		.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
		.replace(/["“”„«»]/g, ' ')
		.split(/\s[-–—|/]\s/)
		.map(strip);
	return parts.find(Boolean) ?? '';
}

/** What Wikidata's query service says about one search hit. */
export interface Candidate {
	id: string;
	kinds: string[];
	/** Its labels by language ("de", "en", "mul"). */
	labels: Record<string, string>;
	logo?: string;
	/** The logo of the series it belongs to (P179): "Harry Potter" for the second film. */
	seriesLogo?: string;
	/** The logo of its franchise (P8345), broader: "Wizarding World", "Marvel Cinematic Universe". */
	franchiseLogo?: string;
	/** English labels of what it's about (P921). */
	subjects: string[];
	/** In how many Wikipedias it has an article: the better known of two works of one name. */
	fame?: number;
	/** Its poster (P3383), on Commons only when it's free: old films, some shows. */
	poster?: string;
	/** Its image (P18): for a musical mostly a photo of a production or its theatre. */
	photo?: string;
	/** Its composers' names (P86), to tell a musical from a piece of the same name. */
	composers?: string[];
}

type Binding = Record<string, { value: string } | undefined>;

/** A file name from a Commons file URL ("…/Special:FilePath/Star%20Wars%20Logo.svg" → "Star Wars Logo.svg"). */
export function commonsFile(url: string | undefined): string | undefined {
	if (!url) return undefined;
	const name = url.slice(url.lastIndexOf('/') + 1);
	try {
		return decodeURIComponent(name) || undefined;
	} catch {
		return name || undefined;
	}
}

const split = (value: string | undefined) => (value ? value.split('|').filter(Boolean) : []);

/** The rows of the query from `candidateQuery`, one per item. */
export function readCandidates(bindings: Binding[]): Candidate[] {
	return bindings.flatMap((row) => {
		const id = commonsFile(row.item?.value);
		if (!id || !/^Q\d+$/.test(id)) return [];
		const labels: Record<string, string> = {};
		for (const each of split(row.labels?.value)) {
			const at = each.indexOf(':');
			if (at > 0 && !labels[each.slice(0, at)]) labels[each.slice(0, at)] = each.slice(at + 1);
		}
		return [
			{
				id,
				kinds: split(row.kinds?.value).map((kind) => commonsFile(kind) ?? kind),
				labels,
				logo: commonsFile(row.logo?.value),
				seriesLogo: commonsFile(row.seriesLogo?.value),
				franchiseLogo: commonsFile(row.franchiseLogo?.value),
				subjects: split(row.subjects?.value),
				fame: Number(row.fame?.value) || 0,
				poster: commonsFile(row.poster?.value),
				photo: commonsFile(row.photo?.value),
				composers: split(row.composers?.value)
			}
		];
	});
}

/**
 * One small query for all search hits at once: only the few facts the picture needs, so the
 * Worker never downloads and parses a film's whole entity (hundreds of KB for Star Wars, #318).
 */
export function candidateQuery(ids: string[]): string {
	const values = ids.filter((id) => /^Q\d+$/.test(id)).map((id) => `wd:${id}`).join(' ');
	return `SELECT ?item (GROUP_CONCAT(DISTINCT ?kind; separator="|") AS ?kinds)
 (GROUP_CONCAT(DISTINCT ?label; separator="|") AS ?labels) (SAMPLE(?logo_) AS ?logo)
 (SAMPLE(?seriesLogo_) AS ?seriesLogo) (SAMPLE(?franchiseLogo_) AS ?franchiseLogo)
 (GROUP_CONCAT(DISTINCT ?subject; separator="|") AS ?subjects) (SAMPLE(?links) AS ?fame)
 (SAMPLE(?poster_) AS ?poster) (SAMPLE(?photo_) AS ?photo) (GROUP_CONCAT(DISTINCT ?composer; separator="|") AS ?composers) WHERE {
 VALUES ?item { ${values} }
 OPTIONAL { ?item wdt:P31 ?kind }
 OPTIONAL { ?item wikibase:sitelinks ?links }
 OPTIONAL { ?item rdfs:label ?l FILTER(LANG(?l) IN ("de", "en", "mul")) BIND(CONCAT(LANG(?l), ":", STR(?l)) AS ?label) }
 OPTIONAL { ?item wdt:P154 ?logo_ }
 OPTIONAL { ?item wdt:P179/wdt:P154 ?seriesLogo_ }
 OPTIONAL { ?item wdt:P8345/wdt:P154 ?franchiseLogo_ }
 OPTIONAL { ?item wdt:P921/rdfs:label ?s FILTER(LANG(?s) = "en") BIND(STR(?s) AS ?subject) }
 OPTIONAL { ?item wdt:P3383 ?poster_ }
 OPTIONAL { ?item wdt:P18 ?photo_ }
 OPTIONAL { ?item wdt:P86/rdfs:label ?c FILTER(LANG(?c) IN ("en", "mul")) BIND(STR(?c) AS ?composer) }
} GROUP BY ?item`;
}

/** The name to show, in the app's language first. */
export function candidateName(candidate: Candidate, language: string): string | undefined {
	const { labels } = candidate;
	return labels[language] ?? labels.mul ?? labels.en ?? labels.de ?? Object.values(labels)[0];
}

/** A name's words for comparing, without a leading article: "Das Phantom der Oper" is "phantom der oper". */
const nameWords = (name: string) =>
	searchText(name)
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/^(the|a|an|der|die|das|le|la|les|il|el) /, '')
		.split(' ')
		.filter(Boolean);
const same = (a: string, b: string) => nameWords(a).join(' ') === nameWords(b).join(' ');

/** Whether one of its names has all the query's words: "Star Wars The Force Awakens" in "Star Wars: Episode VII – The Force Awakens". */
export function namedLike(candidate: Candidate, query: string): boolean {
	const wanted = nameWords(query);
	return wanted.length > 0 && Object.values(candidate.labels).some((label) => {
		const words = new Set(nameWords(label));
		return wanted.every((word) => words.has(word));
	});
}

/** Whether one of its names is the query ("Pirates of the Caribbean", not "… 2"). */
export function namedExactly(candidate: Candidate, query: string): boolean {
	return Object.values(candidate.labels).some((label) => same(label, query));
}

/**
 * The hits worth a picture, best first: those named exactly like the query in the order of the
 * classes wanted (a musical before its film), else the search's first hit alone if its name has
 * all the query's words. Other hits stay out: "Interstellar War" isn't Interstellar, and Cats
 * isn't "Andrew Lloyd Webber".
 */
export function rankCandidates(query: string, order: string[], candidates: Candidate[], kinds: string[]): Candidate[] {
	const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	const hits = order.map((id) => byId.get(id)).filter((candidate): candidate is Candidate => !!candidate);
	const rank = (candidate: Candidate) => Math.min(...candidate.kinds.map((kind) => kinds.indexOf(kind)).filter((i) => i >= 0), kinds.length);
	const exact = hits.filter((candidate) => namedExactly(candidate, query)).sort((a, b) => rank(a) - rank(b) || (b.fame ?? 0) - (a.fame ?? 0));
	return exact.length ? exact : hits.slice(0, 1).filter((candidate) => namedLike(candidate, query));
}

/** Its logo, else its series'. (Its franchise's comes last, after a logo file on Commons named for it.) */
export function candidatePicture(candidate: Candidate): string | undefined {
	return candidate.logo ?? candidate.seriesLogo;
}

/** Whether it is a stage musical, not its film. */
export const isMusical = (candidate: Candidate) => candidate.kinds.some((kind) => MUSICAL_KINDS.includes(kind));

/**
 * When there's no logo: its poster, and for a musical the photo of a production. A film's image
 * is mostly a still or one of its actors, so films get only a poster.
 */
export function candidateStill(candidate: Candidate): string | undefined {
	return candidate.poster ?? (isMusical(candidate) ? candidate.photo : undefined);
}

/**
 * Whether a piece's composers wrote it: one of its composers' surnames is among the piece's
 * names ("Lloyd Webber, arr. Custer" for Andrew Lloyd Webber). How a piece without the genre
 * "Musical" is still found as one, but a song "Elisabeth" never as the musical.
 */
export function composedBy(candidate: Candidate, composers: string | undefined): boolean {
	const words = new Set(nameWords(composers ?? ''));
	return (candidate.composers ?? []).some((name) => {
		const surname = nameWords(name).at(-1);
		return !!surname && surname.length > 2 && words.has(surname);
	});
}

/** Words a logo's file name may have besides the name: "Evita Soundtrack Logo.png", "007 logo (cropped).jpg". */
const LOGO_WORDS = new Set(['logo', 'wordmark', 'soundtrack', 'film', 'movie', 'musical', 'series', 'official', 'transparent', 'title', 'cropped']);

/**
 * Whether a file on Commons is the logo of something of this name: "File:The Lord of the Rings
 * logo.svg" for "The Lord of the Rings", but not "Thunderball-logo.svg" for "007". For works
 * without a logo on Wikidata (#319); the name must be all there is besides words like "logo".
 */
export function isLogoFile(file: string, name: string): boolean {
	const base = file.replace(/^file:/i, '').replace(/\.[a-z0-9]+$/i, '');
	const words = nameWords(base.replace(/[-_]/g, ' '));
	if (!words.some((word) => word === 'logo' || word === 'wordmark')) return false;
	return same(words.filter((word) => !LOGO_WORDS.has(word)).join(' '), name);
}

/** Subjects that make no picture: themes and feelings, not things. */
const ABSTRACT = /relationship|friendship|love|revenge|death|redemption|liberty|oppression|misery|rivalry|ethics|theory|system|distinction|identity|family|good and evil|coming of age|christianity|religion/;

/** Search words for an icon, from the English labels of a film's subjects: "lion", "dinosaur". */
export function iconTerms(subjects: string[]): string[] {
	return subjects
		.map((label) => searchText(label).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim())
		.filter((label) => label && !ABSTRACT.test(label) && label.split(' ').length <= 2)
		.slice(0, 4);
}

/** The first icon of the allowed sets in an Iconify search answer ("noto:lion"). */
export function pickIcon(icons: unknown): string | undefined {
	if (!Array.isArray(icons)) return undefined;
	for (const set of ICON_SETS) {
		const found = icons.find((icon): icon is string => typeof icon === 'string' && icon.startsWith(`${set}:`));
		if (found) return found;
	}
	return undefined;
}

/** "noto:lion" → its SVG on Iconify's API; null for anything that isn't one of the allowed sets. */
export function iconUrl(icon: string): string | null {
	const [set, name] = icon.split(':');
	if (!(ICON_SETS as readonly string[]).includes(set) || !name || !/^[a-z0-9-]+$/.test(name)) return null;
	return `https://api.iconify.design/${set}/${name}.svg`;
}

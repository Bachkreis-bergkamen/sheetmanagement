import { searchText } from './text.ts';

/**
 * The picture for a film's music (#312): instead of a composer's portrait, the film's title logo
 * from Wikimedia Commons (Wikidata's "logo image", P154), which is mostly a plain wordmark and
 * free to show. Without a logo, an emoji-style icon for what the film is about (Wikidata's "main
 * subject", P921: "lion", "dinosaur") from the open icon sets Iconify serves. The lookups run on
 * the server (see server/film-art.ts); this file holds what can be tested without the network.
 */

/** Wikidata classes to search, in order: film, film series, TV series, musical. */
export const FILM = 'Q11424';
export const FILM_SERIES = 'Q24856';
export const TV_SERIES = 'Q5398426';
export const MUSICAL = 'Q2743';

/**
 * Open icon sets with licences that allow showing them without a notice next to each icon:
 * Google's Noto Emoji (Apache 2.0) and Microsoft's Fluent Emoji (MIT). Colourful, one style.
 */
export const ICON_SETS = ['noto', 'fluent-emoji-flat'] as const;

/** Words around a film's name in an arrangement's title, which a search for the film doesn't want. */
const NOISE =
	/\b(themes?|music|musik|melodien|melodies|highlights?|medley|suite|selections?|potpourri|fantasy|fantasie|soundtrack|filmmusik|score|main title|end title|aus|from|of|the best of|arr\.?|for|für|orchestra|orchester)\b/g;

/**
 * The film's name in an arrangement's title: "Themes from Jurassic Park" → "Jurassic Park",
 * "Der König der Löwen (Medley)" → "Der König der Löwen". Empty when nothing is left.
 */
export function filmQuery(title: string): string {
	const text = title
		.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
		.replace(/["“”„«»]/g, ' ')
		.split(/\s[-–—|/]\s/)[0];
	// Articles stay ("Der König der Löwen"): only the arrangement's words go, and only at the edges.
	const words = text.split(/\s+/).filter(Boolean);
	const noise = (word: string) => new RegExp(`^(?:${NOISE.source})$`).test(searchText(word).replace(/[^a-z.]/g, ''));
	while (words.length && noise(words[0])) words.shift();
	while (words.length && noise(words[words.length - 1])) words.pop();
	return words.join(' ').replace(/[,:;]+$/, '').trim();
}

type Json = Record<string, any>;

/** The file name of an entity's logo (P154), if it has one. */
export function logoFile(entity: Json | undefined): string | undefined {
	const file = entity?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
	return typeof file === 'string' ? file : undefined;
}

/** The item ids of what a film is about (P921), in Wikidata's order. */
export function subjectIds(entity: Json | undefined): string[] {
	return (entity?.claims?.P921 ?? []).map((claim: Json) => claim.mainsnak?.datavalue?.value?.id).filter((id: unknown): id is string => typeof id === 'string');
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

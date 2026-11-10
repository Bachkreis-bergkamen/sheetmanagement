import type { Instrument } from '#lib/config/index.ts';
import { instrumentLabel } from './instrument-label.ts';

/**
 * How the instrument pickers list a long list of instruments: by family, the rare ones of a big
 * family folded away, and a search that puts what is meant first. Without this the 40 small
 * percussion instruments push the strings out of sight, and "b" finds Bongos before Bratsche.
 */

/** Lower case without accents, so "flote" finds "Flöte". */
export const fold = (text: string) =>
	text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '');

/** More rare instruments than this in a family that has usual ones, and they are folded away. */
const UNFOLDED = 4;

/** The words an instrument is found by: its label, its name, its other spellings. */
export function searchWords(name: string, info: Map<string, Instrument>): string[] {
	const instrument = info.get(name);
	return [instrumentLabel(name), name, ...(instrument?.aliases ?? []), ...(instrument?.variants ?? [])].map(fold);
}

/**
 * The instruments matching a search, best first: the label starting with it, then another of its
 * words, then the word anywhere in one; within each, the usual instruments first, else in the
 * configured order. "b" → Bratsche, Bassklarinette … before Bongos; "tri" → Triangel.
 */
export function searchInstruments(names: string[], query: string, info: Map<string, Instrument>, common: Set<string>): string[] {
	const q = fold(query.trim());
	if (!q) return names;
	const rank = (name: string) => {
		const words = searchWords(name, info);
		if (words[0] === q) return 0;
		if (words[0].startsWith(q)) return 1;
		if (words.some((word) => word.startsWith(q) || word.split(/[\s-]+/).some((part) => part.startsWith(q)))) return 2;
		if (words.some((word) => word.includes(q))) return 3;
		return undefined;
	};
	return names
		.map((name, index) => ({ name, index, rank: rank(name) }))
		.filter((hit): hit is { name: string; index: number; rank: number } => hit.rank !== undefined)
		.sort((a, b) => a.rank - b.rank || Number(common.has(b.name)) - Number(common.has(a.name)) || a.index - b.index)
		.map((hit) => hit.name);
}

/**
 * A family's instruments split into those shown and those behind "N more": the rare ones are
 * folded only when the family has usual ones and more than a few rare ones (the percussion);
 * a chosen one is always shown.
 */
export function foldFamily(names: string[], common: Set<string>, chosen: (name: string) => boolean): { shown: string[]; folded: string[] } {
	const rare = names.filter((name) => !common.has(name) && !chosen(name));
	if (rare.length <= UNFOLDED || rare.length === names.length) return { shown: names, folded: [] };
	return { shown: names.filter((name) => !rare.includes(name)), folded: rare };
}

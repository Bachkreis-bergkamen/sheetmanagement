import { config } from '#lib/config/index.ts';
import { instrumentLabel } from './instrument-label.ts';
import { searchText } from './text.ts';
import type { Part } from './types.ts';

/**
 * The archive's search also finds pieces by their parts and notes: "Bariton" lists the pieces
 * with a baritone part, "Goldfinger" the medley whose notes name it. Title, composer and the
 * like still come first; parts and notes only fill in the words those don't have.
 */

/** A piece as the list searches it. `instruments` are the config's names, `notes` as written. */
export interface SearchablePiece {
	search: string;
	instruments: string[];
	notes: string[];
}

/** Why a piece was found, when it wasn't by its title: the instruments and a bit of the note. */
export interface FoundBy {
	instruments: string[];
	note?: string;
}

/** The instruments that have a part in the piece, each once, in the piece's order. */
export const partInstruments = (parts: Pick<Part, 'instruments'>[]) => [...new Set(parts.flatMap((part) => part.instruments))];

// An instrument's label, file-name word and spellings: "Bariton" also as "Baritone" and "Euphonium".
const built = new WeakMap<object, Map<string, string>>();
function instrumentText(name: string): string {
	let map = built.get(config.instruments);
	if (!map) {
		map = new Map(config.instruments.map((instrument) => [instrument.name, searchText(instrumentLabel(instrument.name), instrument.name, ...(instrument.aliases ?? []))]));
		built.set(config.instruments, map);
	}
	return map.get(name) ?? searchText(name);
}

/**
 * Whether every word is in the piece's title fields, its instruments or its notes. Null: not
 * found; `{ instruments: [] }` without a note: found by the title alone, nothing to explain.
 * `words` come from `searchText`, like `piece.search`.
 */
export function findPiece(piece: SearchablePiece, words: string[]): FoundBy | null {
	const instruments = new Set<string>();
	let note: string | undefined;
	for (const word of words) {
		if (piece.search.includes(word)) continue;
		const byPart = piece.instruments.filter((name) => instrumentText(name).includes(word));
		if (byPart.length) {
			for (const name of byPart) instruments.add(instrumentLabel(name));
			continue;
		}
		const text = piece.notes.find((text) => searchText(text).includes(word));
		if (text === undefined) return null;
		note ??= excerpt(text, word);
	}
	return { instruments: [...instruments], ...(note ? { note } : {}) };
}

/** The part of a note around a word, so a long list of titles still shows the one searched for. */
export function excerpt(text: string, word: string, room = 30): string {
	// The search text letter by letter, with where each letter came from ("ß" gives two).
	let plain = '';
	const from: number[] = [];
	for (let i = 0; i < text.length; i++) {
		for (const letter of searchText(text[i])) {
			plain += letter;
			from.push(i);
		}
	}
	const at = plain.indexOf(word);
	if (at < 0) return text;
	let start = Math.max(0, from[at] - room);
	let end = Math.min(text.length, from[at + word.length - 1] + 1 + room);
	// Whole words at both ends.
	if (start > 0 && text[start - 1] !== ' ') {
		const space = text.indexOf(' ', start);
		if (space >= 0 && space < from[at]) start = space + 1;
	}
	if (end < text.length) end = text.lastIndexOf(' ', end) > from[at] ? text.lastIndexOf(' ', end) : end;
	return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

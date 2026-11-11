import { profile, type ProfileId } from './instruments.ts';
import { diatonic, LANDMARK, midiOf, pitchAt, type Clef, type Pitch } from './theory.ts';

/**
 * The drills' items and their questions (#300, #315). An item is a string id, so its progress
 * can be kept as a plain record on the device:
 * - "notes:treble:2": name the note on the treble clef's second line;
 * - "keys:-3:minor": name the minor key with three flats;
 * - "play:violin:treble:2": play that note on the violin.
 * Note reading is per clef (reading treble clef is the same skill on any instrument), playing
 * per instrument.
 */

export type DrillKind = 'notes' | 'keys' | 'play';
export const DRILL_KINDS: readonly DrillKind[] = ['notes', 'keys', 'play'];

/** Answers up to this fast count as fluent: the item moves up and can be mastered. */
export const FLUENT_MS: Record<DrillKind, number> = { notes: 2500, keys: 5000, play: 4000 };

/** Questions per round: a few minutes, short enough to fit anywhere. */
export const ROUND = 20;

/** How far above and below the staff note reading goes: three ledger lines. */
const LOWEST = -6;
const HIGHEST = 14;

const outside = (position: number) => (position < 0 ? -position : position > 8 ? position - 8 : 0);

/**
 * The staff positions to learn, in the order they come in: on the staff first, outwards from the
 * clef's landmark note, then the ledger lines, nearest first. Within `range` (written, diatonic)
 * when given.
 */
export function noteOrder(clef: Clef, range?: [number, number]): number[] {
	const positions: number[] = [];
	for (let position = LOWEST; position <= HIGHEST; position++) {
		const written = diatonic(pitchAt(clef, position));
		if (range && (written < range[0] || written > range[1])) continue;
		positions.push(position);
	}
	const landmark = LANDMARK[clef];
	return positions.sort((a, b) => outside(a) - outside(b) || Math.abs(a - landmark) - Math.abs(b - landmark) || a - b);
}

export const noteId = (clef: Clef, position: number) => `notes:${clef}:${position}`;
export const playId = (instrument: ProfileId, clef: Clef, position: number) => `play:${instrument}:${clef}:${position}`;
export const keyId = (fifths: number, mode: 'major' | 'minor') => `keys:${fifths}:${mode}`;

/**
 * Keys in the order they come in: round the circle of fifths outwards, sharps and flats in turn,
 * each group of majors before its minors (the minor is learnt from the major it shares its
 * signature with).
 */
export const KEY_ORDER: string[] = (() => {
	const ring = (from: number, to: number) => {
		const fifths: number[] = [];
		for (let count = from; count <= to; count++) fifths.push(...(count ? [count, -count] : [0]));
		return fifths;
	};
	return [
		[0, 2],
		[3, 4],
		[5, 7]
	].flatMap(([from, to]) => [...ring(from, to).map((fifths) => keyId(fifths, 'major')), ...ring(from, to).map((fifths) => keyId(fifths, 'minor'))]);
})();

export const notesOrder = (clef: Clef) => noteOrder(clef).map((position) => noteId(clef, position));

export function playOrder(instrument: ProfileId, clef: Clef): string[] {
	const range = profile(instrument).range[clef];
	return range ? noteOrder(clef, range).map((position) => playId(instrument, clef, position)) : [];
}

/** Several drills' items in turn, so a mixed round interleaves them. */
export function interleave(...orders: string[][]): string[] {
	const mixed: string[] = [];
	for (let i = 0; i < Math.max(0, ...orders.map((order) => order.length)); i++) for (const order of orders) if (i < order.length) mixed.push(order[i]);
	return mixed;
}

export type Question =
	| { kind: 'notes'; id: string; clef: Clef; pitch: Pitch }
	| { kind: 'keys'; id: string; clef: Clef; fifths: number; mode: 'major' | 'minor'; options: number[] }
	| { kind: 'play'; id: string; clef: Clef; pitch: Pitch; instrument: ProfileId; midi: number };

const shuffle = <T>(values: T[], random: () => number) => {
	const copy = [...values];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};

/**
 * Four keys to choose from: the right one, its neighbours on the circle (one accidental more or
 * less) and its mirror (as many flats as it has sharps), the usual mix-ups, else others nearby.
 */
export function keyOptions(fifths: number, random: () => number = Math.random): number[] {
	const options = new Set([fifths]);
	for (const other of [fifths + 1, fifths - 1, -fifths, fifths + 2, fifths - 2, fifths + 3, fifths - 3]) {
		if (options.size >= 4) break;
		if (other >= -7 && other <= 7) options.add(other);
	}
	return shuffle([...options], random);
}

/** The question for an item; `clef` is the one key signatures are shown in. */
export function questionFor(id: string, clef: Clef, random: () => number = Math.random): Question | null {
	const parts = id.split(':');
	if (parts[0] === 'notes' && parts.length === 3) {
		return { kind: 'notes', id, clef: parts[1] as Clef, pitch: pitchAt(parts[1] as Clef, Number(parts[2])) };
	}
	if (parts[0] === 'keys' && parts.length === 3) {
		const fifths = Number(parts[1]);
		return { kind: 'keys', id, clef, fifths, mode: parts[2] === 'minor' ? 'minor' : 'major', options: keyOptions(fifths, random) };
	}
	if (parts[0] === 'play' && parts.length === 4) {
		const instrument = parts[1] as ProfileId;
		const pitch = pitchAt(parts[2] as Clef, Number(parts[3]));
		return { kind: 'play', id, clef: parts[2] as Clef, pitch, instrument, midi: midiOf(pitch) + profile(instrument).transposition };
	}
	return null;
}

export const kindOf = (id: string) => id.split(':')[0] as DrillKind;

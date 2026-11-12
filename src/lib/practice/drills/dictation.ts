import { alterInKey, diatonic, fromDiatonic, pitchAt, tonic, type Clef, type Pitch } from './theory.ts';

/**
 * Melodic dictation (#315, "Hördiktate"): a short melody is heard, and the member picks which of
 * three written ones it was. The others differ in one note, so the ear has to follow the line,
 * not just the first note. Short and stepwise first, then longer with leaps; keys with no or one
 * accidental, so it's about hearing, not reading. Generated on the device, new every time.
 *
 * Item ids: "dict:3:step" three notes in steps, "dict:5:leap" five notes with leaps.
 */

export const DICTATION_ORDER = ['dict:3:step', 'dict:4:step', 'dict:4:leap', 'dict:5:leap'];

export interface Dictation {
	fifths: number;
	/** The three melodies to choose from. */
	options: Pitch[][];
	/** Which of them was played. */
	answer: number;
}

const mod = (value: number, by: number) => ((value % by) + by) % by;

/** Scale degrees, starting on the tonic: steps, or with a third or a fourth now and then. */
function walk(length: number, leaps: boolean, random: () => number): number[] {
	const degrees = [0];
	while (degrees.length < length) {
		const last = degrees[degrees.length - 1];
		const size = leaps && random() < 0.45 ? (random() < 0.6 ? 2 : 3) : 1;
		let next = last + (random() < 0.5 ? size : -size);
		// Within a sixth below and an octave above the tonic, so it stays on and near the staff.
		if (next < -2 || next > 7) next = last + (next < -2 ? size : -size);
		degrees.push(next);
	}
	return degrees;
}

export function dictationOf(id: string, clef: Clef, random: () => number = Math.random): Dictation | null {
	const [kind, rawLength, motion, ...rest] = id.split(':');
	const length = Number(rawLength);
	if (kind !== 'dict' || rest.length || !Number.isInteger(length) || length < 3 || length > 6 || (motion !== 'step' && motion !== 'leap')) return null;
	const fifths = [0, 1, -1][Math.floor(random() * 3)];
	const key = tonic(fifths, 'major');
	// The tonic on the lower half of the staff.
	const bottom = diatonic(pitchAt(clef, 0));
	let base = Math.floor(bottom / 7) * 7 + key.step;
	while (base - bottom < 0) base += 7;
	if (base - bottom > 4) base -= 7;
	const pitchOf = (degree: number) => fromDiatonic(base + degree, alterInKey(mod(base + degree, 7), fifths));
	const played = walk(length, motion === 'leap', random);
	// Two others, each one note (not the first) a step away from the melody and from each other.
	const variants: number[][] = [played];
	for (let tries = 0; variants.length < 3 && tries < 50; tries++) {
		const at = 1 + Math.floor(random() * (length - 1));
		const other = [...played];
		other[at] += random() < 0.5 ? 1 : -1;
		if (other[at] < -2 || other[at] > 7) continue;
		if (!variants.some((each) => each.every((degree, i) => degree === other[i]))) variants.push(other);
	}
	if (variants.length < 3) return null;
	// Shuffled, so the melody played isn't always in the same place.
	const order = [0, 1, 2];
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	return { fifths, options: order.map((i) => variants[i].map(pitchOf)), answer: order.indexOf(0) };
}

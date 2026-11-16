import { playId } from './decks.ts';
import { profile, span, type ProfileId } from './instruments.ts';
import type { States } from './scheduler.ts';
import { diatonic, fromDiatonic, midiOf, pitchAt, staffPosition, type Clef } from './theory.ts';

/**
 * The player's own range on an instrument: what they reach, not what the instrument does. On the
 * trumpet above all it takes years to build: an experienced old hand hits the high E, a beginner
 * not the C above the staff. A short test sets it at the start (the lowest and highest note they
 * play securely); then, now and then, the note just beyond it is tried in the "play the note"
 * drill. Played: it's theirs from now on. Not yet: a kind word, and another try in a few days,
 * the wait a little longer each time it doesn't come.
 * Written notes, as diatonic indices like the instruments' ranges.
 */

/** When an edge note was last tried and didn't come, and how many times in a row. */
export interface Tried {
	day: number;
	fails: number;
}

export interface Reach {
	low: number;
	high: number;
	tried?: { high?: Tried; low?: Tried };
}

export type Side = 'high' | 'low';

/** Narrower than a fifth, a melody or a scale can't be placed in it. */
export const NARROWEST = 4;

/** How far above and below a staff its notes are shown: three ledger lines, as in the drills. */
const LOWEST = -6;
const HIGHEST = 14;

/**
 * How far a range may go on the instrument: an experienced player's, and only as far as its
 * staves show without an octave sign.
 */
export function limits(instrument: ProfileId): [number, number] {
	const { clefs, extreme } = profile(instrument, false);
	const bottom = Math.min(...clefs.map((clef) => diatonic(pitchAt(clef, LOWEST))));
	const top = Math.max(...clefs.map((clef) => diatonic(pitchAt(clef, HIGHEST))));
	return [Math.max(extreme[0], bottom), Math.min(extreme[1], top)];
}

/** The comfortable range: where a player starts who hasn't said otherwise. */
export const comfortable = (instrument: ProfileId): [number, number] => {
	const [low, high] = span(profile(instrument, false).range);
	const [bottom, top] = limits(instrument);
	return [Math.max(low, bottom), Math.min(high, top)];
};

/** Whether there's more to the instrument than the comfortable range: worth a test, worth trying. */
export function canGrow(instrument: ProfileId): boolean {
	const [low, high] = comfortable(instrument);
	const [bottom, top] = limits(instrument);
	return bottom < low || top > high;
}

/** A range within the instrument's limits and at least a fifth wide; the tries kept. */
export function makeReach(instrument: ProfileId, low: number, high: number, tried?: Reach['tried']): Reach {
	const [bottom, top] = limits(instrument);
	let lo = Math.min(Math.max(low, bottom), top);
	let hi = Math.max(Math.min(high, top), bottom);
	if (hi < lo) [lo, hi] = [hi, lo];
	// Too narrow: wider upwards, or downwards where the top is reached.
	while (hi - lo < NARROWEST && (hi < top || lo > bottom)) {
		if (hi < top) hi++;
		else lo--;
	}
	return { low: lo, high: hi, ...(tried && (tried.high || tried.low) ? { tried } : {}) };
}

/** Semitones of the natural notes above C, to find a heard note's letter. */
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/**
 * A sounding note heard in the test, as a written diatonic index. The lowest note rounds up to a
 * natural and the highest down, so an F♯ heard as the top doesn't put G in the range, and an F♯ at
 * the bottom doesn't put F in it.
 */
export function writtenStep(instrument: ProfileId, soundingMidi: number, side: Side): number {
	const written = soundingMidi - profile(instrument, false).transposition;
	const octave = Math.floor(written / 12) - 1;
	const semitone = ((written % 12) + 12) % 12;
	const below = NATURAL.filter((natural) => natural <= semitone).length - 1;
	const exact = NATURAL[below] === semitone;
	const step = octave * 7 + below;
	return exact || side === 'high' ? step : step + 1;
}

/** The written note at a diatonic index, natural: for the staff and the note's name. */
export const noteAt = (step: number) => fromDiatonic(step);

/** Days to wait after a try that didn't come: two, then three, up to a week. */
export const waitAfter = (fails: number) => Math.min(7, fails + 1);

/**
 * The note to try in a round of "play the note", if one is due: the one just above the range
 * (or below it), once its edge note is played securely (twice right, and on its way to being
 * known), and not tried in vain too recently. In one of `clefs` where it's on the drill's staff,
 * the edge's own clef first. The top first: that's where a range is built.
 */
export function nextTry(instrument: ProfileId, reach: Reach, clefs: Clef[], states: States, day: number): { id: string; side: Side; step: number } | null {
	const [bottom, top] = limits(instrument);
	const onStaff = (clef: Clef, step: number) => {
		const position = staffPosition(clef, noteAt(step));
		return position >= LOWEST && position <= HIGHEST ? position : null;
	};
	const sides: Side[] = (reach.tried?.low?.day ?? -Infinity) < (reach.tried?.high?.day ?? -Infinity) ? ['low', 'high'] : ['high', 'low'];
	for (const side of sides) {
		const edge = side === 'high' ? reach.high : reach.low;
		const step = side === 'high' ? edge + 1 : edge - 1;
		if (step > top || step < bottom) continue;
		const tried = reach.tried?.[side];
		if (tried && day < tried.day + waitAfter(tried.fails)) continue;
		const secure = clefs.filter((clef) => {
			const position = onStaff(clef, edge);
			const state = position === null ? undefined : states[playId(instrument, clef, position)];
			return !!state && state.box >= 2 && state.right >= 2;
		});
		const clef = [...secure, ...clefs].find((each) => onStaff(each, step) !== null);
		if (!secure.length || !clef) continue;
		return { id: playId(instrument, clef, onStaff(clef, step)!), side, step };
	}
	return null;
}

/** The range after a try: one note wider when it came, else the miss noted for the wait. */
export function afterTry(instrument: ProfileId, reach: Reach, side: Side, reached: boolean, day: number): Reach {
	const tried = { ...reach.tried };
	if (reached) {
		delete tried[side];
		return makeReach(instrument, side === 'low' ? reach.low - 1 : reach.low, side === 'high' ? reach.high + 1 : reach.high, tried);
	}
	tried[side] = { day, fails: (reach.tried?.[side]?.fails ?? 0) + 1 };
	return { ...reach, tried };
}

/** A range read back from storage; null when it isn't one. */
export function readReach(instrument: ProfileId, value: unknown): Reach | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Partial<Reach>;
	if (!Number.isInteger(raw.low) || !Number.isInteger(raw.high)) return null;
	const tried: Reach['tried'] = {};
	for (const side of ['high', 'low'] as const) {
		const each = raw.tried?.[side];
		if (each && Number.isInteger(each.day) && Number.isInteger(each.fails) && each.fails > 0) tried[side] = { day: each.day, fails: each.fails };
	}
	return makeReach(instrument, raw.low!, raw.high!, tried);
}

/** The sounding MIDI note of a written step on the instrument: what the microphone hears. */
export const soundingMidi = (instrument: ProfileId, step: number) => midiOf(noteAt(step)) + profile(instrument, false).transposition;

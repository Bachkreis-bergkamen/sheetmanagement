import { profile, type ProfileId } from './instruments.ts';
import { align, type PlayedNote } from './scales.ts';
import { alterInKey, diatonic, fromDiatonic, midiOf, tonic, type Clef, type Pitch } from './theory.ts';

/**
 * Sight-reading (#315, phase 3): short melodies made up on the device, new every time, read
 * once and played through after a count-in without stopping. What makes a good sight-reader is
 * a lot of new material near the edge of what one can do, so there are no items to repeat here,
 * only a level that follows the player (about 85 % right keeps it where it is).
 *
 * A melody is a weighted walk over the key's scale degrees: mostly steps, leaps as the level
 * allows and followed by a step back, a half cadence at the end of the first phrase and a step
 * into the tonic at the end. Rhythms are put together from one-bar cells of the level. No note
 * is repeated straight after itself: a repeated note can't be told from a held one by the
 * microphone.
 */

export interface SightNote {
	/** Start, in sixteenths from the beginning. */
	at: number;
	/** Length in sixteenths. */
	len: number;
	rest: boolean;
	/** Written pitch; none for a rest. */
	pitch?: Pitch;
}

export interface Melody {
	fifths: number;
	mode: 'major' | 'minor';
	/** Quarter beats per bar: 3 or 4. */
	meter: 3 | 4;
	bars: number;
	bpm: number;
	clef: Clef;
	notes: SightNote[];
}

export const MAX_LEVEL = 8;

interface LevelRules {
	bars: number[];
	/** Most sharps or flats in the key. */
	fifths: number;
	minor: boolean;
	meters: (3 | 4)[];
	/** Largest step between two notes, in scale steps (1 a second, 4 a fifth, 7 an octave). */
	leap: number;
	/** Scale steps around the tonic the melody may use. */
	span: [number, number];
	bpm: number;
	/** A note now and then raised by a semitone on its way up to the next. */
	chromatic: boolean;
}

const LEVELS: LevelRules[] = [
	{ bars: [2], fifths: 0, minor: false, meters: [4], leap: 1, span: [0, 4], bpm: 60, chromatic: false },
	{ bars: [4], fifths: 1, minor: false, meters: [4], leap: 2, span: [0, 7], bpm: 66, chromatic: false },
	{ bars: [4], fifths: 1, minor: false, meters: [4, 4, 3], leap: 2, span: [0, 7], bpm: 66, chromatic: false },
	{ bars: [4], fifths: 2, minor: false, meters: [4, 4, 3], leap: 4, span: [-3, 7], bpm: 72, chromatic: false },
	{ bars: [4], fifths: 3, minor: false, meters: [4, 3], leap: 7, span: [-3, 9], bpm: 72, chromatic: false },
	{ bars: [4], fifths: 3, minor: true, meters: [4, 3], leap: 7, span: [-4, 11], bpm: 76, chromatic: false },
	{ bars: [4, 8], fifths: 4, minor: true, meters: [4, 3], leap: 7, span: [-4, 11], bpm: 80, chromatic: true },
	{ bars: [8], fifths: 5, minor: true, meters: [4, 3], leap: 7, span: [-4, 11], bpm: 84, chromatic: true }
];

export const rulesFor = (level: number) => LEVELS[Math.min(MAX_LEVEL, Math.max(1, Math.round(level))) - 1];

/**
 * One-bar rhythms in sixteenths ("r4" a quarter rest), with the level they come in at. Each level
 * adds one thing: halves and quarters, whole notes, eighths, rests and dotted halves, dotted
 * quarters, sixteenths.
 */
const CELLS: Record<3 | 4, [number, string][]> = {
	4: [
		[1, '4 4 4 4'],
		[1, '8 4 4'],
		[1, '4 4 8'],
		[1, '4 8 4'],
		[2, '8 8'],
		[3, '2 2 4 4 4'],
		[3, '4 4 2 2 4'],
		[3, '4 2 2 8'],
		[3, '2 2 2 2 4 4'],
		[4, '12 4'],
		[4, '4 r4 4 4'],
		[4, '8 r4 4'],
		[5, '6 2 4 4'],
		[5, '4 4 6 2'],
		[5, '6 2 8'],
		[6, '1 1 2 4 4 4'],
		[6, '4 4 2 1 1 4'],
		[6, '2 2 1 1 2 8']
	],
	3: [
		[1, '4 4 4'],
		[1, '8 4'],
		[1, '4 8'],
		[3, '2 2 4 4'],
		[3, '4 2 2 4'],
		[4, '4 r4 4'],
		[5, '6 2 4'],
		[6, '1 1 2 4 4']
	]
};
/** The last bar: a long note on the tonic. */
const ENDINGS: Record<3 | 4, [number, string][]> = {
	4: [
		[1, '4 4 8'],
		[2, '16'],
		[3, '4 4 8'],
		[3, '2 2 4 8']
	],
	3: [
		[1, '4 8'],
		[4, '12'],
		[4, '4 8']
	]
};

/** A small seeded random source (mulberry32), so a melody can be made again from its seed. */
export function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = <T>(values: T[], random: () => number) => values[Math.floor(random() * values.length)];

function weighted<T>(options: [T, number][], random: () => number): T {
	const total = options.reduce((sum, [, weight]) => sum + weight, 0);
	let roll = random() * total;
	for (const [value, weight] of options) if ((roll -= weight) <= 0) return value;
	return options[options.length - 1][0];
}

const cell = (text: string) =>
	text.split(' ').map((token) => ({ len: Number(token.replace('r', '')), rest: token.startsWith('r') }));

/** How likely a move of so many scale steps is: steps by far, then thirds, then fifths and octaves. */
const MOVE_WEIGHT: Record<number, number> = { 1: 6, 2: 3, 3: 1, 4: 1.3, 5: 0.5, 6: 0.2, 7: 0.6 };

const mod = (value: number, by: number) => ((value % by) + by) % by;

/**
 * The octave of the tonic that puts the level's span inside the instrument's comfortable range,
 * as low as it goes; the span narrowed when it doesn't fit (a narrow range at a high level).
 */
function placeSpan(instrument: ProfileId, clef: Clef, tonicStep: number, span: [number, number]): { base: number; span: [number, number] } | null {
	const range = profile(instrument).range[clef];
	if (!range) return null;
	for (let [low, high] = span; high - low >= 4; low < -2 ? low++ : high--) {
		for (let octave = 0; octave <= 8; octave++) {
			const base = octave * 7 + tonicStep;
			if (base + low >= range[0] && base + high <= range[1]) return { base, span: [low, high] };
		}
	}
	return null;
}

/** A new melody for the instrument in `clef` at `level`. Null if the instrument can't read it there. */
export function makeMelody(instrument: ProfileId, clef: Clef, level: number, random: () => number = Math.random): Melody | null {
	const rules = rulesFor(level);
	const mode: 'major' | 'minor' = rules.minor && random() < 0.35 ? 'minor' : 'major';
	const keys: number[] = [];
	for (let fifths = -rules.fifths; fifths <= rules.fifths; fifths++) keys.push(fifths || 0);
	const fifths = pick(keys, random);
	const key = tonic(fifths, mode);
	const placed = placeSpan(instrument, clef, key.step, rules.span);
	if (!placed) return null;
	const { base } = placed;
	const [low, high] = placed.span;
	const meter = pick(rules.meters, random);
	const bars = pick(rules.bars, random);
	const cells = CELLS[meter].filter(([at]) => at <= Math.round(level)).map(([, text]) => text);
	const endings = ENDINGS[meter].filter(([at]) => at <= Math.round(level)).map(([, text]) => text);

	// The rhythm, bar by bar; the last bar a long note to end on.
	const rhythm: { len: number; rest: boolean; at: number; bar: number }[] = [];
	for (let bar = 0; bar < bars; bar++) {
		let at = bar * meter * 4;
		for (const each of cell(pick(bar === bars - 1 ? endings : cells, random))) {
			rhythm.push({ ...each, at, bar });
			at += each.len;
		}
	}
	const sounding = rhythm.filter((note) => !note.rest);
	const count = sounding.length;
	// The first phrase ends on the last note of its last bar: a half cadence, on 2, 5 or 7.
	const phraseEnd = bars >= 4 ? sounding.findLastIndex((note) => note.bar === bars / 2 - 1) : -1;

	// Degrees from the tonic: start on 1, 3 or 5, walk, step into the tonic.
	const finals = [0, 7, -7].filter((degree) => degree >= low && degree <= high);
	const degrees: number[] = [];
	let previousMove = 0;
	for (let i = 0; i < count; i++) {
		if (i === 0) {
			degrees.push(weighted<number>([[0, 3], ...([2, 4].filter((degree) => degree <= high).map((degree) => [degree, 1]) as [number, number][])], random));
			continue;
		}
		const current = degrees[i - 1];
		if (i === count - 1) {
			// Home: the tonic nearest, which the note before steps into.
			degrees.push(finals.reduce((best, degree) => (Math.abs(degree - current) < Math.abs(best - current) ? degree : best)));
			continue;
		}
		if (i === count - 2) {
			// The step before the tonic: from above (2) or below (7), whichever is nearer.
			const home = finals.reduce((best, degree) => (Math.abs(degree - current) < Math.abs(best - current) ? degree : best));
			const fits = (degree: number) => degree >= low && degree <= high && degree !== current;
			const steps = [home + 1, home - 1].filter(fits);
			// No step that isn't the note just played: a third will do.
			const approach = steps.length ? steps : [home + 2, home - 2, home + 4].filter(fits);
			degrees.push(approach.reduce((best, degree) => (Math.abs(degree - current) < Math.abs(best - current) ? degree : best)));
			continue;
		}
		const options: [number, number][] = [];
		for (let move = -rules.leap; move <= rules.leap; move++) {
			const next = current + move;
			if (!move || next < low || next > high) continue;
			let weight = MOVE_WEIGHT[Math.abs(move)] ?? 0;
			// After a leap, a step back the other way.
			if (Math.abs(previousMove) >= 3) weight *= Math.sign(move) !== Math.sign(previousMove) && Math.abs(move) <= 2 ? 4 : 0.15;
			// Minor: no augmented second between the sixth and the raised seventh; the seventh leads up.
			if (mode === 'minor') {
				const from = mod(current, 7);
				const to = mod(next, 7);
				if ((from === 5 && to === 6) || (from === 6 && to === 5)) weight = 0;
				if (from === 6 && move !== 1) weight *= 0.05;
			}
			if (i === phraseEnd && ![1, 4, 6].includes(mod(next, 7))) weight *= 0.1;
			// Near the end, towards home, so the last notes can step into the tonic.
			if (i >= count - 4) weight /= (1 + Math.min(...finals.map((degree) => Math.abs(next - degree)))) ** 2;
			// A gentle pull towards the middle of the span.
			weight *= 1 / (1 + Math.abs(next - (low + high) / 2) / 6);
			if (weight > 0) options.push([next, weight]);
		}
		const next = options.length ? weighted(options, random) : current + (current < high ? 1 : -1);
		previousMove = next - current;
		degrees.push(next);
	}

	const notes: SightNote[] = [];
	let n = 0;
	for (const { at, len, rest } of rhythm) {
		if (rest) {
			notes.push({ at, len, rest });
			continue;
		}
		const degree = degrees[n];
		const index = base + degree;
		const step = mod(index, 7);
		let alter = alterInKey(step, fifths);
		// Harmonic minor's raised seventh.
		if (mode === 'minor' && mod(degree, 7) === 6) alter += 1;
		// Now and then a chromatic lead into the next note a whole tone above.
		const next = degrees[n + 1];
		if (rules.chromatic && next === degree + 1 && n > 0 && random() < 0.15) {
			const here = midiOf(fromDiatonic(index, alter));
			const there = midiOf(fromDiatonic(index + 1, alterInKey(mod(index + 1, 7), fifths)));
			if (there - here === 2) alter += 1;
		}
		notes.push({ at, len, rest, pitch: fromDiatonic(index, alter) });
		n++;
	}
	return { fifths, mode, meter, bars, bpm: rules.bpm, clef, notes };
}

export const beatMs = (bpm: number) => 60_000 / bpm;

/** The notes to play, as sounding MIDI notes and when they start (ms after the first beat). */
export function expectedNotes(melody: Melody, transposition: number): { midi: number; onset: number }[] {
	const sixteenth = beatMs(melody.bpm) / 4;
	return melody.notes.filter((note) => note.pitch).map((note) => ({ midi: midiOf(note.pitch!) + transposition, onset: note.at * sixteenth }));
}

/** The melody's lowest and highest notes, for the look before playing. */
export function compass(melody: Melody): { low: Pitch; high: Pitch } {
	const pitches = melody.notes.flatMap((note) => (note.pitch ? [note.pitch] : []));
	const by = (pitch: Pitch) => diatonic(pitch) * 10 + pitch.alter;
	return {
		low: pitches.reduce((best, pitch) => (by(pitch) < by(best) ? pitch : best)),
		high: pitches.reduce((best, pitch) => (by(pitch) > by(best) ? pitch : best))
	};
}

/**
 * What to look out for before playing, as the prep phase prompts it: the bar with the shortest
 * notes, accidentals outside the key, the widest leap. Bars counted from 1.
 */
export function lookOut(melody: Melody): { shortest?: { len: number; bar: number }; accidental?: number; leap?: { steps: number; bar: number } } {
	const barOf = (at: number) => Math.floor(at / (melody.meter * 4)) + 1;
	const sounding = melody.notes.filter((note) => note.pitch);
	const result: ReturnType<typeof lookOut> = {};
	const shortest = sounding.reduce((best, note) => (note.len < best.len ? note : best));
	if (shortest.len < 4) result.shortest = { len: shortest.len, bar: barOf(shortest.at) };
	const odd = sounding.find((note) => note.pitch!.alter !== alterInKey(note.pitch!.step, melody.fifths));
	if (odd) result.accidental = barOf(odd.at);
	for (let i = 1; i < sounding.length; i++) {
		const steps = Math.abs(diatonic(sounding[i].pitch!) - diatonic(sounding[i - 1].pitch!));
		if (steps >= 4 && (!result.leap || steps > result.leap.steps)) result.leap = { steps, bar: barOf(sounding[i].at) };
	}
	return result;
}

export type SightMark =
	| { state: 'right'; cents: number; timing: 'ok' | 'early' | 'late' }
	| { state: 'wrong'; midi: number }
	| { state: 'missed' };

export interface SightVerdict {
	marks: SightMark[];
	/** Notes with the right pitch, and of those in time. */
	right: number;
	inTime: number;
	total: number;
	/** Played on to the end, without stopping before it. */
	keptGoing: boolean;
	/** 0 to 1: half the notes' pitch, half their timing. */
	score: number;
}

/**
 * A take against the melody. Pitches are lined up as for scales, so a slip costs only that note.
 * For timing, the player's own delay (the microphone's, and how long a note takes to speak) is
 * the median of all the right notes' deviations; a note is in time within a third of a beat of
 * that, at least 120 ms.
 */
export function judgeSight(expected: { midi: number; onset: number }[], played: PlayedNote[], start: number, bpm: number): SightVerdict {
	const { marks } = align(
		expected.map((note) => note.midi),
		played
	);
	const deviations: number[] = [];
	marks.forEach((mark, i) => {
		if (mark.state === 'right') deviations.push(mark.onset - start - expected[i].onset);
	});
	const sorted = [...deviations].sort((a, b) => a - b);
	const delay = sorted.length ? sorted[sorted.length >> 1] : 0;
	const tolerance = Math.max(120, beatMs(bpm) / 3);
	let right = 0;
	let inTime = 0;
	const judged: SightMark[] = marks.map((mark, i) => {
		if (mark.state === 'missed') return { state: 'missed' };
		if (mark.state === 'wrong') return { state: 'wrong', midi: mark.midi };
		right++;
		const off = mark.onset - start - expected[i].onset - delay;
		const timing = Math.abs(off) <= tolerance ? 'ok' : off < 0 ? 'early' : 'late';
		if (timing === 'ok') inTime++;
		return { state: 'right', cents: mark.cents, timing };
	});
	const total = expected.length;
	const lastPlayed = judged.findLastIndex((mark) => mark.state !== 'missed');
	return { marks: judged, right, inTime, total, keptGoing: lastPlayed >= total - 2, score: total ? (right + inTime) / (2 * total) : 0 };
}

export interface SightLevel {
	level: number;
	/** Good takes in a row, and poor ones. */
	good: number;
	poor: number;
}

export const firstLevel = (): SightLevel => ({ level: 1, good: 0, poor: 0 });

/** Score from which a take counts as good, and below which as poor. */
export const GOOD = 0.9;
export const POOR = 0.6;

/**
 * The level after a take: two good takes in a row move it up, two poor ones down, so it stays
 * where most of a melody comes out right (around 85 %), and one bad day doesn't undo a level.
 */
export function nextLevel(state: SightLevel, score: number): SightLevel & { change: -1 | 0 | 1 } {
	const good = score >= GOOD ? state.good + 1 : 0;
	const poor = score < POOR ? state.poor + 1 : 0;
	if (good >= 2 && state.level < MAX_LEVEL) return { level: state.level + 1, good: 0, poor: 0, change: 1 };
	if (poor >= 2 && state.level > 1) return { level: state.level - 1, good: 0, poor: 0, change: -1 };
	return { level: state.level, good, poor, change: 0 };
}

/** Excerpts in a round: a few minutes of new music. */
export const SIGHT_ROUND = 5;

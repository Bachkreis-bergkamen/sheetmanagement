import { profile, type PartKey, type ProfileId } from './instruments.ts';
import type { DrillMeter } from './meters.ts';
import { meterOf, parsePattern, patternOf, pulseOf, type RhythmEvent } from './rhythm.ts';
import { scaleItem, type ScaleItem } from './scales.ts';
import { dictationOf, DICTATION_ORDER } from './dictation.ts';
import { tuneQuestion, type TuneQuestion } from './together.ts';
import { diatonic, fromDiatonic, LANDMARK, midiOf, pitchAt, type Clef, type Pitch } from './theory.ts';

/**
 * The drills' items and their questions (#300, #315). An item is a string id, so its progress
 * can be kept as a plain record on the device:
 * - "notes:treble:2": name the note on the treble clef's second line;
 * - "keys:-3:minor": name the minor key with three flats;
 * - "play:violin:treble:2": play that note on the violin;
 * - "ear:7:melodic": name a fifth heard one note after the other;
 * - "chord:minor": name a triad's quality, heard broken and then together;
 * - "dict:4:step": pick the melody heard among three written ones (see dictation.ts);
 * - "trans:trumpet:2:4": a note in a trumpet part "in D" (+2), on the treble staff's middle line:
 *   which note does a B♭ trumpet play? "trans:trumpet:concert:4": which note sounds?
 * - "rhythm:4-4-r4-4": tap a bar of rhythm back (see rhythm.ts);
 * - "pulse:90:4": keep tapping quarters at 90 through four bars without the metronome;
 * - "scale:violin:1:major": play G major up and down on the violin, "scale:violin:1:major:2"
 *   over two octaves (see scales.ts);
 * - "tune:violin:majorThird": play a major third pure into a held chord (see together.ts).
 * Note reading is per clef (reading treble clef is the same skill on any instrument), playing
 * and transposing per instrument.
 */

export type DrillKind = 'notes' | 'keys' | 'play' | 'ear' | 'chord' | 'dict' | 'trans' | 'rhythm' | 'pulse' | 'scale' | 'tune';
export const DRILL_KINDS: readonly DrillKind[] = ['notes', 'keys', 'play', 'ear', 'chord', 'dict', 'trans', 'rhythm', 'pulse', 'scale', 'tune'];

/**
 * Answers up to this fast count as fluent: the item moves up and can be mastered. For rhythm
 * it's not the time to answer but how far the taps were off on average: a bar takes as long as
 * it takes, and what makes it fluent is being even. For a scale it's the cents off on average:
 * secure means in tune. Tuning into a chord: the cents from pure. Keeping the pulse: the ms
 * off on average while alone.
 */
export const FLUENT_MS: Record<DrillKind, number> = { notes: 2500, keys: 5000, play: 4000, ear: 5000, chord: 5000, dict: 8000, trans: 5000, rhythm: 60, pulse: 45, scale: 15, tune: 8 };

/** Questions per round: a couple of minutes, short enough to fit anywhere. */
export const ROUND = 8;

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

/**
 * Intervals in the order they're learnt: the most different first (octave, fifth, third), the
 * ones easily mixed up with a neighbour later, the tritone last. Heard one after the other before
 * together, as melody is easier to hear apart than harmony.
 */
export const INTERVAL_ORDER = [12, 7, 4, 3, 5, 2, 9, 8, 1, 10, 11, 6];
export const earId = (semitones: number, harmonic: boolean) => `ear:${semitones}:${harmonic ? 'harmonic' : 'melodic'}`;
export const EAR_ORDER: string[] = [
	...INTERVAL_ORDER.slice(0, 6).map((semitones) => earId(semitones, false)),
	...INTERVAL_ORDER.slice(0, 6).map((semitones) => earId(semitones, true)),
	...INTERVAL_ORDER.slice(6).map((semitones) => earId(semitones, false)),
	...INTERVAL_ORDER.slice(6).map((semitones) => earId(semitones, true))
];

/**
 * Chord qualities (#300), heard and named like intervals: major against minor first, the
 * clearest contrast; diminished and augmented once the intervals are well along.
 */
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented';
export const CHORD_QUALITIES: readonly ChordQuality[] = ['major', 'minor', 'diminished', 'augmented'];
/** Semitones of the third and the fifth above the root. */
export const CHORD_SHAPE: Record<ChordQuality, [third: number, fifth: number]> = { major: [4, 7], minor: [3, 7], diminished: [3, 6], augmented: [4, 8] };
export const chordId = (quality: ChordQuality) => `chord:${quality}`;
export const CHORD_ORDER = CHORD_QUALITIES.map(chordId);

/**
 * The hearing drill's items: the easier intervals melodic and harmonic, then major and minor
 * chords and the first short dictations, the harder intervals, then diminished and augmented
 * chords and the longer dictations with leaps.
 */
export const EAR_DECK: string[] = [
	...EAR_ORDER.slice(0, 12),
	...CHORD_ORDER.slice(0, 2),
	...DICTATION_ORDER.slice(0, 2),
	...EAR_ORDER.slice(12),
	...CHORD_ORDER.slice(2),
	...DICTATION_ORDER.slice(2)
];

/** Letters spanned by each interval in semitones: a third spans two, the tritone is an augmented fourth. */
const INTERVAL_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7];

/**
 * Up to four intervals to choose from: the right one and its nearest neighbours in size among
 * those learnt so far (the ones before it in INTERVAL_ORDER), sorted small to large.
 */
export function intervalOptions(semitones: number): number[] {
	const known = INTERVAL_ORDER.slice(0, Math.max(2, INTERVAL_ORDER.indexOf(semitones) + 1));
	const others = known.filter((other) => other !== semitones).sort((a, b) => Math.abs(a - semitones) - Math.abs(b - semitones) || a - b);
	return [semitones, ...others.slice(0, 3)].sort((a, b) => a - b);
}

/** The written notes a transposing drill uses: the treble staff, outwards from G. */
const TRANS_POSITIONS = noteOrder('treble').filter((position) => position >= 0 && position <= 8);
export const transId = (instrument: ProfileId, part: number | 'concert', position: number) =>
	`trans:${instrument}:${part === 'concert' ? part : part >= 0 ? `+${part}` : part}:${position}`;

/**
 * A transposing instrument's items: first which note sounds when it plays a written one, then
 * reading the parts of the family's other keys (a trumpet part in C, in D, …), commonest first.
 */
export function transOrder(instrument: ProfileId): string[] {
	const { transposition, parts = [] } = profile(instrument);
	const keys: (number | 'concert')[] = [...(transposition % 12 ? ['concert' as const] : []), ...parts.map((part) => part.semitones)];
	return keys.flatMap((key) => TRANS_POSITIONS.map((position) => transId(instrument, key, position)));
}

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
	| { kind: 'play'; id: string; clef: Clef; pitch: Pitch; instrument: ProfileId; midi: number }
	| { kind: 'ear'; id: string; clef: Clef; semitones: number; harmonic: boolean; low: Pitch; high: Pitch; options: number[] }
	| { kind: 'chord'; id: string; clef: Clef; quality: ChordQuality; pitches: Pitch[]; options: ChordQuality[] }
	| { kind: 'dict'; id: string; clef: Clef; fifths: number; options: Pitch[][]; answer: number }
	| {
			kind: 'trans';
			id: string;
			clef: Clef;
			pitch: Pitch;
			instrument: ProfileId;
			/** The part's key; null for "which note sounds". */
			part: PartKey | null;
			/** The answer's pitch class: the sounding note, or the note to play. */
			answer: number;
			/** Semitones from the written note to the answer, within an octave, for the hint. */
			shift: number;
	  }
	| { kind: 'rhythm'; id: string; clef: Clef; pattern: string; meter: DrillMeter; events: RhythmEvent[] }
	| { kind: 'pulse'; id: string; clef: Clef; bpm: number; silent: number }
	| { kind: 'scale'; id: string; clef: Clef; item: ScaleItem }
	| { kind: 'tune'; id: string; clef: Clef; tune: TuneQuestion };

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
	if (parts[0] === 'ear' && parts.length === 3) {
		const semitones = Number(parts[1]);
		// The lower note a natural one on the lower half of the staff, so both fit; the upper spelt as the interval.
		const low = pitchAt(clef, Math.floor(random() * 5));
		const upperStep = diatonic(low) + INTERVAL_STEPS[semitones];
		const natural = midiOf(fromDiatonic(upperStep));
		const high = fromDiatonic(upperStep, midiOf(low) + semitones - natural);
		return { kind: 'ear', id, clef, semitones, harmonic: parts[2] === 'harmonic', low, high, options: intervalOptions(semitones) };
	}
	if (parts[0] === 'dict') {
		const dictation = dictationOf(id, clef, random);
		return dictation ? { kind: 'dict', id, clef, ...dictation } : null;
	}
	if (parts[0] === 'chord' && parts.length === 2) {
		const quality = parts[1] as ChordQuality;
		if (!CHORD_QUALITIES.includes(quality)) return null;
		// The root a natural note low on the staff; third and fifth spelt as thirds above it (B D F, C E G♯).
		const root = pitchAt(clef, Math.floor(random() * 4));
		const above = (steps: number, semitones: number) => {
			const natural = fromDiatonic(diatonic(root) + steps);
			return fromDiatonic(diatonic(root) + steps, midiOf(root) + semitones - midiOf(natural));
		};
		const [third, fifth] = CHORD_SHAPE[quality];
		// To choose from: the qualities heard so far, at least major and minor.
		const options = CHORD_QUALITIES.slice(0, Math.max(2, CHORD_QUALITIES.indexOf(quality) + 1));
		return { kind: 'chord', id, clef, quality, pitches: [root, above(2, third), above(4, fifth)], options: [...options] };
	}
	if (parts[0] === 'trans' && parts.length === 4) {
		const instrument = parts[1] as ProfileId;
		const { transposition, parts: keys = [] } = profile(instrument);
		const pitch = pitchAt('treble', Number(parts[3]));
		const part = parts[2] === 'concert' ? null : (keys.find((key) => key.semitones === Number(parts[2])) ?? null);
		if (parts[2] !== 'concert' && !part) return null;
		// Concert: what the instrument sounds. A part: what sounds, written for this instrument.
		const raw = part ? part.semitones - transposition : transposition;
		// Said as players learn it: a horn sounds a fifth lower (not a fourth higher); a part is read the nearest way.
		const shift = part ? ((((raw + 6) % 12) + 12) % 12) - 6 : raw % 12;
		return { kind: 'trans', id, clef: 'treble', pitch, instrument, part, answer: (((midiOf(pitch) + raw) % 12) + 12) % 12, shift };
	}
	if (parts[0] === 'tune' && parts.length === 3) {
		const tune = tuneQuestion(id, random);
		return tune ? { kind: 'tune', id, clef: tune.clef, tune } : null;
	}
	if (parts[0] === 'scale' && (parts.length === 4 || parts.length === 5)) {
		const item = scaleItem(id);
		return item ? { kind: 'scale', id, clef: item.clef, item } : null;
	}
	if (parts[0] === 'pulse') {
		const pulse = pulseOf(id);
		return pulse ? { kind: 'pulse', id, clef, ...pulse } : null;
	}
	if (parts[0] === 'rhythm' && (parts.length === 2 || parts.length === 3)) {
		const pattern = patternOf(id);
		const meter = meterOf(id);
		const events = parsePattern(pattern, meter);
		return events ? { kind: 'rhythm', id, clef, pattern, meter, events } : null;
	}
	if (parts[0] === 'play' && parts.length === 4) {
		const instrument = parts[1] as ProfileId;
		const pitch = pitchAt(parts[2] as Clef, Number(parts[3]));
		return { kind: 'play', id, clef: parts[2] as Clef, pitch, instrument, midi: midiOf(pitch) + profile(instrument).transposition };
	}
	return null;
}

export const kindOf = (id: string) => id.split(':')[0] as DrillKind;

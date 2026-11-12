import { profile, type ProfileId } from './instruments.ts';
import { alterInKey, CLEFS, diatonic, fromDiatonic, midiOf, tonic, type Clef, type Pitch } from './theory.ts';

/**
 * Scales and arpeggios played into the microphone (#315, phase 2). A scale is played up and
 * down without stopping; the microphone's pitch readings are cut into notes and lined up with
 * the notes expected, so a slip (a note too many or one left out) costs only that note, not
 * everything after it. Each note is then right, wrong or missed, and a right one in tune or
 * so many cents off. All on the device.
 *
 * Item ids: "scale:violin:1:major" is G major on the violin, "scale:cello:-3:harmonic" C minor
 * (harmonic) on the cello, "scale:flute:0:arpMinor" the A minor arpeggio on the flute. Keys by
 * their signature's fifths, as for the key drill; one octave, starting as low as the
 * instrument's comfortable range allows.
 */

export type ScaleType = 'major' | 'arpMajor' | 'harmonic' | 'arpMinor' | 'melodic';
export const SCALE_TYPES: readonly ScaleType[] = ['major', 'arpMajor', 'harmonic', 'arpMinor', 'melodic'];
export const isMinor = (type: ScaleType) => type === 'harmonic' || type === 'arpMinor' || type === 'melodic';
export const isArpeggio = (type: ScaleType) => type === 'arpMajor' || type === 'arpMinor';

export const scaleId = (instrument: ProfileId, fifths: number, type: ScaleType) => `scale:${instrument}:${fifths}:${type}`;

const mod = (value: number, by: number) => ((value % by) + by) % by;

/**
 * The written notes up and down, from the tonic in `octave`. Harmonic minor raises the seventh
 * both ways; melodic minor raises the sixth and seventh going up and plays natural minor down.
 */
export function scaleNotes(fifths: number, type: ScaleType, octave: number): Pitch[] {
	const key = tonic(fifths, isMinor(type) ? 'minor' : 'major');
	const base = octave * 7 + key.step;
	const note = (degree: number, raised: number[] = []) => {
		const index = base + degree;
		return fromDiatonic(index, alterInKey(mod(index, 7), fifths) + (raised.includes(degree) ? 1 : 0));
	};
	if (isArpeggio(type)) return [0, 2, 4, 7, 4, 2, 0].map((degree) => note(degree));
	const up = type === 'harmonic' ? [6] : type === 'melodic' ? [5, 6] : [];
	const down = type === 'harmonic' ? [6] : [];
	return [...[0, 1, 2, 3, 4, 5, 6, 7].map((degree) => note(degree, up)), ...[6, 5, 4, 3, 2, 1, 0].map((degree) => note(degree, down))];
}

/**
 * Where an instrument plays a scale: the first of its clefs, and in it the lowest octave, that
 * holds the whole scale within the comfortable range. Null when it doesn't fit.
 */
export function placeScale(instrument: ProfileId, fifths: number, type: ScaleType): { clef: Clef; octave: number } | null {
	// Timpani are tuned, not played up a scale.
	if (instrument === 'timpani') return null;
	const { clefs, range } = profile(instrument);
	for (const clef of clefs) {
		const span = range[clef];
		if (!span) continue;
		for (let octave = 0; octave <= 8; octave++) {
			const notes = scaleNotes(fifths, type, octave).map(diatonic);
			if (Math.min(...notes) >= span[0] && Math.max(...notes) <= span[1]) return { clef, octave };
		}
	}
	return null;
}

/**
 * Keys round the circle of fifths, as in the key drill: per group, the major scales and their
 * arpeggios, then the minors (harmonic, the arpeggio, melodic). Only what fits the instrument.
 */
export function scaleOrder(instrument: ProfileId): string[] {
	const ids: string[] = [];
	for (const [from, to] of [
		[0, 2],
		[3, 4],
		[5, 7]
	]) {
		const fifths: number[] = [];
		for (let count = from; count <= to; count++) fifths.push(...(count ? [count, -count] : [0]));
		for (const types of [
			['major', 'arpMajor'],
			['harmonic', 'arpMinor', 'melodic']
		] as ScaleType[][]) {
			for (const each of fifths) for (const type of types) if (placeScale(instrument, each, type)) ids.push(scaleId(instrument, each, type));
		}
	}
	return ids;
}

export interface ScaleItem {
	instrument: ProfileId;
	fifths: number;
	type: ScaleType;
	clef: Clef;
	/** Written notes, up and down. */
	pitches: Pitch[];
	/** Sounding MIDI notes, as the microphone hears them. */
	midis: number[];
}

export function scaleItem(id: string): ScaleItem | null {
	const [kind, instrument, rawFifths, type] = id.split(':');
	const fifths = Number(rawFifths);
	if (kind !== 'scale' || !Number.isInteger(fifths) || Math.abs(fifths) > 7 || !SCALE_TYPES.includes(type as ScaleType)) return null;
	const { transposition } = profile(instrument as ProfileId);
	const placed = placeScale(instrument as ProfileId, fifths, type as ScaleType);
	if (!placed || !CLEFS.includes(placed.clef)) return null;
	const pitches = scaleNotes(fifths, type as ScaleType, placed.octave);
	return { instrument: instrument as ProfileId, fifths, type: type as ScaleType, clef: placed.clef, pitches, midis: pitches.map((pitch) => midiOf(pitch) + transposition) };
}

/** A pitch reading from the microphone: when, and the frequency or null in silence. */
export interface Reading {
	time: number;
	frequency: number | null;
}

export interface PlayedNote {
	midi: number;
	/** Median deviation from the tempered note. */
	cents: number;
	onset: number;
	end: number;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

/**
 * Readings cut into notes: a run of readings on one note, at least `minReadings` long (one
 * stray reading, a scrape or the slide between two notes, isn't a note). A note interrupted by
 * such a stray reading or a moment's silence stays one note.
 */
export function segment(readings: Reading[], a4 = 440, minReadings = 2): PlayedNote[] {
	const runs: { midi: number; cents: number[]; onset: number; end: number }[] = [];
	let run: (typeof runs)[number] | null = null;
	for (const { time, frequency } of readings) {
		if (!frequency) {
			run = null;
			continue;
		}
		const semitones = 69 + 12 * Math.log2(frequency / a4);
		const midi = Math.round(semitones);
		const cents = Math.round((semitones - midi) * 100);
		if (run && run.midi === midi) {
			run.cents.push(cents);
			run.end = time;
		} else {
			run = { midi, cents: [cents], onset: time, end: time };
			runs.push(run);
		}
	}
	const notes: (PlayedNote & { all: number[] })[] = [];
	for (const each of runs) {
		if (each.cents.length < minReadings) continue;
		const last = notes[notes.length - 1];
		if (last && last.midi === each.midi && each.onset - last.end <= 250) {
			last.all.push(...each.cents);
			last.end = each.end;
			last.cents = median(last.all);
		} else notes.push({ midi: each.midi, cents: median(each.cents), onset: each.onset, end: each.end, all: [...each.cents] });
	}
	return notes.map(({ midi, cents, onset, end }) => ({ midi, cents, onset, end }));
}

export type NoteMark = { state: 'right'; cents: number; onset: number } | { state: 'wrong'; midi: number; cents: number } | { state: 'missed' };

/**
 * The notes played lined up with those expected, as the fewest slips explain them: a note in
 * place of the expected one is wrong, an expected one with nothing for it missed, a note left
 * over extra. Notes `cheap` says are probably not the player's (the drone heard through the
 * speaker) cost little to leave over.
 */
export function align(expected: number[], played: PlayedNote[], cheap: (midi: number) => boolean = () => false): { marks: NoteMark[]; extra: PlayedNote[] } {
	const n = expected.length;
	const m = played.length;
	const extraCost = (j: number) => (cheap(played[j].midi) ? 0.3 : 1);
	// A wrong note costs one, a hair more the further off: of two equal explanations, it stands for the nearer note.
	const swap = (i: number, j: number) => (expected[i] === played[j].midi ? 0 : 1 + Math.min(12, Math.abs(expected[i] - played[j].midi)) / 1000);
	const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = 1; i <= n; i++) cost[i][0] = i;
	for (let j = 1; j <= m; j++) cost[0][j] = cost[0][j - 1] + extraCost(j - 1);
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			cost[i][j] = Math.min(cost[i - 1][j - 1] + swap(i - 1, j - 1), cost[i - 1][j] + 1, cost[i][j - 1] + extraCost(j - 1));
		}
	}
	const marks: NoteMark[] = new Array(n);
	const extra: PlayedNote[] = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		const here = cost[i][j];
		if (i > 0 && j > 0 && here === cost[i - 1][j - 1] + swap(i - 1, j - 1)) {
			const note = played[j - 1];
			marks[i - 1] = expected[i - 1] === note.midi ? { state: 'right', cents: note.cents, onset: note.onset } : { state: 'wrong', midi: note.midi, cents: note.cents };
			i--;
			j--;
		} else if (j > 0 && here === cost[i][j - 1] + extraCost(j - 1)) {
			extra.unshift(played[j - 1]);
			j--;
		} else {
			marks[i - 1] = { state: 'missed' };
			i--;
		}
	}
	return { marks, extra };
}

/** Cents off within which a note counts as in tune. */
export const IN_TUNE = 15;

export interface ScaleVerdict {
	correct: boolean;
	marks: NoteMark[];
	wrong: number;
	missed: number;
	/** Notes too many, not counting ones that were probably the drone. */
	extra: number;
	/** Mean cents off of the right notes, the measure of clean playing. */
	meanCents: number;
	/** Whether most notes off are sharp (+1) or flat (-1), or neither (0). */
	leaning: number;
	/** How uneven the notes' spacing was: the spread of the gaps between them over their mean. */
	unevenness: number | null;
}

export function judgeScale(expected: number[], played: PlayedNote[], cheap: (midi: number) => boolean = () => false): ScaleVerdict {
	const { marks, extra } = align(expected, played, cheap);
	const right = marks.filter((mark): mark is Extract<NoteMark, { state: 'right' }> => mark.state === 'right');
	const wrong = marks.filter((mark) => mark.state === 'wrong').length;
	const missed = marks.filter((mark) => mark.state === 'missed').length;
	const extras = extra.filter((note) => !cheap(note.midi)).length;
	const meanCents = right.length ? right.reduce((sum, mark) => sum + Math.abs(mark.cents), 0) / right.length : Infinity;
	const sharp = right.filter((mark) => mark.cents > IN_TUNE).length;
	const flat = right.filter((mark) => mark.cents < -IN_TUNE).length;
	const leaning = sharp + flat >= 3 && Math.max(sharp, flat) >= 2 * Math.min(sharp, flat) ? Math.sign(sharp - flat) : 0;
	// The gaps between right notes next to each other; the last note may be held, so it's left out.
	const gaps: number[] = [];
	for (let i = 1; i < marks.length - 1; i++) {
		const before = marks[i - 1];
		const mark = marks[i];
		if (before.state === 'right' && mark.state === 'right') gaps.push(mark.onset - before.onset);
	}
	let unevenness: number | null = null;
	if (gaps.length >= 4) {
		const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
		const spread = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length);
		unevenness = mean > 0 ? spread / mean : null;
	}
	return { correct: !wrong && !missed && !extras, marks, wrong, missed, extra: extras, meanCents, leaning, unevenness };
}

/** Gaps spread more than this over their mean read as uneven. */
export const UNEVEN = 0.3;

/** Notes per minute with the metronome, faster as a scale gets secure. */
export const scaleTempo = (box: number | undefined) => (box === undefined || box < 3 ? 60 : box < 5 ? 72 : 88);

/** The drone's note: the scale's tonic as it sounds, taken down to below G3 so it stays under the playing. */
export function droneMidi(firstMidi: number): number {
	let midi = firstMidi;
	while (midi >= 55) midi -= 12;
	return midi;
}

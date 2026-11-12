import { profile, type ProfileId } from './instruments.ts';
import type { PlayedNote } from './scales.ts';
import { beatMs, judgeSight, makeMelody, type Melody, type SightNote, type SightVerdict } from './sight.ts';
import { alterInKey, diatonic, fromDiatonic, midiOf, pitchOf, tonic, type Clef, type Pitch } from './theory.ts';

/**
 * Playing together (#315, phase 4), on the device like the rest: a second voice under a melody,
 * coming in after bars of rest, and tuning a note into a held chord.
 */

const mod = (value: number, by: number) => ((value % by) + by) % by;

/** Chords by the scale degree of their root: I, IV and V (in minor i, iv and V). */
export type ChordDegree = 0 | 3 | 4;
const CHORD_TONES: Record<ChordDegree, number[]> = { 0: [0, 2, 4], 3: [3, 5, 0], 4: [4, 6, 1] };

/**
 * A chord for each bar of the melody (rest bars before it left out): the one whose notes the bar
 * uses most, its first note counting double; I at the end and V before it where it fits.
 */
export function harmonize(melody: Melody): ChordDegree[] {
	const barLength = melody.meter * 4;
	const home = tonic(melody.fifths, melody.mode).step;
	const lead = melody.lead ?? 0;
	const chords: ChordDegree[] = [];
	for (let bar = lead; bar < melody.bars; bar++) {
		const notes = melody.notes.filter((note) => note.pitch && note.at >= bar * barLength && note.at < (bar + 1) * barLength);
		const score = (chord: ChordDegree) =>
			notes.reduce((sum, note, i) => sum + (CHORD_TONES[chord].includes(mod(diatonic(note.pitch!) - home, 7)) ? note.len * (i === 0 ? 2 : 1) : 0), 0);
		const last = bar === melody.bars - 1;
		const beforeLast = bar === melody.bars - 2;
		const order: ChordDegree[] = beforeLast ? [4, 0, 3] : [0, 4, 3];
		chords.push(last ? 0 : order.reduce((best, chord) => (score(chord) > score(best) ? chord : best)));
	}
	return chords;
}

export interface Voice {
	/** Sounding MIDI note. */
	midi: number;
	/** Start and length in sixteenths from the beginning. */
	at: number;
	len: number;
}

/**
 * A second voice to play along with: the chord's root (and its fifth on the bar's middle in
 * 4/4) low down, a bass under the melody; for a low instrument the chord's third and root above
 * it instead, so the two voices don't sit on top of each other. Rest bars before the melody get
 * I and IV in turn and V just before it comes in, so there's something to count to.
 */
export function secondVoice(melody: Melody, transposition: number): Voice[] {
	const barLength = melody.meter * 4;
	const lead = melody.lead ?? 0;
	const chords: ChordDegree[] = [...Array.from({ length: lead }, (_, i): ChordDegree => (i === lead - 1 ? 4 : i % 2 ? 3 : 0)), ...harmonize(melody)];
	const home = tonic(melody.fifths, melody.mode).step;
	const sounding = melody.notes.filter((note) => note.pitch).map((note) => midiOf(note.pitch!) + transposition);
	const middle = sounding.reduce((sum, midi) => sum + midi, 0) / Math.max(1, sounding.length);
	const low = middle >= 57;
	// Where the voice sits: E2 to E3 for a bass, G4 to G5 above a low instrument.
	const [from, to] = low ? [40, 52] : [67, 79];
	const tone = (degree: number) => {
		const step = mod(home + degree, 7);
		// In minor, V's third is the raised seventh.
		const alter = alterInKey(step, melody.fifths) + (melody.mode === 'minor' && mod(degree, 7) === 6 ? 1 : 0);
		let midi = midiOf(fromDiatonic(28 + step, alter));
		while (midi > to) midi -= 12;
		while (midi < from) midi += 12;
		return midi;
	};
	const voices: Voice[] = [];
	chords.forEach((chord, bar) => {
		const at = bar * barLength;
		const [first, second] = low ? [chord, chord + 4] : [chord + 2, chord];
		if (melody.meter === 4) {
			voices.push({ midi: tone(first), at, len: 8 }, { midi: tone(second), at: at + 8, len: 8 });
		} else voices.push({ midi: tone(first), at, len: 12 });
	});
	return voices;
}

/**
 * Entries: bars of rest, counted while the second voice plays and a conductor beats time, then
 * a short phrase that comes in on the beat. Six levels: more bars to count, coming in on other
 * beats than the first, then longer and harder phrases.
 */
export const MAX_ENTRY_LEVEL = 6;
const ENTRY_LEVELS: { rests: number[]; offbeat: boolean; sight: number }[] = [
	{ rests: [1], offbeat: false, sight: 1 },
	{ rests: [2], offbeat: false, sight: 1 },
	{ rests: [2, 3], offbeat: true, sight: 2 },
	{ rests: [3, 4], offbeat: true, sight: 3 },
	{ rests: [4, 6], offbeat: true, sight: 4 },
	{ rests: [6, 8], offbeat: true, sight: 5 }
];

export function makeEntry(instrument: ProfileId, clef: Clef, level: number, random: () => number = Math.random): Melody | null {
	const rules = ENTRY_LEVELS[Math.min(MAX_ENTRY_LEVEL, Math.max(1, Math.round(level))) - 1];
	const phrase = makeMelody(instrument, clef, rules.sight, random);
	if (!phrase) return null;
	const lead = rules.rests[Math.floor(random() * rules.rests.length)];
	const barLength = phrase.meter * 4;
	// Coming in after the first beat: the phrase's first bar starts with rests to that beat.
	const offset = rules.offbeat && random() < 0.6 ? (1 + Math.floor(random() * (phrase.meter - 1))) * 4 : 0;
	const notes: SightNote[] = [];
	if (offset) notes.push({ at: lead * barLength, len: offset, rest: true });
	for (const note of phrase.notes) {
		const end = note.at + note.len;
		if (end <= offset) continue;
		const at = Math.max(note.at, offset);
		// A note cut by the entry keeps its pitch and the rest of its length.
		notes.push({ ...note, at: at + lead * barLength, len: end - at });
	}
	// A rest cut down to nothing, or a phrase that now starts with a rest after the offset rest, is merged.
	const merged: SightNote[] = [];
	for (const note of notes) {
		const before = merged[merged.length - 1];
		if (before?.rest && note.rest && before.at + before.len === note.at) before.len += note.len;
		else merged.push(note);
	}
	return { ...phrase, bars: phrase.bars + lead, lead, notes: merged };
}

/** The delay assumed between a note's start and the microphone's first reading of it. */
const SPEAKING_MS = 120;

export interface EntryVerdict extends SightVerdict {
	/** How far the entry was off, in beats (positive late); null when the first note wasn't played. */
	entry: number | null;
	onTime: boolean;
}

/**
 * A take of an entry: the phrase judged as sight-reading, and the entry on its own, as the
 * first note's distance from its beat (allowing for how long a note takes to be heard). Coming
 * in a bar late is wrong even if every note after it is right.
 */
export function judgeEntry(
	expected: { midi: number; onset: number }[],
	played: PlayedNote[],
	start: number,
	bpm: number,
	cheap: (midi: number) => boolean = () => false
): EntryVerdict {
	const sight = judgeSight(expected, played, start, bpm, cheap);
	const beat = beatMs(bpm);
	const first = played.find((note) => note.onset >= start + expected[0].onset - beat * 1.5 && note.midi === expected[0].midi);
	const entry = first ? (first.onset - start - expected[0].onset - SPEAKING_MS) / beat : null;
	const onTime = entry !== null && Math.abs(entry) <= 0.35;
	return { ...sight, entry, onTime, score: 0.5 * (onTime ? 1 : 0) + 0.5 * sight.score };
}

/**
 * Tuning into a chord: a chord is held (in just intonation, as an ensemble tunes) and the
 * member plays one of its notes so that it sounds pure. A pure major third is 14 cents lower
 * than the piano's, a minor third 16 cents higher, fifths and fourths 2 cents off.
 */
export type TuneRole = 'fifth' | 'fourth' | 'majorThird' | 'minorThird';
export const TUNE_ROLES: readonly TuneRole[] = ['fifth', 'majorThird', 'fourth', 'minorThird'];

const INTERVAL: Record<TuneRole, { steps: number; semitones: number; ratio: number }> = {
	fifth: { steps: 4, semitones: 7, ratio: 3 / 2 },
	fourth: { steps: 3, semitones: 5, ratio: 4 / 3 },
	majorThird: { steps: 2, semitones: 4, ratio: 5 / 4 },
	minorThird: { steps: 2, semitones: 3, ratio: 6 / 5 }
};

/** Cents a pure interval is off the tempered one: -13.7 for a major third. */
export const pureCents = (role: TuneRole) => 1200 * Math.log2(INTERVAL[role].ratio) - INTERVAL[role].semitones * 100;

/** What's held under each note: the root alone under a fifth or fourth, root and fifth under a third. */
const HELD: Record<TuneRole, number[]> = { fifth: [1], fourth: [1], majorThird: [1, 3 / 2], minorThird: [1, 3 / 2] };

export const tuneId = (instrument: ProfileId, role: TuneRole) => `tune:${instrument}:${role}`;
export const tuneOrder = (instrument: ProfileId): string[] =>
	instrument === 'timpani' || !Object.keys(profile(instrument).range).length ? [] : TUNE_ROLES.map((role) => tuneId(instrument, role));

/** Chord roots, as written: the naturals and the common flats. */
const ROOTS = ['C', 'D', 'Eb', 'E', 'F', 'G', 'A', 'Bb'];

export interface TuneQuestion {
	instrument: ProfileId;
	role: TuneRole;
	clef: Clef;
	/** Written: the chord's root, and the note to play. */
	root: Pitch;
	target: Pitch;
	/** Sounding: the note to play, and the frequencies held, as ratios of the root. */
	targetMidi: number;
	rootMidi: number;
	held: number[];
	/** The held notes, written: the root, and the fifth under a third. */
	heldPitches: Pitch[];
	/** Where the note sounds pure, in cents from the tempered note. */
	pure: number;
}

export function tuneQuestion(id: string, random: () => number = Math.random): TuneQuestion | null {
	const [kind, instrument, role] = id.split(':') as [string, ProfileId, TuneRole];
	if (kind !== 'tune' || !TUNE_ROLES.includes(role) || !tuneOrder(instrument).length) return null;
	const { clefs, range, transposition } = profile(instrument);
	const clef = clefs.find((each) => range[each])!;
	const [low, high] = range[clef]!;
	const { steps, semitones } = INTERVAL[role];
	// Roots whose note to play lies in the middle of the comfortable range, where it's easiest to tune.
	const candidates: Pitch[] = [];
	for (const name of ROOTS) {
		for (let octave = 1; octave <= 6; octave++) {
			const root = { ...pitchOf(`${name[0]}${octave}`), alter: name.endsWith('b') ? -1 : 0 };
			const at = diatonic(root) + steps;
			if (diatonic(root) >= low && at >= low + 2 && at <= high - 3) candidates.push(root);
		}
	}
	if (!candidates.length) return null;
	const root = candidates[Math.floor(random() * candidates.length)];
	/** The note `steps` letters and `semitones` above the root, spelt from it. */
	const above = (steps: number, semitones: number) => fromDiatonic(diatonic(root) + steps, midiOf(root) + semitones - midiOf(fromDiatonic(diatonic(root) + steps)));
	const target = above(steps, semitones);
	return {
		instrument,
		role,
		clef,
		root,
		target,
		targetMidi: midiOf(target) + transposition,
		rootMidi: midiOf(root) + transposition,
		held: HELD[role],
		heldPitches: HELD[role].length > 1 ? [root, above(4, 7)] : [root],
		pure: pureCents(role)
	};
}

/** Cents from pure within which a note counts as tuned. */
export const TUNED = 8;

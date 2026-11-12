import { barLength } from './meters.ts';
import { describe, expect, it } from 'vitest';
import { PROFILE_IDS, profile } from './instruments.ts';
import type { PlayedNote } from './scales.ts';
import { compass, expectedNotes, firstLevel, judgeSight, lookOut, makeMelody, MAX_LEVEL, nextLevel, rulesFor, seeded, type Melody } from './sight.ts';
import { alterInKey, diatonic, midiOf, tonic } from './theory.ts';

const sounding = (melody: Melody) => melody.notes.filter((note) => note.pitch);

/** Many melodies of every level, for the properties every one must have. */
function* melodies() {
	for (let level = 1; level <= MAX_LEVEL; level++) {
		for (const instrument of ['violin', 'viola', 'cello', 'flute', 'clarinet', 'trombone', 'doubleBass'] as const) {
			for (let seed = 1; seed <= 25; seed++) {
				const melody = makeMelody(instrument, profile(instrument).clefs[0], level, seeded(seed * 97 + level));
				if (melody) yield { level, instrument, melody };
			}
		}
	}
}

describe('makeMelody', () => {
	it('fills every bar exactly', () => {
		for (const { melody } of melodies()) {
			const bar = barLength(melody.meter);
			for (let index = 0; index < melody.bars; index++) {
				const inBar = melody.notes.filter((note) => note.at >= index * bar && note.at < (index + 1) * bar);
				expect(inBar.reduce((sum, note) => sum + note.len, 0)).toBe(bar);
			}
		}
	});

	it('comes in 2/4 from level 3 and 6/8 from level 5, with 2/4 twice as many bars', () => {
		const meters = new Map<number, Set<number>>();
		for (const { level, melody } of melodies()) meters.set(level, new Set([...(meters.get(level) ?? []), melody.meter]));
		expect([...(meters.get(2) ?? [])]).toEqual([4]);
		expect(meters.get(3)?.has(2)).toBe(true);
		expect(meters.get(4)?.has(6)).toBe(false);
		expect(meters.get(5)?.has(6)).toBe(true);
		for (const { level, melody } of melodies()) if (melody.meter === 2) expect(rulesFor(level).bars.map((bars) => bars * 2)).toContain(melody.bars);
	});

	it('stays in the instrument’s range and the level’s key and leaps', () => {
		for (const { level, instrument, melody } of melodies()) {
			const rules = rulesFor(level);
			const range = profile(instrument).range[melody.clef]!;
			expect(Math.abs(melody.fifths)).toBeLessThanOrEqual(rules.fifths);
			const notes = sounding(melody);
			for (const [i, note] of notes.entries()) {
				expect(diatonic(note.pitch!)).toBeGreaterThanOrEqual(range[0]);
				expect(diatonic(note.pitch!)).toBeLessThanOrEqual(range[1]);
				if (i > 0) expect(Math.abs(diatonic(note.pitch!) - diatonic(notes[i - 1].pitch!))).toBeLessThanOrEqual(Math.max(rules.leap, 2));
			}
		}
	});

	it('never repeats a note straight after itself', () => {
		for (const { melody } of melodies()) {
			const notes = sounding(melody);
			for (let i = 1; i < notes.length; i++) expect(midiOf(notes[i].pitch!)).not.toBe(midiOf(notes[i - 1].pitch!));
		}
	});

	it('ends on the tonic, stepped into', () => {
		for (const { melody } of melodies()) {
			const notes = sounding(melody);
			const last = notes[notes.length - 1].pitch!;
			const home = tonic(melody.fifths, melody.mode);
			expect(last.step).toBe(home.step);
			expect(Math.abs(diatonic(last) - diatonic(notes[notes.length - 2].pitch!))).toBeLessThanOrEqual(2);
		}
	});

	it('keeps to the key below the chromatic levels, but for minor’s leading note', () => {
		for (const { level, melody } of melodies()) {
			if (rulesFor(level).chromatic) continue;
			for (const note of sounding(melody)) {
				const raisedSeventh = melody.mode === 'minor' && (note.pitch!.step - tonic(melody.fifths, 'minor').step + 7) % 7 === 6;
				expect(note.pitch!.alter - alterInKey(note.pitch!.step, melody.fifths)).toBe(raisedSeventh ? 1 : 0);
			}
		}
	});

	it('starts easy: two bars of C major in steps', () => {
		const melody = makeMelody('violin', 'treble', 1, seeded(7))!;
		expect(melody).toMatchObject({ fifths: 0, mode: 'major', meter: 4, bars: 2 });
		expect(sounding(melody).every((note) => note.len >= 4)).toBe(true);
	});

	it('is the same melody for the same seed', () => {
		expect(makeMelody('cello', 'bass', 5, seeded(42))).toEqual(makeMelody('cello', 'bass', 5, seeded(42)));
	});

	it('gives something for every instrument that reads, nothing for none', () => {
		for (const id of PROFILE_IDS) {
			const clef = profile(id).clefs[0];
			if (id === 'timpani') continue;
			expect(makeMelody(id, clef, 3, seeded(1)), id).not.toBeNull();
		}
	});
});

describe('the look before playing', () => {
	const melody: Melody = {
		fifths: 0,
		mode: 'major',
		meter: 4,
		bars: 2,
		bpm: 60,
		clef: 'treble',
		notes: [
			{ at: 0, len: 4, rest: false, pitch: { step: 0, alter: 0, octave: 4 } },
			{ at: 4, len: 4, rest: false, pitch: { step: 4, alter: 0, octave: 4 } },
			{ at: 8, len: 4, rest: true },
			{ at: 12, len: 4, rest: false, pitch: { step: 3, alter: 1, octave: 4 } },
			{ at: 16, len: 2, rest: false, pitch: { step: 4, alter: 0, octave: 4 } },
			{ at: 18, len: 2, rest: false, pitch: { step: 2, alter: 0, octave: 4 } },
			{ at: 20, len: 12, rest: false, pitch: { step: 0, alter: 0, octave: 4 } }
		]
	};

	it('finds the lowest and highest notes', () => {
		expect(compass(melody)).toEqual({ low: { step: 0, alter: 0, octave: 4 }, high: { step: 4, alter: 0, octave: 4 } });
	});

	it('points out short notes, accidentals and leaps by bar', () => {
		expect(lookOut(melody)).toEqual({ shortest: { len: 2, bar: 2 }, accidental: 1, leap: { steps: 4, bar: 1 } });
	});

	it('gives the sounding notes and when they start', () => {
		expect(expectedNotes(melody, -2).map((note) => [note.midi, note.onset])).toEqual([
			[58, 0],
			[65, 1000],
			[64, 3000],
			[65, 4000],
			[62, 4500],
			[58, 5000]
		]);
	});
});

describe('judgeSight', () => {
	const expected = [60, 62, 64, 65, 67].map((midi, i) => ({ midi, onset: i * 500 }));
	const take = (...notes: [number, number][]): PlayedNote[] => notes.map(([midi, onset]) => ({ midi, cents: 0, onset, end: onset + 400 }));

	it('takes a steady delay as the player’s own, not as late', () => {
		const verdict = judgeSight(expected, take([60, 1180], [62, 1680], [64, 2190], [65, 2670], [67, 3180]), 1000, 120);
		expect(verdict).toMatchObject({ right: 5, inTime: 5, total: 5, keptGoing: true, score: 1 });
	});

	it('marks a note out of time', () => {
		const verdict = judgeSight(expected, take([60, 1000], [62, 1500], [64, 2350], [65, 2500], [67, 3000]), 1000, 120);
		expect(verdict.marks[2]).toEqual({ state: 'right', cents: 0, timing: 'late' });
		expect(verdict.score).toBeCloseTo(0.9);
	});

	it('marks wrong and missing notes, and stopping early', () => {
		const verdict = judgeSight(expected, take([60, 1000], [63, 1500], [64, 2000]), 1000, 120);
		expect(verdict.marks.map((mark) => mark.state)).toEqual(['right', 'wrong', 'right', 'missed', 'missed']);
		expect(verdict.keptGoing).toBe(false);
	});
});

describe('nextLevel', () => {
	it('moves up after two good takes and down after two poor ones', () => {
		let state = { ...firstLevel(), level: 3 };
		state = nextLevel(state, 0.95);
		expect(state).toMatchObject({ level: 3, change: 0 });
		state = nextLevel(state, 0.92);
		expect(state).toMatchObject({ level: 4, change: 1 });
		state = nextLevel(nextLevel(state, 0.4), 0.5);
		expect(state).toMatchObject({ level: 3, change: -1 });
	});

	it('starts counting again after a take in between', () => {
		const state = nextLevel(nextLevel(nextLevel(firstLevel(), 0.95), 0.8), 0.95);
		expect(state).toMatchObject({ level: 1, good: 1 });
	});

	it('stays within the levels', () => {
		expect(nextLevel(nextLevel(firstLevel(), 0.1), 0.1).level).toBe(1);
		expect(nextLevel({ level: MAX_LEVEL, good: 1, poor: 0 }, 1).level).toBe(MAX_LEVEL);
	});
});

import { describe, expect, it } from 'vitest';
import type { PlayedNote } from './scales.ts';
import { expectedNotes, seeded, type Melody } from './sight.ts';
import { harmonize, judgeEntry, makeEntry, pureCents, secondVoice, tuneOrder, tuneQuestion, TUNE_ROLES } from './together.ts';
import { midiOf, pitchOf, type Pitch } from './theory.ts';

const p = (name: string): Pitch => pitchOf(name);
const melody = (notes: [string, number][], meter: 3 | 4 = 4): Melody => {
	let at = 0;
	return {
		fifths: 0,
		mode: 'major',
		meter,
		bars: notes.reduce((sum, [, len]) => sum + len, 0) / (meter * 4),
		bpm: 60,
		clef: 'treble',
		notes: notes.map(([name, len]) => {
			const note = { at, len, rest: false, pitch: p(name) };
			at += len;
			return note;
		})
	};
};

describe('harmonize', () => {
	it('picks the chord the bar’s notes belong to, I at the end', () => {
		const tune = melody([
			['C5', 4], ['E5', 4], ['G5', 4], ['E5', 4],
			['F5', 4], ['A5', 4], ['C6', 4], ['A5', 4],
			['G5', 4], ['B4', 4], ['D5', 4], ['B4', 4],
			['C5', 16]
		]);
		expect(harmonize(tune)).toEqual([0, 3, 4, 0]);
	});
});

describe('secondVoice', () => {
	it('puts a bass of roots and fifths under a high melody', () => {
		const tune = melody([['E5', 8], ['D5', 8], ['G5', 8], ['B4', 8], ['C5', 16]]);
		const bass = secondVoice(tune, 0);
		expect(bass.map((voice) => voice.midi)).toEqual([48, 43, 43, 50, 48, 43]);
		expect(bass.every((voice) => voice.midi >= 40 && voice.midi <= 52)).toBe(true);
		expect(bass.map((voice) => voice.at)).toEqual([0, 8, 16, 24, 32, 40]);
	});

	it('goes above a low instrument, and sounds in concert pitch', () => {
		const tune = { ...melody([['C3', 16], ['C3', 16]]), clef: 'bass' as const };
		expect(secondVoice(tune, 0).every((voice) => voice.midi >= 67 && voice.midi <= 79)).toBe(true);
		// A B♭ clarinet's written C major sounds in B♭: the bass is a tone lower too.
		const high = melody([['C5', 16], ['C5', 16]]);
		expect(secondVoice(high, -2)[0].midi % 12).toBe(0);
	});

	it('plays through the rests before an entry, ending on V', () => {
		const entry = makeEntry('violin', 'treble', 4, seeded(5))!;
		const voices = secondVoice(entry, 0);
		const barLength = entry.meter * 4;
		const lastRest = voices.filter((voice) => voice.at >= (entry.lead! - 1) * barLength && voice.at < entry.lead! * barLength);
		expect(lastRest.length).toBeGreaterThan(0);
		expect(voices[voices.length - 1].at + voices[voices.length - 1].len).toBe(entry.bars * barLength);
	});
});

describe('makeEntry', () => {
	it('starts with bars of rest and fills every bar', () => {
		for (let level = 1; level <= 6; level++) {
			for (let seed = 1; seed <= 30; seed++) {
				const entry = makeEntry('cello', 'bass', level, seeded(seed))!;
				const barLength = entry.meter * 4;
				expect(entry.lead).toBeGreaterThanOrEqual(1);
				expect(entry.notes[0].at).toBe(entry.lead! * barLength);
				for (let bar = entry.lead!; bar < entry.bars; bar++) {
					const inBar = entry.notes.filter((note) => note.at >= bar * barLength && note.at < (bar + 1) * barLength);
					expect(inBar.reduce((sum, note) => sum + note.len, 0)).toBe(barLength);
				}
			}
		}
	});

	it('comes in on the first beat at first, on others later', () => {
		const first = Array.from({ length: 20 }, (_, seed) => makeEntry('violin', 'treble', 1, seeded(seed))!);
		expect(first.every((entry) => !entry.notes[0].rest)).toBe(true);
		const later = Array.from({ length: 20 }, (_, seed) => makeEntry('violin', 'treble', 5, seeded(seed))!);
		expect(later.some((entry) => entry.notes[0].rest)).toBe(true);
	});
});

describe('judgeEntry', () => {
	const entry: Melody = { ...melody([['C5', 4], ['D5', 4], ['E5', 8]]), bars: 2, lead: 1, notes: melody([['C5', 4], ['D5', 4], ['E5', 8]]).notes.map((note) => ({ ...note, at: note.at + 16 })) };
	const expected = expectedNotes(entry, 0);
	const take = (shift: number): PlayedNote[] => expected.map((note) => ({ midi: note.midi, cents: 0, onset: 1000 + note.onset + shift, end: 1000 + note.onset + shift + 800 }));

	it('takes an entry on the beat as on time', () => {
		const verdict = judgeEntry(expected, take(150), 1000, 60);
		expect(verdict.onTime).toBe(true);
		expect(verdict.score).toBe(1);
	});

	it('sees an entry a beat late, though every note after it is right', () => {
		const verdict = judgeEntry(expected, take(1100), 1000, 60);
		expect(verdict.onTime).toBe(false);
		expect(verdict.entry).toBeCloseTo(0.98);
		expect(verdict.score).toBeCloseTo(0.5);
	});
});

describe('tuning into a chord', () => {
	it('knows how far pure intervals are from tempered ones', () => {
		expect(pureCents('majorThird')).toBeCloseTo(-13.69, 1);
		expect(pureCents('minorThird')).toBeCloseTo(15.64, 1);
		expect(pureCents('fifth')).toBeCloseTo(1.96, 1);
		expect(pureCents('fourth')).toBeCloseTo(-1.96, 1);
	});

	it('asks a note in the instrument’s range, spelt from the root', () => {
		for (let seed = 1; seed <= 30; seed++) {
			for (const role of TUNE_ROLES) {
				const question = tuneQuestion(`tune:viola:${role}`, seeded(seed))!;
				expect(question.clef).toBe('alto');
				const semitones = { fifth: 7, fourth: 5, majorThird: 4, minorThird: 3 }[role];
				expect(midiOf(question.target) - midiOf(question.root)).toBe(semitones);
				expect(question.targetMidi - question.rootMidi).toBe(semitones);
			}
		}
	});

	it('sounds a transposing instrument’s chord where it sounds', () => {
		const question = tuneQuestion('tune:clarinet:fifth', seeded(2))!;
		expect(question.targetMidi).toBe(midiOf(question.target) - 2);
	});

	it('leaves out timpani', () => {
		expect(tuneOrder('timpani')).toEqual([]);
		expect(tuneQuestion('tune:timpani:fifth')).toBeNull();
	});
});

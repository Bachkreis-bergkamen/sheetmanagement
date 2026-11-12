import { describe, expect, it } from 'vitest';
import { align, droneMidi, judgeScale, placeScale, scaleItem, scaleNotes, scaleOrder, segment, type PlayedNote, type Reading } from './scales.ts';
import { midiOf, pitchOf, type Pitch } from './theory.ts';

const names = (pitches: Pitch[]) => pitches.map((pitch) => `${'CDEFGAB'[pitch.step]}${['bb', 'b', '', '#', '##'][pitch.alter + 2]}${pitch.octave}`);

describe('scaleNotes', () => {
	it('spells a major scale up and down in its key', () => {
		expect(names(scaleNotes(1, 'major', 3))).toEqual(['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4', 'F#4', 'E4', 'D4', 'C4', 'B3', 'A3', 'G3']);
		expect(names(scaleNotes(-2, 'major', 3)).slice(0, 8)).toEqual(['Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4']);
	});

	it('raises the seventh in harmonic minor, sixth and seventh up in melodic', () => {
		expect(names(scaleNotes(0, 'harmonic', 4))).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G#5', 'A5', 'G#5', 'F5', 'E5', 'D5', 'C5', 'B4', 'A4']);
		expect(names(scaleNotes(-3, 'melodic', 4))).toEqual(['C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'B4', 'C5', 'Bb4', 'Ab4', 'G4', 'F4', 'Eb4', 'D4', 'C4']);
	});

	it('gives arpeggios root, third, fifth, octave and back', () => {
		expect(names(scaleNotes(2, 'arpMajor', 4))).toEqual(['D4', 'F#4', 'A4', 'D5', 'A4', 'F#4', 'D4']);
		expect(names(scaleNotes(-1, 'arpMinor', 3))).toEqual(['D3', 'F3', 'A3', 'D4', 'A3', 'F3', 'D3']);
	});
});

describe('placing scales on an instrument', () => {
	it('starts as low as the comfortable range allows', () => {
		expect(placeScale('violin', 1, 'major')).toEqual({ clef: 'treble', octave: 3 });
		expect(placeScale('violin', 0, 'major')).toEqual({ clef: 'treble', octave: 4 });
		expect(placeScale('cello', 0, 'major')).toEqual({ clef: 'bass', octave: 2 });
		expect(placeScale('viola', 0, 'major')).toEqual({ clef: 'alto', octave: 3 });
	});

	it('leaves out what doesn’t fit', () => {
		expect(placeScale('timpani', 0, 'major')).toBeNull();
		expect(scaleOrder('timpani')).toEqual([]);
	});

	it('orders majors before their minors, round the circle', () => {
		const order = scaleOrder('violin');
		expect(order.slice(0, 4)).toEqual(['scale:violin:0:major', 'scale:violin:0:arpMajor', 'scale:violin:1:major', 'scale:violin:1:arpMajor']);
		expect(order.indexOf('scale:violin:0:harmonic')).toBeGreaterThan(order.indexOf('scale:violin:-2:arpMajor'));
		expect(order.indexOf('scale:violin:3:major')).toBeGreaterThan(order.indexOf('scale:violin:-2:melodic'));
	});

	it('expects a transposing instrument’s sounding notes', () => {
		const clarinet = scaleItem('scale:clarinet:0:major')!;
		expect(clarinet.midis[0]).toBe(midiOf(clarinet.pitches[0]) - 2);
		expect(scaleItem('scale:violin:9:major')).toBeNull();
		expect(scaleItem('scale:violin:0:lydian')).toBeNull();
	});
});

const hz = (midi: number, cents = 0) => 440 * 2 ** ((midi - 69 + cents / 100) / 12);
/** Readings every 80 ms: each note for `each` readings, then optionally one of silence. */
function play(notes: { midi: number; cents?: number }[], each = 5, gap = false): Reading[] {
	const readings: Reading[] = [];
	let time = 0;
	for (const note of notes) {
		for (let i = 0; i < each; i++) readings.push({ time: (time += 80), frequency: hz(note.midi, note.cents) });
		if (gap) readings.push({ time: (time += 80), frequency: null });
	}
	return readings;
}

describe('segment', () => {
	it('cuts readings into notes with their tuning', () => {
		const notes = segment(play([{ midi: 67, cents: 10 }, { midi: 69, cents: -20 }, { midi: 71 }]));
		expect(notes.map((note) => note.midi)).toEqual([67, 69, 71]);
		expect(notes.map((note) => note.cents)).toEqual([10, -20, 0]);
		expect(notes[1].onset).toBe(480);
	});

	it('drops a stray reading and keeps a note across it', () => {
		const readings: Reading[] = [67, 67, 67, 74, 67, 67, 67].map((midi, i) => ({ time: i * 80, frequency: hz(midi) }));
		expect(segment(readings).map((note) => note.midi)).toEqual([67]);
	});
});

const notes = (...midis: number[]): PlayedNote[] => midis.map((midi, i) => ({ midi, cents: 0, onset: i * 500, end: i * 500 + 400 }));

describe('align', () => {
	const expected = [60, 62, 64, 65, 67];

	it('matches a clean run', () => {
		expect(align(expected, notes(60, 62, 64, 65, 67)).marks.every((mark) => mark.state === 'right')).toBe(true);
	});

	it('costs a left-out note only that note', () => {
		const { marks } = align(expected, notes(60, 62, 65, 67));
		expect(marks.map((mark) => mark.state)).toEqual(['right', 'right', 'missed', 'right', 'right']);
	});

	it('costs a wrong note only that note', () => {
		const { marks } = align(expected, notes(60, 62, 63, 65, 67));
		expect(marks.map((mark) => mark.state)).toEqual(['right', 'right', 'wrong', 'right', 'right']);
	});

	it('puts a wrong note where the nearer one was missing', () => {
		// Up C E G C, down F♯ C: the F♯ stands for the G, and the E is left out.
		const { marks } = align([60, 64, 67, 72, 67, 64, 60], notes(60, 64, 67, 72, 66, 60));
		expect(marks.map((mark) => mark.state)).toEqual(['right', 'right', 'right', 'right', 'wrong', 'missed', 'right']);
	});

	it('leaves a note too many over', () => {
		const { marks, extra } = align(expected, notes(60, 62, 63, 64, 65, 67));
		expect(marks.every((mark) => mark.state === 'right')).toBe(true);
		expect(extra.map((note) => note.midi)).toEqual([63]);
	});
});

describe('judgeScale', () => {
	const expected = [60, 62, 64, 65, 67, 65, 64, 62, 60];

	it('is right when every note is there, with how far off in tune', () => {
		const played = notes(...expected).map((note, i) => ({ ...note, cents: i % 2 ? 20 : -10 }));
		const verdict = judgeScale(expected, played);
		expect(verdict.correct).toBe(true);
		expect(verdict.meanCents).toBeCloseTo((4 * 20 + 5 * 10) / 9);
		expect(verdict.unevenness).toBe(0);
	});

	it('says which way the tuning leans', () => {
		expect(judgeScale(expected, notes(...expected).map((note) => ({ ...note, cents: 25 }))).leaning).toBe(1);
		expect(judgeScale(expected, notes(...expected)).leaning).toBe(0);
	});

	it('counts slips, but not the drone heard through the speaker', () => {
		const drone = (midi: number) => midi % 12 === 0;
		const verdict = judgeScale(expected, notes(48, 60, 62, 64, 65, 67, 65, 64, 62, 60), drone);
		expect(verdict.correct).toBe(true);
		expect(judgeScale(expected, notes(60, 62, 64, 66, 67, 65, 64, 62, 60)).wrong).toBe(1);
	});

	it('sees uneven playing', () => {
		const played = notes(...expected).map((note, i) => ({ ...note, onset: i * 500 + (i % 2 ? 200 : 0) }));
		expect(judgeScale(expected, played).unevenness).toBeGreaterThan(0.3);
	});
});

describe('droneMidi', () => {
	it('sits below the playing', () => {
		expect(droneMidi(midiOf(pitchOf('G3')))).toBe(43);
		expect(droneMidi(midiOf(pitchOf('C2')))).toBe(36);
	});
});

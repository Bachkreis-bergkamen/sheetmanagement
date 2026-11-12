import { describe, expect, it } from 'vitest';
import { noteFrequency } from '#lib/practice/audio.ts';
import { NoteJudge } from './judge.ts';

/** Readings every 80 ms, as the microphone gives them. */
function play(judge: NoteJudge, frequencies: (number | null)[]) {
	for (const [i, frequency] of frequencies.entries()) {
		const verdict = judge.push(frequency, i * 80);
		if (verdict) return verdict;
	}
	return null;
}

const A4 = 69;
const hold = (frequency: number | null, count: number) => Array(count).fill(frequency);

describe('NoteJudge', () => {
	it('takes the right note once it has been held a moment, with how far off it was', () => {
		expect(play(new NoteJudge(A4), hold(440, 2))).toBeNull();
		expect(play(new NoteJudge(A4), hold(440, 5))).toEqual({ result: 'right', cents: 0 });
		const sharp = 440 * 2 ** (12 / 1200);
		expect(play(new NoteJudge(A4), hold(sharp, 5))).toEqual({ result: 'right', cents: 12 });
	});

	it('hears the note against the orchestra’s concert A', () => {
		expect(play(new NoteJudge(A4, { a4: 443 }), hold(443, 5))).toEqual({ result: 'right', cents: 0 });
	});

	it('lets the player slide into the note', () => {
		const verdict = play(new NoteJudge(A4), [...hold(noteFrequency(8, 4), 4), ...hold(440, 5)]);
		expect(verdict).toEqual({ result: 'right', cents: 0 });
	});

	it('says which note it heard when another is held', () => {
		expect(play(new NoteJudge(A4), hold(noteFrequency(7, 4), 12))).toEqual({ result: 'wrong', midi: 67, cents: 0, octave: false });
		expect(play(new NoteJudge(A4), hold(220, 12))).toMatchObject({ result: 'wrong', midi: 57, octave: true });
	});

	it('starts again after silence', () => {
		expect(play(new NoteJudge(A4), [440, 440, null, 440, 440, null, 440])).toBeNull();
	});

	it('doesn’t take the last question’s note, still sounding, as an attempt at this one', () => {
		const F4 = noteFrequency(5, 4);
		// F still bowed when A is asked: no verdict, however long.
		expect(play(new NoteJudge(A4, { carried: 65 }), hold(F4, 20))).toBeNull();
		// Then the A: right.
		expect(play(new NoteJudge(A4, { carried: 65 }), [...hold(F4, 6), ...hold(440, 5)])).toEqual({ result: 'right', cents: 0 });
		// A wobble of a semitone isn't a new note.
		expect(play(new NoteJudge(A4, { carried: 65 }), [...hold(F4, 3), noteFrequency(6, 4), ...hold(F4, 12)])).toBeNull();
		// After a break the same F counts as a wrong note.
		expect(play(new NoteJudge(A4, { carried: 65 }), [...hold(F4, 3), null, ...hold(F4, 12)])).toMatchObject({ result: 'wrong', midi: 65 });
	});

	it('asked the same note again, wants it played again after a break', () => {
		expect(play(new NoteJudge(A4, { carried: A4 }), hold(440, 10))).toBeNull();
		expect(play(new NoteJudge(A4, { carried: A4 }), [...hold(440, 3), null, ...hold(440, 5)])).toEqual({ result: 'right', cents: 0 });
	});
});

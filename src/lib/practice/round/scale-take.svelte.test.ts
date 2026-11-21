import { describe, expect, it } from 'vitest';
import * as t from '#lib/i18n/texts.ts';
import { IN_TUNE, type NoteMark } from '#lib/practice/drills/scales.ts';
import { LAST_NOTE_MS, LONGEST_MS, scaleCaptions, scaleMarks, ScaleTake, SILENCE_MS } from './scale-take.svelte.ts';

const hz = (midi: number, cents = 0) => 440 * 2 ** ((midi - 69 + cents / 100) / 12);
const C_MAJOR = [60, 62, 64, 65, 67, 69, 71, 72];

/** Plays `midis`, each for `ms` at ten readings a second, from `start`; true once the take ended. */
function play(take: ScaleTake, midis: number[], start = 0, ms = 400, cents = 0) {
	let time = start;
	for (const midi of midis)
		for (let i = 0; i < ms / 100; i++) {
			if (take.reading(hz(midi, cents), time)) return { ended: true, time };
			time += 100;
		}
	return { ended: false, time };
}

describe('ScaleTake', () => {
	it('ends once the last note has sounded, and judges the take', () => {
		const take = new ScaleTake();
		take.begin(C_MAJOR, () => false, 0);
		const { ended, time } = play(take, C_MAJOR, 0, 800);
		expect(ended).toBe(true);
		expect(time).toBeGreaterThanOrEqual(7 * 800 + LAST_NOTE_MS);
		const verdict = take.verdict();
		expect(verdict.correct).toBe(true);
		expect(take.marks.every((mark) => mark.state === 'right')).toBe(true);
	});

	it('shows the note heard now with its cents', () => {
		const take = new ScaleTake();
		take.begin(C_MAJOR, () => false, 0);
		take.reading(hz(64, 12), 0);
		expect(take.heardNow).toEqual({ midi: 64, cents: 12 });
		take.stop();
		expect(take.heardNow).toBeNull();
		expect(take.take).toBe('idle');
	});

	it('ends after a long silence once something was played', () => {
		const take = new ScaleTake();
		take.begin(C_MAJOR, () => false, 0);
		expect(take.reading(null, SILENCE_MS + 500)).toBe(false);
		play(take, [60, 62], 4000);
		expect(take.reading(null, 4800 + SILENCE_MS + 1)).toBe(true);
	});

	it('doesn’t take the drone through the speaker for the player still playing', () => {
		const take = new ScaleTake();
		const drone = (midi: number) => midi % 12 === 2;
		take.begin([60, 64, 67], drone, 0);
		play(take, [60], 0);
		// The drone's D, not in the scale, doesn't keep the take going.
		const { time } = play(take, [62], 400, 3500);
		expect(take.reading(hz(62), time)).toBe(true);
	});

	it('ignores what is played while counting in, and ends after the longest take', () => {
		const take = new ScaleTake();
		take.begin(C_MAJOR, () => false, 0);
		take.countIn();
		expect(take.counting).toBe(true);
		take.reading(hz(60), 100);
		expect(take.heardNow).toBeNull();
		take.listenFrom(1000);
		take.take = 'playing';
		expect(take.reading(hz(55), 1000)).toBe(false);
		expect(take.reading(hz(55), 1000 + LONGEST_MS + 1)).toBe(true);
	});

	it('clears its marks for the next question', () => {
		const take = new ScaleTake();
		take.begin(C_MAJOR, () => false, 0);
		play(take, [60, 62], 0);
		expect(take.marks.length).toBe(C_MAJOR.length);
		take.clear();
		expect(take.marks).toEqual([]);
	});
});

describe('scaleMarks and scaleCaptions', () => {
	const marks: NoteMark[] = [
		{ state: 'right', cents: 2, onset: 0 },
		{ state: 'right', cents: IN_TUNE + 5, onset: 400 },
		{ state: 'wrong', midi: 63, cents: 0 },
		{ state: 'missed' }
	];

	it('colours only as far as played until the answer, and the tuning only when shown', () => {
		expect(scaleMarks(marks, false, true)).toEqual(['right', 'off', 'wrong', null]);
		expect(scaleMarks(marks, false, false)).toEqual(['right', 'right', 'wrong', null]);
		expect(scaleMarks(marks, true, true)).toEqual(['right', 'off', 'wrong', 'wrong']);
	});

	it('captions cents off, the note heard instead, and a dash for one left out', () => {
		expect(scaleCaptions(marks)).toEqual(['', `+${IN_TUNE + 5}`, t.practice.tuner.notes[3], '–']);
	});
});

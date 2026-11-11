import { describe, expect, it } from 'vitest';
import { BAR, calibrate, judgeTaps, onsets, parsePattern, patternOf, PATTERNS, RHYTHM_ORDER, rhythmId, tempoFor, toleranceFor } from './rhythm.ts';

describe('patterns', () => {
	it('are each one bar of 4/4, none twice', () => {
		for (const pattern of PATTERNS) expect(parsePattern(pattern), pattern).not.toBeNull();
		expect(new Set(PATTERNS).size).toBe(PATTERNS.length);
	});

	it('reads notes, rests and where they start', () => {
		expect(parsePattern('4 4 r4 4')).toEqual([
			{ len: 4, rest: false, at: 0 },
			{ len: 4, rest: false, at: 4 },
			{ len: 4, rest: true, at: 8 },
			{ len: 4, rest: false, at: 12 }
		]);
		expect(parsePattern('4 4 4')).toBeNull();
		expect(parsePattern('4 x 4 4')).toBeNull();
		expect(parsePattern('20')).toBeNull();
	});

	it('round-trip through their ids', () => {
		expect(rhythmId('4 4 r4 4')).toBe('rhythm:4-4-r4-4');
		for (const id of RHYTHM_ORDER) expect(parsePattern(patternOf(id))?.reduce((sum, event) => sum + event.len, 0)).toBe(BAR);
	});

	it('give the onsets of notes, not rests', () => {
		expect(onsets(parsePattern('r4 4 2 2 4')!, 500)).toEqual([500, 1000, 1250, 1500]);
	});
});

describe('tempo and tolerance', () => {
	it('get faster and tighter as an item is known', () => {
		expect(tempoFor(undefined)).toBeLessThan(tempoFor(3));
		expect(tempoFor(3)).toBeLessThan(tempoFor(6));
		expect(toleranceFor(undefined, 800)).toBe(150);
		expect(toleranceFor(4, 600)).toBe(90);
		expect(toleranceFor(1, 600)).toBe(120);
	});
});

describe('judgeTaps', () => {
	const quarters = [0, 500, 1000, 1500];

	it('takes taps close to every note as right', () => {
		const verdict = judgeTaps(quarters, [12, 490, 1030, 1495], 100);
		expect(verdict.correct).toBe(true);
		expect(verdict.deviations).toEqual([12, -10, 30, -5]);
		expect(verdict.meanOff).toBeCloseTo(14.25);
		expect(verdict.extra).toEqual([]);
	});

	it('marks a note not tapped', () => {
		const verdict = judgeTaps(quarters, [0, 500, 1500], 100);
		expect(verdict.correct).toBe(false);
		expect(verdict.deviations).toEqual([0, 0, null, 0]);
	});

	it('counts taps no note takes as extra', () => {
		const verdict = judgeTaps(quarters, [0, 250, 500, 1000, 1500], 100);
		expect(verdict.correct).toBe(false);
		expect(verdict.extra).toEqual([250]);
	});

	it('lets a tap too far off miss its note', () => {
		const verdict = judgeTaps(quarters, [0, 500, 1180, 1500], 100);
		expect(verdict.deviations[2]).toBeNull();
		expect(verdict.extra).toEqual([1180]);
	});

	it('keeps two fast notes from sharing one tap', () => {
		// Sixteenths 125 ms apart: a tap between them belongs to neither's window of 61 ms.
		const verdict = judgeTaps([0, 125, 250], [0, 63, 250], 150);
		expect(verdict.deviations).toEqual([0, null, 0]);
		expect(verdict.extra).toEqual([63]);
	});

	it('gives the tendency: late taps drag', () => {
		expect(judgeTaps(quarters, [40, 545, 1050, 1535], 100).tendency).toBeCloseTo(42.5);
		expect(judgeTaps(quarters, [-40, 455, 950, 1465], 100).tendency).toBeLessThan(-30);
	});
});

describe('calibrate', () => {
	const clicks = [0, 667, 1333, 2000, 2667, 3333, 4000, 4667];

	it('takes the median offset of steady taps', () => {
		expect(calibrate(clicks, clicks.map((click, i) => click + 80 + (i % 2 ? 10 : -10)))).toBe(90);
	});

	it('gives up on too few or scattered taps', () => {
		expect(calibrate(clicks, [80, 750, 1410])).toBeNull();
		expect(calibrate(clicks, clicks.map((click, i) => click + (i % 2 ? 200 : -150)))).toBeNull();
	});

	it('ignores taps far from any click', () => {
		expect(calibrate(clicks, [...clicks.map((click) => click + 50), 333])).toBe(50);
	});
});

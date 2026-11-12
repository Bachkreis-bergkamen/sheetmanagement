import { describe, expect, it } from 'vitest';
import { barLength, markedTempo } from './meters.ts';
import { BAR, calibrate, DRIFTED, firstSilent, judgePulse, judgeTaps, PULSE_ORDER, pulseLoudness, pulseOf, onsets, parsePattern, patternOf, PATTERNS, PATTERNS_2_4, PATTERNS_6_8, meterOf, RHYTHM_ORDER, rhythmId, tempoFor, toleranceFor } from './rhythm.ts';

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
		for (const id of RHYTHM_ORDER) expect(parsePattern(patternOf(id), meterOf(id))?.reduce((sum, event) => sum + event.len, 0), id).toBe(barLength(meterOf(id)));
		expect(new Set(RHYTHM_ORDER).size).toBe(RHYTHM_ORDER.length);
	});

	it('come in 2/4 and 6/8 too, each meter starting from its plainest bar', () => {
		expect(rhythmId('4 2 6', 6)).toBe('rhythm:6/8:4-2-6');
		expect(meterOf('rhythm:6/8:4-2-6')).toBe(6);
		expect(meterOf('rhythm:2/4:4-4')).toBe(2);
		expect(meterOf('rhythm:4-4-4-4')).toBe(4);
		expect(patternOf('rhythm:6/8:4-2-6')).toBe('4 2 6');
		for (const pattern of PATTERNS_2_4) expect(parsePattern(pattern, 2), pattern).not.toBeNull();
		for (const pattern of PATTERNS_6_8) expect(parsePattern(pattern, 6), pattern).not.toBeNull();
		const first = (meter: number) => RHYTHM_ORDER.find((id) => meterOf(id) === meter);
		expect(first(2)).toBe('rhythm:2/4:4-4');
		expect(first(6)).toBe('rhythm:6/8:2-2-2-2-2-2');
		// The first 4/4 bars still come first, so progress made before keeps its place.
		expect(RHYTHM_ORDER.slice(0, 4)).toEqual(PATTERNS.slice(0, 4).map((pattern) => rhythmId(pattern)));
	});

	it('time 6/8 by its eighths', () => {
		expect(onsets(parsePattern('4 2 6', 6)!, 300, 6)).toEqual([0, 600, 900]);
		// Felt in dotted quarters at two-thirds of the quarter tempo: 72 → 48, eighths 144.
		expect(tempoFor(undefined, 6)).toBe(144);
		expect(markedTempo(tempoFor(5, 6), 6)).toBe(64);
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

describe('keeping the pulse', () => {
	const beat = 500;
	const silentBeats = (silent: number, at: (i: number) => number) => Array.from({ length: silent * 4 }, (_, i) => (firstSilent() + i) * beat + at(i));

	it('reads its items', () => {
		for (const id of PULSE_ORDER) expect(pulseOf(id)).not.toBeNull();
		expect(pulseOf('pulse:90:4')).toEqual({ bpm: 90, silent: 4 });
		expect(pulseOf('rhythm:4-4-4-4')).toBeNull();
	});

	it('fades the metronome out over a bar and brings back one click', () => {
		const loud = Array.from({ length: 4 + 12 + 8 + 2 }, (_, i) => pulseLoudness(i, 2));
		expect(loud.slice(0, 12)).toEqual(Array(12).fill(1));
		expect(loud.slice(12, 16)).toEqual([0.7, 0.45, 0.25, 0.1]);
		expect(loud.slice(16, 24)).toEqual(Array(8).fill(0));
		expect(loud[24]).toBe(1);
		expect(loud[25]).toBe(0);
	});

	it('takes an even pulse as held, ignoring taps along with the metronome', () => {
		const along = [0, 500, 1000, 1500, 5500];
		const verdict = judgePulse(120, 2, [...along, ...silentBeats(2, (i) => (i % 2 ? 15 : -15))]);
		expect(verdict.correct).toBe(true);
		expect(verdict.meanOff).toBe(15);
		expect(Math.abs(verdict.end)).toBeLessThan(DRIFTED);
	});

	it('sees a player speeding up', () => {
		const verdict = judgePulse(120, 4, silentBeats(4, (i) => -8 * i));
		expect(verdict.correct).toBe(true);
		expect(verdict.drift).toBeCloseTo(-32);
		expect(verdict.end).toBeCloseTo(-120);
	});

	it('loses the pulse once it wanders out of the window', () => {
		const verdict = judgePulse(120, 4, silentBeats(4, (i) => 12 * i));
		expect(verdict.correct).toBe(false);
		expect(verdict.deviations.filter((deviation) => deviation === null).length).toBeGreaterThan(1);
	});

	it('forgives one missed beat, not two', () => {
		expect(judgePulse(120, 2, silentBeats(2, () => 0).filter((_, i) => i !== 3)).correct).toBe(true);
		expect(judgePulse(120, 2, silentBeats(2, () => 0).filter((_, i) => i !== 3 && i !== 5)).correct).toBe(false);
		expect(judgePulse(120, 2, []).correct).toBe(false);
	});
});

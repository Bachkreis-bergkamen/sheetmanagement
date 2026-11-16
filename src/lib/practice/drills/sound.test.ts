import { describe, expect, it } from 'vitest';
import { barStart, clickFilter, nearClick, tapTime, triad } from './sound.ts';

describe('triad', () => {
	it('breaks the tonic chord from root to octave, in the middle of the range', () => {
		// C major: C4 E4 G4 C5.
		expect(triad(0, 'major')).toEqual([60, 64, 67, 72]);
		// A minor: A3 C4 E4 A4.
		expect(triad(9, 'minor')).toEqual([57, 60, 64, 69]);
		// G and F♯ are the lowest and highest roots.
		expect(triad(7, 'major')[0]).toBe(55);
		expect(triad(6, 'major')[0]).toBe(66);
	});
});

describe('the metronome through the microphone', () => {
	const clicks = [1000, 1500];

	it('knows the readings that may have heard a click', () => {
		expect(nearClick(990, clicks)).toBe(true);
		expect(nearClick(1100, clicks)).toBe(true);
		expect(nearClick(1200, clicks)).toBe(false);
		expect(nearClick(900, clicks)).toBe(false);
	});

	it('skips a click read as a note, but lets a held note go on through it', () => {
		const keep = clickFilter(() => clicks);
		// Silence, then the click read as a high A: skipped.
		expect(keep(null, 920)).toBe(true);
		expect(keep(1760, 1040)).toBe(false);
		// A note held through the next click goes on.
		expect(keep(220, 1360)).toBe(true);
		expect(keep(221, 1520)).toBe(true);
		// The click instead of the held note: skipped.
		expect(keep(1760, 1580)).toBe(false);
	});
});

describe('clicks and taps on the clock of the page (#363)', () => {
	it('takes the timestamp of the output when it is near both clocks', () => {
		// The frame heard now left the audio clock 40 ms ago: the downbeat in 1 s of audio time is heard in 1040 ms.
		expect(barStart(3, 10_000, 2, 0.01, { performanceTime: 10_000, contextTime: 1.96 })).toBeCloseTo(11_040);
	});

	it('falls back to the reported latency when the timestamp is missing, zero or on another clock', () => {
		const fallback = 10_000 + (3 - 2 + 0.01) * 1000;
		expect(barStart(3, 10_000, 2, 0.01)).toBeCloseTo(fallback);
		expect(barStart(3, 10_000, 2, 0.01, { performanceTime: 0, contextTime: 0 })).toBeCloseTo(fallback);
		expect(barStart(3, 10_000, 2, 0.01, { performanceTime: 86_400_000, contextTime: 1.96 })).toBeCloseTo(fallback);
		expect(barStart(3, 10_000, 2, 0.01, { performanceTime: 10_000, contextTime: 0 })).toBeCloseTo(fallback);
	});

	it('times a tap by its event, unless the event is on another clock', () => {
		expect(tapTime(9_988, 10_000)).toBe(9_988);
		expect(tapTime(4_000, 10_000)).toBe(10_000);
		expect(tapTime(1_700_000_000_000, 10_000)).toBe(10_000);
	});
});

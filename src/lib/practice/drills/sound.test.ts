import { describe, expect, it } from 'vitest';
import { triad } from './sound.ts';

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

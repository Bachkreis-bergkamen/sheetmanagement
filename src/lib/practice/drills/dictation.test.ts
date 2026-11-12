import { describe, expect, it } from 'vitest';
import { dictationOf, DICTATION_ORDER } from './dictation.ts';
import { diatonic, staffPosition } from './theory.ts';

/** A seeded random, so each case is the same every run. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('melodic dictation', () => {
	it('offers three melodies of the asked length, one note apart from the one played', () => {
		for (const id of DICTATION_ORDER) {
			const length = Number(id.split(':')[1]);
			for (let seed = 1; seed <= 30; seed++) {
				const dictation = dictationOf(id, 'treble', seeded(seed))!;
				expect(dictation.options).toHaveLength(3);
				const played = dictation.options[dictation.answer].map(diatonic);
				for (const [i, option] of dictation.options.entries()) {
					expect(option).toHaveLength(length);
					const steps = option.map(diatonic);
					const differ = steps.filter((step, at) => step !== played[at]).length;
					expect(differ).toBe(i === dictation.answer ? 0 : 1);
					// The first note is the same in all: the tonic.
					expect(steps[0]).toBe(played[0]);
				}
			}
		}
	});

	it('moves in steps only at first, and stays near the staff', () => {
		for (let seed = 1; seed <= 30; seed++) {
			for (const clef of ['treble', 'bass', 'alto'] as const) {
				const { options, answer } = dictationOf('dict:4:step', clef, seeded(seed))!;
				const steps = options[answer].map(diatonic);
				for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i] - steps[i - 1])).toBe(1);
				for (const pitch of options.flat()) {
					// At most two ledger lines below or above.
					expect(staffPosition(clef, pitch)).toBeGreaterThanOrEqual(-4);
					expect(staffPosition(clef, pitch)).toBeLessThanOrEqual(12);
				}
			}
		}
	});

	it('puts the answer anywhere among the three', () => {
		const places = new Set(Array.from({ length: 40 }, (_, seed) => dictationOf('dict:3:step', 'treble', seeded(seed + 1))!.answer));
		expect(places).toEqual(new Set([0, 1, 2]));
	});

	it('refuses other ids', () => {
		expect(dictationOf('dict:9:step', 'treble')).toBeNull();
		expect(dictationOf('dict:4:jump', 'treble')).toBeNull();
	});
});

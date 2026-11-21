import { describe, expect, it } from 'vitest';
import type { Question } from '#lib/practice/drills/decks.ts';
import { autoNextMs, isHeard, PAUSE_MS, replaysAfter, soundMs } from './pace.ts';

const q = (question: Partial<Question>) => question as Question;
const ear = q({ kind: 'ear', harmonic: false });
const dict = q({ kind: 'dict', answer: 0, options: [[{}, {}, {}, {}] as never] });

describe('pace', () => {
	it('tells heard questions from read ones', () => {
		expect([ear, dict, q({ kind: 'chord' })].every(isHeard)).toBe(true);
		expect(isHeard(q({ kind: 'notes' }))).toBe(false);
	});

	it('knows how long a heard question rings', () => {
		expect(soundMs(ear)).toBe(1900);
		expect(soundMs(q({ kind: 'ear', harmonic: true }))).toBe(1200);
		expect(soundMs(q({ kind: 'chord' }))).toBe(2800);
		expect(soundMs(dict)).toBe(3000);
	});

	it('replays a wrong rhythm but not a right one, never the pulse, a heard one only if wanted', () => {
		expect(replaysAfter(q({ kind: 'rhythm' }), true, true, true)).toBe(false);
		expect(replaysAfter(q({ kind: 'rhythm' }), false, true, true)).toBe(true);
		expect(replaysAfter(q({ kind: 'pulse' }), false, true, true)).toBe(false);
		expect(replaysAfter(ear, true, true, false)).toBe(false);
		expect(replaysAfter(ear, true, true, true)).toBe(true);
		expect(replaysAfter(q({ kind: 'notes' }), true, false, true)).toBe(false);
	});

	it('goes on by itself only after a right answer, longer for something new to look at', () => {
		const plain = { trying: false, isNew: false, replayed: false };
		expect(autoNextMs(q({ kind: 'notes' }), true, plain)).toBe(800);
		expect(autoNextMs(q({ kind: 'notes' }), true, { ...plain, isNew: true })).toBe(1600);
		expect(autoNextMs(q({ kind: 'rhythm' }), true, plain)).toBe(1800);
		expect(autoNextMs(q({ kind: 'play' }), true, { ...plain, trying: true })).toBe(2600);
		expect(autoNextMs(q({ kind: 'notes' }), false, plain)).toBeNull();
		expect(autoNextMs(q({ kind: 'scale' }), true, plain)).toBeNull();
		expect(autoNextMs(q({ kind: 'pulse' }), true, plain)).toBeNull();
	});

	it('waits for a replayed heard question to die away, and a moment more', () => {
		expect(autoNextMs(dict, true, { trying: false, isNew: false, replayed: true })).toBe(3000 + PAUSE_MS);
		expect(autoNextMs(dict, true, { trying: false, isNew: false, replayed: false })).toBe(800);
	});
});

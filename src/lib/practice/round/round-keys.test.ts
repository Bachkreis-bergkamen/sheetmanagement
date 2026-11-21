import { describe, expect, it } from 'vitest';
import type { Question } from '#lib/practice/drills/decks.ts';
import { roundKey, type RoundKeyState } from './round-keys.ts';

const press = (key: string, more: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean }> = {}) => ({
	key,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	repeat: false,
	...more
});
const state = (question: Partial<Question> | null, more: Partial<RoundKeyState> = {}): RoundKeyState => ({
	question: question as Question,
	answered: false,
	finished: false,
	idle: true,
	calibrating: false,
	letterKeys: ['c', 'd', 'e', 'f', 'g', 'a', 'h'],
	...more
});

describe('roundKey', () => {
	it('starts a rhythm with the space bar, then taps; a held space bar does neither', () => {
		const rhythm = { kind: 'rhythm' } as const;
		expect(roundKey(press(' '), state(rhythm))).toEqual({ do: 'start' });
		expect(roundKey(press(' '), state({ kind: 'pulse' }, { idle: false }))).toEqual({ do: 'tap' });
		expect(roundKey(press(' ', { repeat: true }), state(rhythm, { idle: false }))).toEqual({ do: 'hold' });
		// While measuring the delay, the button starts it; the space bar only taps.
		expect(roundKey(press(' '), state(rhythm, { calibrating: true }))).toEqual({ do: 'tap' });
	});

	it('goes on after an answer with space or Enter', () => {
		expect(roundKey(press('Enter'), state({ kind: 'notes' }, { answered: true }))).toEqual({ do: 'next' });
		expect(roundKey(press(' '), state({ kind: 'rhythm' }, { answered: true }))).toEqual({ do: 'next' });
		expect(roundKey(press('c'), state({ kind: 'notes' }, { answered: true }))).toBeNull();
	});

	it('answers a note by its letter, in either case', () => {
		expect(roundKey(press('E'), state({ kind: 'notes' }))).toEqual({ do: 'letter', step: 2 });
		expect(roundKey(press('h'), state({ kind: 'notes' }))).toEqual({ do: 'letter', step: 6 });
		expect(roundKey(press('x'), state({ kind: 'notes' }))).toBeNull();
	});

	it('answers by the number of an option in range, and leaves other keys be', () => {
		const keys = { kind: 'keys', options: [0, 1, 2, 3] } as Partial<Question>;
		expect(roundKey(press('1'), state(keys))).toEqual({ do: 'option', index: 0 });
		expect(roundKey(press('4'), state(keys))).toEqual({ do: 'option', index: 3 });
		expect(roundKey(press('5'), state(keys))).toBeNull();
		expect(roundKey(press('0'), state(keys))).toBeNull();
		// Shift, Tab or a letter used to count as a wrong answer.
		for (const key of ['Shift', 'Tab', 'a', ' ']) expect(roundKey(press(key), state(keys))).toBeNull();
		expect(roundKey(press('3'), state({ kind: 'dict', options: [[], [], []] } as Partial<Question>))).toEqual({ do: 'option', index: 2 });
	});

	it('is someone else’s with ctrl, cmd or alt, or once the round is over', () => {
		expect(roundKey(press('1', { ctrlKey: true }), state({ kind: 'keys', options: [0] } as Partial<Question>))).toBeNull();
		expect(roundKey(press('c', { metaKey: true }), state({ kind: 'notes' }))).toBeNull();
		expect(roundKey(press(' '), state(null, { finished: true }))).toBeNull();
	});
});

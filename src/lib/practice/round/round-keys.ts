import type { Question } from '#lib/practice/drills/decks.ts';

/**
 * What a key does in a drill round (DrillRound): tap into the bar or start its count-in, go on
 * after an answer, or answer: a letter by its index (C to B), or the option numbered on screen.
 */
export type RoundKey = { do: 'hold' } | { do: 'tap' } | { do: 'start' } | { do: 'next' } | { do: 'letter'; step: number } | { do: 'option'; index: number };

export type RoundKeyState = {
	question: Question | null;
	answered: boolean;
	finished: boolean;
	/** No bar under way. */
	idle: boolean;
	calibrating: boolean;
	/** The keys for the letters C to B, in the member's language. */
	letterKeys: readonly string[];
};

type KeyPress = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; repeat: boolean };

/**
 * What a key press does; null when it's someone else's, a shortcut, or nothing here. A held
 * space bar doesn't tap again (`hold`), but still mustn't scroll the page. Only a number in
 * the options' range answers: other keys, such as Shift or Tab, leave the question be.
 */
export function roundKey(event: KeyPress, state: RoundKeyState): RoundKey | null {
	const { question, answered } = state;
	if (event.metaKey || event.ctrlKey || event.altKey || state.finished) return null;
	// Rhythm: the space bar taps, or starts the count-in.
	if ((question?.kind === 'rhythm' || question?.kind === 'pulse') && !answered && event.key === ' ') {
		if (event.repeat) return { do: 'hold' };
		return state.idle && !state.calibrating ? { do: 'start' } : { do: 'tap' };
	}
	if (answered) return event.key === ' ' || event.key === 'Enter' ? { do: 'next' } : null;
	if (question?.kind === 'notes') {
		const step = state.letterKeys.indexOf(event.key.toLowerCase());
		return step >= 0 ? { do: 'letter', step } : null;
	}
	if (question?.kind === 'dict' || question?.kind === 'keys' || question?.kind === 'ear' || question?.kind === 'chord') {
		const index = Number(event.key) - 1;
		return Number.isInteger(index) && index >= 0 && index < question.options.length ? { do: 'option', index } : null;
	}
	return null;
}

import type { Question } from '#lib/practice/drills/decks.ts';

/** Drills where the question is heard, not read: the next one is a sound of its own. */
export const isHeard = (q: Question) => q.kind === 'ear' || q.kind === 'chord' || q.kind === 'dict';

/** How long a question's sound rings after its last note starts. */
const RING_MS = 1200;
/** Silence between the replayed answer and the next question, so the two don't run together. */
export const PAUSE_MS = 700;

/** Until what a heard question plays has died away (see DrillRound's `sound`). */
export function soundMs(q: Question): number {
	if (q.kind === 'ear') return (q.harmonic ? 0 : 700) + RING_MS;
	if (q.kind === 'chord') return 1600 + RING_MS;
	if (q.kind === 'dict') return (q.options[q.answer].length - 1) * 600 + RING_MS;
	return RING_MS;
}

/**
 * Whether the question is played again after an answer: a rhythm tapped right was just heard,
 * and a wrong one is played as it should be; a heard question only if the member wants it, as
 * the next one follows with a sound of its own; never the pulse, which has no tune.
 */
export function replaysAfter(q: Question, correct: boolean, withSound: boolean, replayHeard: boolean) {
	return withSound && q.kind !== 'pulse' && (q.kind !== 'rhythm' || !correct) && (!isHeard(q) || replayHeard);
}

/**
 * How long a right answer stays before the round goes on by itself, in milliseconds; null
 * when it waits for the member: after a scale, whose notes and cents take a moment to read,
 * after the pulse, and after a wrong answer. A little longer for a new item to look at, taps
 * to see, or the try at a new note; after a replayed heard question once it has died away.
 */
export function autoNextMs(q: Question, correct: boolean, { trying, isNew, replayed }: { trying: boolean; isNew: boolean; replayed: boolean }): number | null {
	if (!correct || q.kind === 'scale' || q.kind === 'pulse') return null;
	const wait = trying ? 2600 : q.kind === 'rhythm' ? 1800 : isNew ? 1600 : 800;
	return replayed && isHeard(q) ? Math.max(wait, soundMs(q) + PAUSE_MS) : wait;
}

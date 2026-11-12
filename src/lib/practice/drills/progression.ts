import type { States } from './scheduler.ts';

/**
 * Progression in the Übebereich (#300): the drills open one after another, each once what it
 * builds on is known, as they're taught. Four stages: the basics (reading notes and keys,
 * rhythm, playing a note); hearing and holding (the mixed daily round, intervals, keeping the
 * pulse); reading and playing (scales, sight-reading, transposing); playing together (entries,
 * tuning in a chord). Known counts what's secure or known at first sight (or by the placement
 * test), so an experienced player gets through quickly. Once open, a drill stays open.
 */

export type DrillCard = 'notes' | 'keys' | 'rhythm' | 'play' | 'mix' | 'ear' | 'pulse' | 'scale' | 'sight' | 'trans' | 'entry' | 'tune';

export const STAGES: DrillCard[][] = [
	['notes', 'keys', 'rhythm', 'play'],
	['mix', 'ear', 'pulse'],
	['scale', 'sight', 'trans'],
	['entry', 'tune']
];

export const stageOf = (card: DrillCard) => STAGES.findIndex((stage) => stage.includes(card));

/** What a drill needs: so many items known of another drill, or a level reached in sight-reading. */
export type Need = { of: 'notes' | 'keys' | 'rhythm' | 'play' | 'ear'; count: number } | { of: 'sightLevel'; count: number };

export const NEEDS: Record<DrillCard, Need[]> = {
	notes: [],
	keys: [],
	rhythm: [],
	play: [],
	mix: [
		{ of: 'notes', count: 5 },
		{ of: 'keys', count: 3 }
	],
	ear: [{ of: 'keys', count: 5 }],
	pulse: [{ of: 'rhythm', count: 5 }],
	scale: [
		{ of: 'keys', count: 5 },
		{ of: 'play', count: 5 }
	],
	sight: [
		{ of: 'notes', count: 9 },
		{ of: 'rhythm', count: 5 }
	],
	trans: [{ of: 'notes', count: 9 }],
	// What sight-reading needs, and a level reached in it: entries are sight-reading with rests to count first.
	entry: [
		{ of: 'notes', count: 9 },
		{ of: 'rhythm', count: 5 },
		{ of: 'sightLevel', count: 2 }
	],
	tune: [
		{ of: 'ear', count: 6 },
		{ of: 'play', count: 5 }
	]
};

/** Items of `order` known: in box 3 or above (secure, or known at first sight). */
export const knownOf = (order: string[], states: States) => order.filter((id) => (states[id]?.box ?? 0) >= 3).length;

export interface CardState {
	open: boolean;
	/** Each need with how far along it is. */
	needs: (Need & { have: number })[];
}

/**
 * Which drills are open. `known` per drill, `sightLevel` reached, `opened` those opened before
 * (they stay open), `used` those with progress already (open whatever the needs say: nobody
 * loses a drill they were practising).
 */
export function progression(
	known: Partial<Record<Need['of'], number>>,
	opened: readonly string[],
	used: (card: DrillCard) => boolean
): Record<DrillCard, CardState> {
	const result = {} as Record<DrillCard, CardState>;
	for (const card of STAGES.flat()) {
		const needs = NEEDS[card].map((need) => ({ ...need, have: Math.min(need.count, known[need.of] ?? 0) }));
		result[card] = { open: opened.includes(card) || used(card) || needs.every((need) => need.have >= need.count), needs };
	}
	return result;
}

/** Drills open now that weren't before, for the announcement. */
export const newlyOpen = (before: readonly string[], now: Record<DrillCard, CardState>) =>
	STAGES.flat().filter((card) => now[card].open && !before.includes(card));

/** The stage reached: the highest with a drill open. */
export const stageReached = (state: Record<DrillCard, CardState>) => STAGES.reduce((reached, stage, i) => (stage.some((card) => state[card].open) ? i : reached), 0);

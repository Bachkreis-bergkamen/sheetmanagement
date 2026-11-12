import { FLUENT_MS, noteId } from './decks.ts';
import type { InstrumentProfile } from './instruments.ts';
import { isMastered, type States } from './scheduler.ts';
import type { Clef } from './theory.ts';

/**
 * Difficulty that grows with the player (#300): an instrument's clefs come one after another,
 * as they are taught. A cellist reads bass clef first; the tenor clef opens once most notes on
 * the bass staff are secure, the treble clef once the tenor's are. A pianist gets both clefs at
 * once. Notes on the staff count, not ledger lines: they are what a new clef builds on.
 */

/** Of the nine lines and spaces of a clef's staff, this many must be secure for the next clef to open. */
export const UNLOCK_AT = 5;
const STAFF = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export interface ClefStep {
	clef: Clef;
	open: boolean;
	/** Secure notes on this clef's staff. */
	mastered: number;
}

/** `opened`: clefs opened before, which stay open when notes slip back (a bad day shouldn't take a clef away). */
export function clefLadder(instrument: InstrumentProfile, states: States, opened: readonly Clef[] = []): ClefStep[] {
	const steps: ClefStep[] = [];
	for (const [i, clef] of instrument.clefs.entries()) {
		const mastered = STAFF.filter((position) => isMastered(states[noteId(clef, position)], FLUENT_MS.notes)).length;
		const before = steps[i - 1];
		const open = i === 0 || !!instrument.together || opened.includes(clef) || (before.open && before.mastered >= UNLOCK_AT);
		steps.push({ clef, open, mastered });
	}
	return steps;
}

export const openClefs = (instrument: InstrumentProfile, states: States, opened: readonly Clef[] = []): Clef[] =>
	clefLadder(instrument, states, opened)
		.filter((step) => step.open)
		.map((step) => step.clef);

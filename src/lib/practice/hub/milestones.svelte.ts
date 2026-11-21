import type { Badge } from '#lib/practice/drills/badges.ts';
import { newlyOpen, type CardState, type DrillCard } from '#lib/practice/drills/progression.ts';
import type { Clef } from '#lib/practice/drills/theory.ts';

/** What the page knows now, read before and after a round. */
export type Standing = {
	/** The clefs open on the ladder. */
	clefs: Clef[];
	/** The drills kept open. */
	unlocked: string[];
	/** Which drills are open now. */
	cards: Record<DrillCard, CardState>;
	/** The drills shown for this instrument. */
	shown: DrillCard[];
	/** The badges this instrument offers, and those earned. */
	badges: Badge[];
	earned: Record<string, string>;
};

/**
 * A clef, drills and badges that opened during the last round or the placement test, to
 * celebrate once it ends: what stood before is remembered as it starts, and compared after.
 */
export class Milestones {
	clef = $state<Clef | null>(null);
	cards = $state<DrillCard[]>([]);
	badges = $state<Badge[]>([]);
	#clefs: Clef[] = [];
	#unlocked: string[] = [];
	#earned: string[] = [];
	#standing: () => Standing;

	constructor(standing: () => Standing) {
		this.#standing = standing;
	}

	/** A round starts: what's open now, and nothing to celebrate yet. */
	remember() {
		const now = this.#standing();
		this.#clefs = [...now.clefs];
		this.#unlocked = [...now.unlocked];
		this.#earned = Object.keys(now.earned);
		this.clef = null;
		this.cards = [];
		this.badges = [];
	}

	/** The round is over: what opened since; the page keeps the drills and badges first. */
	announce() {
		const now = this.#standing();
		this.clef = now.clefs.find((clef) => !this.#clefs.includes(clef)) ?? null;
		this.cards = newlyOpen(this.#unlocked, now.cards).filter((card) => now.shown.includes(card));
		this.badges = now.badges.filter((badge) => now.earned[badge.id] && !this.#earned.includes(badge.id));
	}
}

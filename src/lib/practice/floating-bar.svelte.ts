import { readLocalJson, writeLocalJson } from '#lib/local-storage.ts';

/** The bar at the bottom of the screen, kept per device. */
export const BAR_KEY = 'practice-bar-below';
/** How long the bar stays after the last sign of the player. */
export const QUIET = 3500;

/** What the viewer says about the bar now. */
export type BarRoom = {
	/** Floating over the page: in full screen, not while drawing or answering an offer. */
	floating: boolean;
	/** The page leaves a strip free where the bar fits, so it can stay in view. */
	roomy: boolean;
	/** The keyboard is in the bar; a tapped button keeping focus doesn't count. */
	focused: boolean;
};

/**
 * The practice viewer's controls in full screen (PracticeScore): they float over the top of
 * the page, or the bottom where the player put them, and fade away after a few quiet seconds.
 * A mouse moving, a tap on the small button in the corner or a key into the bar brings them
 * back. Where the page leaves a strip free for them, they stay.
 */
export class FloatingBar {
	bare = $state(false);
	below = $state(readLocalJson(BAR_KEY) === true);
	/** A mouse over the bar keeps it; a finger's tap leaves a "hover" behind on phones, which doesn't. */
	mouseOver = false;
	#room: () => BarRoom;
	#quiet: ReturnType<typeof setTimeout> | undefined;

	constructor(room: () => BarRoom) {
		this.#room = room;
	}

	/** To the other end of the screen, remembered on this device. */
	move() {
		this.below = !this.below;
		writeLocalJson(BAR_KEY, this.below);
	}

	/** Shows the bar, and hides it again once things are quiet. */
	wake() {
		this.bare = false;
		clearTimeout(this.#quiet);
		this.#quiet = setTimeout(() => {
			const { floating, roomy, focused } = this.#room();
			if (floating && !roomy && !this.mouseOver && !focused) this.bare = true;
			else if (floating) this.wake();
		}, QUIET);
	}

	/** Hidden at once, by its own button. */
	hide() {
		clearTimeout(this.#quiet);
		this.bare = true;
	}

	/** Follows the viewer: fading only while floating without room; call it from an effect. */
	follow() {
		const { floating, roomy } = this.#room();
		if (floating && !roomy) this.wake();
		else {
			clearTimeout(this.#quiet);
			this.bare = false;
		}
	}

	stop() {
		clearTimeout(this.#quiet);
	}
}

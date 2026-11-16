/** 1 is the fitted page; up to MAX_ZOOM times that. */
export const MAX_ZOOM = 4;
/** One press of + or −. */
export const ZOOM_STEP = 1.25;
/** How long a pinch rests before the page is drawn sharp at its new zoom. */
export const SETTLE = 250;

/** A zoom between 1 and MAX_ZOOM, in hundredths. */
export function clampZoom(next: number) {
	return Math.round(Math.min(MAX_ZOOM, Math.max(1, next)) * 100) / 100;
}

/**
 * The practice viewer's zoom (PracticeScore): the page is shown at `level` straight away, as
 * the fingers move, and drawn at `drawn`, which follows once they rest, so it isn't drawn
 * again on every step. Keeping the music under the fingers in place is up to the viewer.
 */
export class PageZoom {
	level = $state(1);
	drawn = $state(1);
	#settle: ReturnType<typeof setTimeout> | undefined;

	/** Whether the page is larger than fitted, and so scrolls. */
	get zoomed() {
		return this.level > 1;
	}

	/** Sets the zoom, within its limits; returns whether it changed. */
	set(next: number) {
		const level = clampZoom(next);
		const changed = level !== this.level;
		this.level = level;
		clearTimeout(this.#settle);
		this.#settle = setTimeout(() => (this.drawn = this.level), SETTLE);
		return changed;
	}
}

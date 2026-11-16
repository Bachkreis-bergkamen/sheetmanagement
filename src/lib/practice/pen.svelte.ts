import { shouldIgnoreTouch, thinPoints, type MarkColor, type MarkSymbol, type Stroke } from './marks.ts';
import type { PageMarks } from './page-marks.svelte.ts';

/** Drawing a line, erasing, or placing a symbol with each tap. */
export type PenTool = 'line' | 'eraser' | MarkSymbol;

/** A pointer on the page: `at` is where, 0–1 across and down. */
export type PenPointer = { id: number; type: string; at: [number, number] };

/** How soon after a touch placed a symbol a second finger turns it into a zoom, taking the symbol away. */
export const STAMP_GRACE = 400;

/**
 * The pen in the practice viewer (PracticeScore): the colour and the tool, and the one pointer
 * drawing. A second finger or the palm on the glass doesn't join its line (#235). Once a pen
 * has drawn, fingers don't draw until the pen is turned off and on again, so a resting hand
 * leaves no marks. Where the pointer is on the page is up to the viewer.
 */
export class Pen {
	on = $state(false);
	ink = $state<MarkColor>('graphite');
	tool = $state<PenTool>('line');
	/** The line being drawn, until the pointer lifts. */
	drawing = $state<Stroke | null>(null);
	#marks: PageMarks;
	#page: () => number;
	#pointer: { id: number; type: string } | null = null;
	#penSeen = false;
	#lastStamp: { at: number; type: string } | null = null;

	/** `page`: the page shown, read as the pen touches it. */
	constructor(marks: PageMarks, page: () => number) {
		this.#marks = marks;
		this.#page = page;
	}

	/** On or off; turned off and on again, fingers draw again until a pen does. */
	toggle() {
		if (this.on) this.finish();
		this.#penSeen = false;
		this.on = !this.on;
	}

	/** Off, keeping the line drawn so far, e.g. to look at an offer from the section. */
	stop() {
		this.finish();
		this.on = false;
	}

	/** A colour; it ends the eraser. */
	pick(color: MarkColor) {
		this.ink = color;
		if (this.tool === 'eraser') this.tool = 'line';
	}

	/** The eraser or a symbol, or with the same again back to drawing lines. */
	choose(tool: PenTool) {
		this.tool = this.tool === tool ? 'line' : tool;
	}

	/** A pointer touches the page; returns whether it now draws or erases, to be followed until it lifts. */
	down({ id, type, at }: PenPointer): boolean {
		if (!this.on) return false;
		if (type === 'pen') this.#penSeen = true;
		else if (shouldIgnoreTouch(type, this.on, this.#penSeen)) return false;
		if (this.#pointer) {
			// A pen taking over from the hand it rests on: the hand's line goes.
			if (type !== 'pen' || this.#pointer.type === 'pen') return false;
			this.drawing = null;
		}
		const page = this.#page();
		const tool = this.tool;
		if (tool !== 'line' && tool !== 'eraser') {
			if (this.#marks.add(page, { color: this.ink, points: at, symbol: tool })) this.#lastStamp = { at: Date.now(), type };
			return false;
		}
		this.#pointer = { id, type };
		if (tool === 'eraser') {
			this.#marks.wiping = false;
			this.#marks.erase(page, at);
		} else this.drawing = { color: this.ink, points: at };
		return true;
	}

	/** The drawing pointer moves through `points`; the last is where it is now. */
	move(id: number, points: [number, number][]) {
		if (!this.on || id !== this.#pointer?.id || !points.length) return;
		if (this.tool === 'eraser') return this.#marks.erase(this.#page(), points[points.length - 1]);
		if (!this.drawing) return;
		this.drawing = { ...this.drawing, points: [...this.drawing.points, ...points.flat()] };
	}

	lift(id: number) {
		if (id !== this.#pointer?.id) return;
		this.#pointer = null;
		this.finish();
	}

	/** The line drawn so far goes on the page, e.g. before turning it or printing. */
	finish() {
		this.#marks.wiping = false;
		this.#pointer = null;
		if (!this.drawing) return;
		const stroke = { ...this.drawing, points: thinPoints(this.drawing.points) };
		this.drawing = null;
		this.#marks.add(this.#page(), stroke);
	}

	/**
	 * A second finger makes it a zoom: the first finger's line so far goes, and a symbol its
	 * touch placed a moment ago too.
	 */
	dropTouch() {
		if (this.#pointer?.type === 'touch') {
			this.drawing = null;
			this.#pointer = null;
			this.#marks.wiping = false;
		}
		if (this.#lastStamp?.type === 'touch' && Date.now() - this.#lastStamp.at < STAMP_GRACE) this.#marks.undo(this.#page());
		this.#lastStamp = null;
	}
}

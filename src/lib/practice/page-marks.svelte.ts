import { keepPage, mergeMarks, type KeptPage } from '../offline/marks.ts';
import { MAX_PAGE_POINTS, MAX_STROKES, pagePoints, type Stroke } from './marks.ts';

/** `queued`: drawn offline, kept on the device until it can be sent. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'queued' | 'failed';

/** How long the pen rests before a page's marks are saved. */
export const SAVE_DELAY = 1200;

/**
 * The member's own marks in one part, page by page, in the practice viewer (PracticeScore):
 * each change undoable, saved a moment after the pen stops, and kept on the device when there's
 * no connection, to be sent once it's back. A page holds only so much (MAX_PAGE_POINTS,
 * MAX_STROKES); a mark that doesn't fit is refused until something goes.
 */
export class PageMarks {
	marks = $state<Record<number, Stroke[]>>({});
	/** A mark that didn't fit on the page, until something goes. */
	refused = $state(false);
	saving = $state<SaveState>('idle');
	/** Why the last save failed: the HTTP status, or none when the device was offline. */
	failure = $state('');
	/** Within one wipe of the eraser, which is one undo step. */
	wiping = false;
	#file: () => string;
	#history = new Map<number, Stroke[][]>();
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	/** `file`: the part, read at each save, so a part opened next isn't saved under the last one. */
	constructor(file: () => string) {
		this.#file = file;
	}

	on(page: number): Stroke[] {
		return this.marks[page] ?? [];
	}

	/** How full the page is, 0 to 1: drawn lines fill it, symbols hardly. */
	fullness(page: number) {
		const strokes = this.on(page);
		return Math.max(pagePoints(strokes) / MAX_PAGE_POINTS, strokes.length / MAX_STROKES);
	}

	/** Whether one more mark still fits on the page; says so in `refused`. */
	fits(page: number, stroke: Stroke) {
		const strokes = this.on(page);
		this.refused = strokes.length >= MAX_STROKES || pagePoints(strokes) + stroke.points.length / 2 > MAX_PAGE_POINTS;
		return !this.refused;
	}

	/** The page's marks as given, one undo step back to what they were. */
	change(page: number, next: Stroke[]) {
		const before = this.#history.get(page) ?? [];
		before.push(this.on(page));
		this.#history.set(page, before.slice(-50));
		this.marks = { ...this.marks, [page]: next };
		this.refused = false;
		this.saveSoon(page);
	}

	/** One more mark on the page, if it fits. */
	add(page: number, stroke: Stroke) {
		if (!this.fits(page, stroke)) return false;
		this.change(page, [...this.on(page), stroke]);
		return true;
	}

	undo(page: number) {
		const last = this.#history.get(page)?.pop();
		if (last === undefined) return;
		this.marks = { ...this.marks, [page]: last };
		this.refused = false;
		this.saveSoon(page);
	}

	/** Takes the marks near a point (0–1 across and down) off the page; a whole wipe undoes in one step. */
	erase(page: number, [x, y]: [number, number]) {
		const near = (stroke: Stroke) => {
			for (let i = 0; i < stroke.points.length; i += 2) if (Math.hypot(stroke.points[i] - x, stroke.points[i + 1] - y) < 0.02) return true;
			return false;
		};
		const strokes = this.on(page);
		const kept = strokes.filter((stroke) => !near(stroke));
		if (kept.length === strokes.length) return;
		if (!this.wiping) this.change(page, kept);
		else this.marks = { ...this.marks, [page]: kept };
		this.wiping = true;
		this.saveSoon(page);
	}

	/** Marks from elsewhere that aren't the member's own doing here, e.g. an offer taken over: no undo. */
	assign(pages: Record<number, Stroke[]>) {
		this.marks = { ...this.marks, ...pages };
	}

	/**
	 * What the server has, with what this device kept of it (drawn offline, or a page kept days
	 * ago when offline now). Pages drawn on since opening are newer than either.
	 */
	merge(server: Record<number, Stroke[]>, kept: Record<number, KeptPage>, online: boolean) {
		const next = { ...this.marks };
		for (const [number, strokes] of Object.entries(mergeMarks(server, kept, online))) if (!this.#history.has(Number(number))) next[Number(number)] = strokes;
		this.marks = next;
	}

	/** What was drawn offline has gone to the server. */
	sent() {
		if (this.saving === 'queued') this.saving = 'saved';
	}

	saveSoon(page: number) {
		clearTimeout(this.#timers.get(page));
		this.saving = 'saving';
		this.failure = '';
		this.#timers.set(page, setTimeout(() => this.save(page), SAVE_DELAY));
	}

	async save(page: number, keepalive = false) {
		this.#timers.delete(page);
		const file = this.#file();
		const strokes = this.on(page);
		try {
			const response = await fetch('/api/ueben/notizen', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ file, page, strokes }),
				keepalive
			});
			if (!response.ok) {
				this.failure = String(response.status);
				this.saving = 'failed';
			} else {
				await keepPage(file, page, strokes, false);
				if (!this.#timers.size && this.saving !== 'failed' && this.saving !== 'queued') this.saving = 'saved';
			}
		} catch {
			// No connection: kept on the device and sent once it's back.
			await keepPage(file, page, strokes, true);
			this.failure = '';
			this.saving = 'queued';
		}
	}

	/** Saves what's still waiting now, e.g. before the server reads the member's marks. */
	async flush() {
		await Promise.all([...this.#timers].map(([page, timer]) => (clearTimeout(timer), this.save(page))));
	}

	/** Leaving the page: what's still waiting goes out now, also as the page unloads. */
	leave() {
		for (const [page, timer] of this.#timers) {
			clearTimeout(timer);
			void this.save(page, true);
		}
	}
}

/**
 * When each drill item comes back (#300): a Leitner schedule with two additions from the
 * research on learning. An item moves up a box only when it was answered right *and* fast, so
 * the drills build fluency rather than slow puzzling-out; and new items come in only while the
 * player gets most answers right, which keeps practice near the sweet spot of about 85 %
 * success (Wilson et al. 2019). Wrong answers come back within the same round (retrieval
 * practice), known ones days later (spacing).
 */

export interface ItemState {
	/** 0 learning (just got it wrong), 1 new, up to 6 long known. */
	box: number;
	/** The day (see `dayNumber`) it's due again. */
	due: number;
	seen: number;
	right: number;
	/** Milliseconds of the last few right answers, newest last. */
	times: number[];
}

export type States = Record<string, ItemState>;

/** Days until an item in each box is asked again. */
export const INTERVALS = [0, 1, 2, 4, 8, 16, 32];
export const TOP_BOX = INTERVALS.length - 1;
/** Mastered: this box or higher, with typical answers faster than the drill's fluency time. */
export const MASTERED_BOX = 4;
const TIMES_KEPT = 5;

/** Days since 1970 on this device's calendar, for due dates. */
export const dayNumber = (date = new Date()) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);

export const median = (values: number[]) => {
	if (!values.length) return Infinity;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * The item's state after an answer. Seen for the first time and answered right and fast: the
 * player knew it already, so it goes straight to box 3 (that's how experienced players get past
 * the basics quickly). Right but slow: stays where it is, not yet fluent. Wrong: back to learning.
 */
export function record(state: ItemState | undefined, correct: boolean, ms: number, day: number, fluentMs: number): ItemState {
	const fast = ms <= fluentMs;
	const times = correct ? [...(state?.times ?? []), Math.round(ms)].slice(-TIMES_KEPT) : (state?.times ?? []);
	let box: number;
	if (!correct) box = 0;
	else if (!state) box = fast ? 3 : 1;
	else box = fast ? Math.min(TOP_BOX, Math.max(1, state.box + 1)) : Math.max(1, state.box);
	return { box, due: day + INTERVALS[box], seen: (state?.seen ?? 0) + 1, right: (state?.right ?? 0) + (correct ? 1 : 0), times };
}

export const isMastered = (state: ItemState | undefined, fluentMs: number) => !!state && state.box >= MASTERED_BOX && median(state.times) <= fluentMs;

export interface PickContext {
	/** All items in the order they're introduced. */
	order: string[];
	states: States;
	day: number;
	/** Right or wrong for this round's answers so far, oldest first. */
	answers: boolean[];
	/** The ids asked last, newest last: not asked again right away. */
	recent: string[];
	random?: () => number;
}

/** How many items may be in learning at once before a new one comes in. */
const WORKING_SET = 3;
/** Recent success above which a new item may come in, and below which easier ones are mixed in. */
const INTRODUCE_AT = 0.8;
const EASE_BELOW = 0.7;

/** Success of the last ten answers; 1 before the first. */
export function successRate(answers: boolean[]) {
	const last = answers.slice(-10);
	return last.length ? last.filter(Boolean).length / last.length : 1;
}

/**
 * The next item to ask, and whether it's new. In order of preference: one being learnt (half
 * the time, so it comes back soon but not at once), a new one while things go well, a due one,
 * and else the least known one. When it's going badly, a well known one now and then, so the
 * player keeps succeeding often enough to keep going.
 */
export function pickNext({ order, states, day, answers, recent, random = Math.random }: PickContext): { id: string; isNew: boolean } | null {
	if (!order.length) return null;
	const avoid = new Set(recent.slice(-2));
	const fresh = (id: string) => !avoid.has(id);
	const seen = order.filter((id) => states[id]);
	const unseen = order.filter((id) => !states[id]);
	const learning = seen.filter((id) => states[id].box === 0 && fresh(id));
	const working = seen.filter((id) => states[id].box <= 1).length;
	const rate = successRate(answers);
	const choose = (ids: string[]) => ids[Math.floor(random() * ids.length)];

	if (rate < EASE_BELOW && random() < 0.5) {
		const easy = seen.filter((id) => states[id].box >= 2 && fresh(id));
		if (easy.length) return { id: choose(easy), isNew: false };
	}
	if (learning.length && random() < 0.5) return { id: choose(learning), isNew: false };
	if (unseen.length && (!seen.length || (working < WORKING_SET && rate >= INTRODUCE_AT))) return { id: unseen[0], isNew: true };
	const due = seen.filter((id) => states[id].due <= day && fresh(id));
	if (due.length) {
		// The lower the box, the likelier: items still shaky are practised more.
		const lowest = Math.min(...due.map((id) => states[id].box));
		return { id: choose(due.filter((id) => states[id].box <= lowest + 1)), isNew: false };
	}
	if (learning.length) return { id: choose(learning), isNew: false };
	// Nothing due: the least known of what's been seen keeps getting better.
	const candidates = seen.filter(fresh);
	if (!candidates.length) return unseen.length ? { id: unseen[0], isNew: true } : { id: order[0], isNew: false };
	const lowest = Math.min(...candidates.map((id) => states[id].box));
	return { id: choose(candidates.filter((id) => states[id].box === lowest)), isNew: false };
}

/** Of `order`, how many are mastered and how many due today (seen and due, or being learnt). `fluentMs` per item. */
export function summary(order: string[], states: States, day: number, fluentMs: (id: string) => number) {
	let mastered = 0;
	let due = 0;
	let seen = 0;
	for (const id of order) {
		const state = states[id];
		if (!state) continue;
		seen++;
		if (isMastered(state, fluentMs(id))) mastered++;
		if (state.due <= day) due++;
	}
	return { total: order.length, seen, mastered, due };
}

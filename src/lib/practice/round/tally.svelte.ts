import { ROUND } from '#lib/practice/drills/decks.ts';
import { PULSE_ROUND } from '#lib/practice/drills/rhythm.ts';
import { dayNumber, median, pickNext, roundPoints, type States } from '#lib/practice/drills/scheduler.ts';

/** What the round is drawn from; read each time, as the states change with every answer. */
export type RoundSource = {
	order: string[];
	states: States;
	/** Questions in the round, instead of the usual. */
	length?: number;
	/** The placement test's next question instead of the scheduler's, null when it's over. */
	test?: () => string | null;
	/** A note just beyond the player's range, tried once, as the round's third question. */
	tryNote?: { id: string } | null;
};

export type Pick = { id: string; isNew: boolean; trying: boolean };

/** Questions in a round: fewer for keeping the pulse, where each take lasts half a minute. */
export const roundLength = (order: string[], length?: number) => length ?? (order.length && order.every((id) => id.startsWith('pulse:')) ? PULSE_ROUND : ROUND);

/**
 * The questions of one drill round (DrillRound) and how it went: which comes next, from the
 * scheduler, the placement test or the try at a new note, and the answers, times and new
 * items, for the summary at the end.
 */
export class RoundTally {
	count = $state(0);
	answers = $state<boolean[]>([]);
	/** The times to answer right, of the drills where speed is the point. */
	times = $state<number[]>([]);
	introduced = $state(0);
	/** Right answers only after hearing the question first, worth less in the score (#371). */
	rightAfterHearing = $state(0);
	finished = $state(false);
	#recent: string[] = [];
	#tried = false;
	#source: () => RoundSource;
	#day: number;

	constructor(source: () => RoundSource, day = dayNumber()) {
		this.#source = source;
		this.#day = day;
	}

	get length() {
		const { order, length } = this.#source();
		return roundLength(order, length);
	}

	get right() {
		return this.answers.filter(Boolean).length;
	}

	/** The score, a right answer after hearing it counting half. */
	get points() {
		return roundPoints(this.right, this.rightAfterHearing);
	}

	/** The typical time to answer right, in milliseconds; null before there is one. */
	get typicalMs() {
		return this.times.length ? median(this.times) : null;
	}

	/** The next question's id; null when the round is over. */
	pick(random: () => number = Math.random): Pick | null {
		const { order, states, test, tryNote } = this.#source();
		if (!test && this.count >= this.length) return null;
		const trying = !test && !!tryNote && !this.#tried && this.count >= 2;
		let pick: { id: string; isNew: boolean } | null;
		if (trying) {
			this.#tried = true;
			pick = { id: tryNote!.id, isNew: false };
		} else if (test) {
			const tested = test();
			pick = tested ? { id: tested, isNew: false } : null;
		} else pick = pickNext({ order, states, day: this.#day, answers: this.answers, recent: this.#recent, random });
		return pick && { ...pick, trying };
	}

	/** The picked question is shown; `pick` and showing are apart, as a question may fail to build. */
	shown(pick: Pick) {
		this.#recent = [...this.#recent.slice(-4), pick.id];
		this.count++;
	}

	/**
	 * An answer; `ms` only where the time to answer is the measure of fluency, and `heard` when
	 * it was right only after hearing the question.
	 */
	record(correct: boolean, isNew: boolean, ms?: number, heard = false) {
		this.answers = [...this.answers, correct];
		if (correct && ms !== undefined) this.times = [...this.times, ms];
		if (correct && heard) this.rightAfterHearing++;
		if (isNew) this.introduced++;
	}

	finish() {
		this.finished = true;
	}

	/** Another round, after the summary. */
	restart() {
		this.count = 0;
		this.answers = [];
		this.times = [];
		this.introduced = 0;
		this.rightAfterHearing = 0;
		this.finished = false;
	}
}

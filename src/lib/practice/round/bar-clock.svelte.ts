import type { PlayedBar } from '#lib/practice/drills/sound.ts';

/**
 * What a bar under way is for: the rhythm played as an example, the count-in, taps into the
 * bar, keeping the pulse once the metronome has gone quiet (`alone`), or measuring the
 * device's delay.
 */
export type Phase = 'idle' | 'example' | 'count' | 'tap' | 'alone' | 'calibrate';

/** The phases in which a tap counts. */
const TAPPING: ReadonlySet<Phase> = new Set(['count', 'tap', 'alone', 'calibrate']);

/**
 * The bar playing in a drill round (DrillRound), for rhythms, the pulse, the scale's count-in
 * and measuring the delay: the beat lit as it's heard, the conductor's clock, and the taps
 * into it. Timers are set against the bar's own start, the clock `playBar` reports on.
 */
export class BarClock {
	phase = $state<Phase>('idle');
	/** The beat lit: negative counting in, from 0 in the bar; null between. */
	beat = $state<number | null>(null);
	/** The conductor's clock: when the count-in began, and a beat's length. */
	conduct = $state<{ start: number; ms: number } | null>(null);
	/** Taps so far, shown as the pad flashing. */
	tapped = $state(0);
	#taps: number[] = [];
	#bar: PlayedBar | null = null;
	#timers: ReturnType<typeof setTimeout>[] = [];
	#now: () => number;

	constructor(now: () => number = () => performance.now()) {
		this.#now = now;
	}

	get taps(): readonly number[] {
		return this.#taps;
	}

	get tapping() {
		return TAPPING.has(this.phase);
	}

	/** Stops the bar and its timers; the phase goes back to idle. */
	stop() {
		this.#bar?.stop();
		this.#bar = null;
		this.#timers.forEach(clearTimeout);
		this.#timers = [];
		this.beat = null;
		this.phase = 'idle';
	}

	/** A fresh bar for `phase`: the one before stopped, no taps yet. */
	begin(phase: Phase) {
		this.stop();
		this.#taps = [];
		this.tapped = 0;
		this.phase = phase;
	}

	/** The bar now playing, stopped with the clock. */
	hold(played: PlayedBar) {
		this.#bar = played;
	}

	/** Runs `run` at `time` milliseconds from the bar's first beat (negative in the count-in). */
	at(played: PlayedBar, time: number, run: () => void) {
		this.#timers.push(setTimeout(run, Math.max(0, played.start + time - this.#now())));
	}

	/** The conductor's clock for `played`, from `countIn` beats of `ms` before it. */
	conductFrom(played: PlayedBar, countIn: number, ms: number) {
		this.conduct = { start: played.start - countIn * ms, ms };
	}

	/** Lights the beats as they're heard, `countIn` before the bar and `beats` in it; then `done`, `tail` after. */
	follow(played: PlayedBar, ms: number, countIn: number, beats: number, done: () => void, tail = 0) {
		this.hold(played);
		this.conductFrom(played, countIn, ms);
		for (let i = -countIn; i < beats; i++) this.at(played, i * ms, () => (this.beat = i));
		this.at(played, beats * ms + tail, done);
	}

	/** A tap, timed by the event itself; ignored when no bar is taking taps. */
	tap(time: number) {
		if (!this.tapping) return;
		this.#taps.push(time);
		this.tapped++;
	}
}

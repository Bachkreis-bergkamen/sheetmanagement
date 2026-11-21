import { IN_TUNE, judgeScale, segment, type NoteMark, type Reading, type ScaleVerdict } from '#lib/practice/drills/scales.ts';
import { pitchName } from './feedback.ts';

/** How long the last note sounds before the take is over. */
export const LAST_NOTE_MS = 700;
/** Silence after which a take is over. */
export const SILENCE_MS = 3000;
/** The longest take. */
export const LONGEST_MS = 90_000;

/**
 * One take of a scale in a drill round (DrillRound): from the first note to the last without
 * stopping, judged as it's played from the microphone's readings, and over once the last note
 * has sounded after most of the scale, or after a long silence.
 */
export class ScaleTake {
	/** `count`: the metronome counting in; what's played then is the player getting ready. */
	take = $state<'idle' | 'count' | 'playing'>('idle');
	/** Each note's mark so far while playing, and the verdict's after. */
	marks = $state<NoteMark[]>([]);
	/** The note the microphone hears now, and its cents. */
	heardNow = $state<{ midi: number; cents: number } | null>(null);
	#readings: Reading[] = [];
	#from = 0;
	#lastSound = 0;
	#expected: number[] = [];
	#cheap: (midi: number) => boolean = () => false;
	#a4: number;

	constructor(a4 = 440) {
		this.#a4 = a4;
	}

	/**
	 * A take of `expected` begins at `now`. `cheap`: notes probably the drone through the
	 * speaker, which neither count against the take nor keep it going.
	 */
	begin(expected: number[], cheap: (midi: number) => boolean, now: number) {
		this.#expected = expected;
		this.#cheap = cheap;
		this.#readings = [];
		this.marks = [];
		this.#from = this.#lastSound = now;
		this.take = 'playing';
	}

	get counting() {
		return this.take === 'count';
	}

	/** The metronome counts in first: nothing counts until `listenFrom` says when. */
	countIn() {
		this.take = 'count';
		this.#from = Infinity;
	}

	/** Listening from `from`, the take counted from `start` (its first beat). */
	listenFrom(from: number, start = from) {
		this.#from = from;
		this.#lastSound = start;
	}

	/** One reading from the microphone; true when the take is over. */
	reading(frequency: number | null, time: number): boolean {
		if (this.take === 'idle' || time < this.#from) return false;
		this.#readings.push({ time, frequency });
		if (frequency) {
			const semitones = 69 + 12 * Math.log2(frequency / this.#a4);
			const midi = Math.round(semitones);
			this.heardNow = { midi, cents: Math.round((semitones - midi) * 100) };
			if (!this.#cheap(midi) || this.#expected.includes(midi)) this.#lastSound = time;
		}
		const verdict = this.#judge();
		this.marks = verdict.marks;
		const last = verdict.marks[this.#expected.length - 1];
		const right = verdict.marks.filter((mark) => mark.state === 'right').length;
		const ended = last.state === 'right' && right >= this.#expected.length / 2 && time - last.onset >= LAST_NOTE_MS;
		const silent = this.#readings.some((reading) => reading.frequency) && time - this.#lastSound > SILENCE_MS;
		return ended || silent || time - this.#from > LONGEST_MS;
	}

	/** The take stopped; its readings are kept for the verdict. */
	stop() {
		this.take = 'idle';
		this.heardNow = null;
	}

	/** Judges what was played, and shows its marks. */
	verdict(): ScaleVerdict {
		const verdict = this.#judge();
		this.marks = verdict.marks;
		return verdict;
	}

	/** Back to no marks, for the next question. */
	clear() {
		this.stop();
		this.marks = [];
	}

	#judge() {
		return judgeScale(this.#expected, segment(this.#readings, this.#a4), this.#cheap);
	}
}

/**
 * Each note's colour on the staff: while playing only as far as played, and out of tune only
 * when the tuning is shown (`showTuning`: after the take, or while playing unless cents are kept back).
 */
export function scaleMarks(marks: NoteMark[], answered: boolean, showTuning: boolean): ('right' | 'wrong' | 'off' | null)[] {
	const reached = marks.findLastIndex((mark) => mark && mark.state !== 'missed');
	return marks.map((mark, i) => {
		if (!mark || (!answered && i > reached)) return null;
		if (mark.state !== 'right') return 'wrong';
		return showTuning && Math.abs(mark.cents) > IN_TUNE ? 'off' : 'right';
	});
}

/** Under each note after the take: cents off, the note heard instead, or a dash for one left out. */
export function scaleCaptions(marks: NoteMark[]): string[] {
	return marks.map((mark) => {
		if (!mark) return '';
		if (mark.state === 'missed') return '–';
		if (mark.state === 'wrong') return pitchName(((mark.midi % 12) + 12) % 12);
		return Math.abs(mark.cents) > IN_TUNE ? `${mark.cents > 0 ? '+' : ''}${mark.cents}` : '';
	});
}

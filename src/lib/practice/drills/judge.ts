/**
 * Whether the note a member plays is the one asked for (#315), from the tuner's pitch readings
 * (`detectPitch`, about twelve a second). A note counts once it has been held briefly, so the
 * scrape at the start of a bow stroke or a cracked attack doesn't decide; a wrong note needs to
 * be held a little longer than a right one before it counts, as players often slide into a note.
 */

export type Verdict =
	| { result: 'right'; cents: number }
	| { result: 'wrong'; midi: number; cents: number; octave: boolean };

export interface JudgeOptions {
	/** Concert A in Hz. */
	a4?: number;
	/** How long the right note must sound. */
	holdMs?: number;
	/** How long another note must sound. */
	wrongMs?: number;
}

export class NoteJudge {
	private run: { midi: number; since: number; cents: number[] } | null = null;
	private readonly a4: number;
	private readonly holdMs: number;
	private readonly wrongMs: number;

	constructor(
		/** The sounding MIDI note asked for. */
		private readonly target: number,
		{ a4 = 440, holdMs = 250, wrongMs = 700 }: JudgeOptions = {}
	) {
		this.a4 = a4;
		this.holdMs = holdMs;
		this.wrongMs = wrongMs;
	}

	/** One reading at `time` ms: a frequency, or null for silence. The verdict once there is one. */
	push(frequency: number | null, time: number): Verdict | null {
		if (!frequency) {
			this.run = null;
			return null;
		}
		const semitones = 69 + 12 * Math.log2(frequency / this.a4);
		const midi = Math.round(semitones);
		const cents = Math.round((semitones - midi) * 100);
		if (!this.run || this.run.midi !== midi) this.run = { midi, since: time, cents: [] };
		this.run.cents.push(cents);
		const held = time - this.run.since;
		if (midi === this.target && held >= this.holdMs) return { result: 'right', cents: this.typical() };
		if (midi !== this.target && held >= this.wrongMs) {
			return { result: 'wrong', midi, cents: this.typical(), octave: (midi - this.target) % 12 === 0 };
		}
		return null;
	}

	/** The run's median, so one wobbly reading doesn't make it sound out of tune. */
	private typical() {
		const sorted = [...this.run!.cents].sort((a, b) => a - b);
		return sorted[sorted.length >> 1];
	}
}

/**
 * Rhythm by tapping (#300): a bar is heard, read, and tapped back after a count-in. Each tap is
 * measured against where its note should be, so the feedback can say which note was missed and
 * whether the player rushes or drags. Taps are timed in the browser; nothing is recorded.
 *
 * A pattern is one bar of 4/4 written as durations in sixteenths, a rest prefixed with "r":
 * "4 4 r4 4" is quarter, quarter, quarter rest, quarter. The item id is "rhythm:" and the pattern
 * with dashes for spaces ("rhythm:4-4-r4-4"), so its progress is kept like any other item's.
 */

export interface RhythmEvent {
	/** Length in sixteenths. */
	len: number;
	rest: boolean;
	/** Start in sixteenths from the bar's beginning. */
	at: number;
}

/** Sixteenths in the bar: 4/4. */
export const BAR = 16;

/**
 * The patterns in the order they're learnt: quarters and halves, then eighths, rests, dotted
 * notes, sixteenths, syncopation. Each new one adds a single thing to what came before.
 */
export const PATTERNS = [
	'4 4 4 4',
	'8 8',
	'8 4 4',
	'4 4 8',
	'16',
	'12 4',
	'4 4 r4 4',
	'r4 4 4 4',
	'2 2 4 4 4',
	'4 4 2 2 4',
	'2 2 2 2 2 2 2 2',
	'4 2 2 4 2 2',
	'4 r4 2 2 4',
	'6 2 4 4',
	'4 4 6 2',
	'6 2 6 2',
	'r2 2 4 4 4',
	'4 r2 2 r2 2 4',
	'2 4 2 4 4',
	'2 4 2 2 4 2',
	'1 1 1 1 4 4 4',
	'4 1 1 1 1 4 4',
	'2 1 1 4 2 1 1 4',
	'1 1 2 4 1 1 2 4',
	'3 1 4 3 1 4',
	'3 1 3 1 3 1 3 1',
	'1 2 1 4 1 2 1 4',
	'6 2 2 2 4'
] as const;

export const rhythmId = (pattern: string) => `rhythm:${pattern.replaceAll(' ', '-')}`;
export const RHYTHM_ORDER: string[] = PATTERNS.map(rhythmId);

/** The bar's notes and rests; null when the pattern isn't one bar of 4/4. */
export function parsePattern(pattern: string): RhythmEvent[] | null {
	const events: RhythmEvent[] = [];
	let at = 0;
	for (const token of pattern.trim().split(/[\s-]+/)) {
		const match = /^(r?)(\d+)$/.exec(token);
		const len = match ? Number(match[2]) : 0;
		if (!match || len < 1 || len > BAR) return null;
		events.push({ len, rest: match[1] === 'r', at });
		at += len;
	}
	return at === BAR ? events : null;
}

export const patternOf = (id: string) => (id.startsWith('rhythm:') ? id.slice('rhythm:'.length).replaceAll('-', ' ') : '');

/** When each note starts, in milliseconds from the bar's first beat. */
export const onsets = (events: RhythmEvent[], beatMs: number) => events.filter((event) => !event.rest).map((event) => (event.at / 4) * beatMs);

/**
 * The tempo an item is asked at: slow while it's being learnt, faster once it's known, so a
 * known rhythm stays just beyond comfortable (deliberate practice).
 */
export const tempoFor = (box: number | undefined) => (box === undefined || box < 3 ? 72 : box < 5 ? 84 : 96);

/** Beat in milliseconds. */
export const beatMs = (bpm: number) => 60_000 / bpm;

/**
 * How far off a tap may be and still count, by how well the item is known: a fifth of a beat
 * while learning, less later. Never more than 150 ms.
 */
export const toleranceFor = (box: number | undefined, beat: number) => Math.min(150, beat * (box !== undefined && box >= 3 ? 0.15 : 0.2));

export interface TapVerdict {
	correct: boolean;
	/** Per note: milliseconds the tap was off (positive late), or null when it wasn't tapped. */
	deviations: (number | null)[];
	/** Taps that didn't belong to any note. */
	extra: number[];
	/** Mean absolute deviation of the notes tapped, the measure of how even the playing was. */
	meanOff: number;
	/** Mean signed deviation: positive drags, negative rushes. */
	tendency: number;
}

/**
 * Taps (milliseconds from the bar's first beat, already corrected for the device's latency)
 * against the notes' onsets. Each note takes its nearest tap within its window: `tolerance`, but
 * less than half the way to a neighbouring note, so two fast notes can't share a tap. A tap no
 * note takes is extra. Right means every note tapped in time and nothing extra.
 */
export function judgeTaps(expected: number[], taps: number[], tolerance: number): TapVerdict {
	const sorted = [...taps].sort((a, b) => a - b);
	const used = new Set<number>();
	const deviations = expected.map((onset, i) => {
		const gap = Math.min(i > 0 ? onset - expected[i - 1] : Infinity, i < expected.length - 1 ? expected[i + 1] - onset : Infinity);
		const window = Math.min(tolerance, gap * 0.49);
		let best = -1;
		for (const [j, tap] of sorted.entries()) {
			if (used.has(j) || Math.abs(tap - onset) > window) continue;
			if (best < 0 || Math.abs(tap - onset) < Math.abs(sorted[best] - onset)) best = j;
		}
		if (best < 0) return null;
		used.add(best);
		return sorted[best] - onset;
	});
	const extra = sorted.filter((_, j) => !used.has(j));
	const hit = deviations.filter((deviation): deviation is number => deviation !== null);
	const meanOff = hit.length ? hit.reduce((sum, deviation) => sum + Math.abs(deviation), 0) / hit.length : Infinity;
	const tendency = hit.length ? hit.reduce((sum, deviation) => sum + deviation, 0) / hit.length : 0;
	return { correct: hit.length === expected.length && !extra.length, deviations, extra, meanOff, tendency };
}

/** Mean deviation beyond which the feedback says the player rushes or drags. */
export const LEANING = 30;

/**
 * The device's delay from a click being played to a tap being registered (audio output, touch
 * screen, and the player's own habit), from taps along with clicks: the median offset, if the
 * taps were steady enough to tell. Null when they weren't (fewer than five near a click, or
 * scattered by more than 60 ms).
 */
export function calibrate(clicks: number[], taps: number[]): number | null {
	if (!clicks.length) return null;
	const half = clicks.length > 1 ? (clicks[1] - clicks[0]) / 2 : 300;
	const offsets = taps
		.map((tap) => {
			const nearest = clicks.reduce((best, click) => (Math.abs(tap - click) < Math.abs(tap - best) ? click : best));
			return tap - nearest;
		})
		.filter((offset) => Math.abs(offset) < half);
	if (offsets.length < 5) return null;
	const sorted = offsets.sort((a, b) => a - b);
	const median = sorted[sorted.length >> 1];
	const spread = sorted.map((offset) => Math.abs(offset - median)).sort((a, b) => a - b)[sorted.length >> 1];
	if (spread > 60) return null;
	return Math.round(Math.max(-250, Math.min(250, median)));
}

/** Clicks and taps of the calibration: eight beats at this tempo after a bar's count-in. */
export const CALIBRATION = { bpm: 90, beats: 8 };

/**
 * Keeping the pulse (#300): two bars of quarters with the metronome, a bar in which it fades,
 * then bars of silence in which the player taps on alone; one click comes back at the end, so
 * they hear where the beat really was. Only the silent beats count. Items, "pulse:90:4", are the
 * tempo and the bars of silence: a middle tempo and a short silence first, then longer silences
 * at the tempos hardest to hold, slow and fast.
 */
export const PULSE_ORDER = ['pulse:90:2', 'pulse:72:2', 'pulse:108:2', 'pulse:90:4', 'pulse:63:4', 'pulse:120:4', 'pulse:84:8', 'pulse:60:8', 'pulse:132:8', 'pulse:76:12'];

export const PULSE = {
	/** Bars with the metronome, then the bar it fades in. */
	heard: 2,
	fading: 1
};

/** The tempo and the bars of silence of a pulse item; null if it isn't one. */
export function pulseOf(id: string): { bpm: number; silent: number } | null {
	const match = /^pulse:(\d+):(\d+)$/.exec(id);
	return match ? { bpm: Number(match[1]), silent: Number(match[2]) } : null;
}

/** How loud each beat's click is, counted from the count-in's first: full, fading over a bar, silent, and the one that comes back. */
export function pulseLoudness(beat: number, silent: number, countIn = 4): number {
	const heard = countIn + PULSE.heard * 4;
	if (beat < heard) return 1;
	const fade = beat - heard;
	if (fade < PULSE.fading * 4) return [0.7, 0.45, 0.25, 0.1][fade] ?? 0;
	return beat === heard + PULSE.fading * 4 + silent * 4 ? 1 : 0;
}

/** The first silent beat, counted from the first beat after the count-in. */
export const firstSilent = () => (PULSE.heard + PULSE.fading) * 4;

export interface PulseVerdict extends TapVerdict {
	/** Change of the deviation per bar, from a straight line through the taps: negative speeds up. */
	drift: number;
	/** Where that line ends at the last silent beat, in ms: how far off the player came out. */
	end: number;
}

/**
 * Taps (ms from the first beat after the count-in, corrected for the device) against the silent
 * beats. Each beat's window is wider than for a rhythm (up to 30 % of a beat, at most 180 ms), as
 * a pulse held alone may wander a little and still be held; out of it, it's lost. Right when
 * every silent beat but at most one was tapped and nothing extra.
 */
export function judgePulse(bpm: number, silent: number, taps: number[]): PulseVerdict {
	const beat = beatMs(bpm);
	const from = firstSilent();
	const expected = Array.from({ length: silent * 4 }, (_, i) => (from + i) * beat);
	const window = Math.min(180, beat * 0.3);
	// Taps along with the metronome before, and after the click comes back, aren't judged.
	const inSilence = taps.filter((tap) => tap > expected[0] - beat / 2 && tap < expected[expected.length - 1] + beat / 2);
	const verdict = judgeTaps(expected, inSilence, window);
	const missed = verdict.deviations.filter((deviation) => deviation === null).length;
	// A straight line through the deviations: its slope is the drift, its end where the player came out.
	const points = verdict.deviations.flatMap((deviation, i) => (deviation === null ? [] : [[i, deviation] as const]));
	let slope = 0;
	let intercept = verdict.tendency;
	if (points.length >= 2) {
		const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
		const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
		const spread = points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
		slope = spread ? points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) / spread : 0;
		intercept = meanY - slope * meanX;
	}
	return {
		...verdict,
		correct: missed <= 1 && !verdict.extra.length && points.length > 0,
		drift: slope * 4,
		end: intercept + slope * (expected.length - 1)
	};
}

/** Takes in a round of keeping the pulse: each lasts up to half a minute. */
export const PULSE_ROUND = 6;

/** How far off the end may come out before the feedback says the player sped up or slowed down. */
export const DRIFTED = 50;

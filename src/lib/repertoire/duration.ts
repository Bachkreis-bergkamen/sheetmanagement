/**
 * Piece durations ("Dauer" in "Stücke", #117), as people write them: "7:30", "7'30",
 * "7 Min.", "1:02:00" or a plain number of minutes. Kept as seconds in the app and
 * written back as "m:ss", so the sheet stays easy to read and to sort.
 */

const MAX_SECONDS = 4 * 60 * 60;

/** Seconds, or undefined when the text is empty or not a duration. */
export function parseDuration(text: string | undefined): number | undefined {
	const value = (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
	if (!value) return undefined;
	let seconds: number | undefined;
	// "1:02:00", "7:30", "7.30", "7'30", "7'30''", "7′30″"
	const clock = value.match(/^(?:(\d{1,2}):)?(\d{1,3})\s*[:.'′]\s*(\d{1,2})\s*(?:''|"|″|min\.?)?$/);
	// "7 min", "7 min.", "7 minuten", "ca. 7 min", "7,5 min", "7"
	const minutes = value.match(/^(?:ca\.? ?|~ ?)?(\d{1,3}(?:[.,]\d+)?) ?(?:m|min\.?|minuten)?$/);
	// "7 min 30 s", "7 min. 30 sek."
	const both = value.match(/^(\d{1,3}) ?(?:m|min\.?|minuten) ?(\d{1,2}) ?(?:s|sek\.?|sekunden)?$/);
	if (clock) {
		const [hours, mins, secs] = [Number(clock[1] ?? 0), Number(clock[2]), Number(clock[3])];
		if (secs < 60 && (!clock[1] || mins < 60)) seconds = hours * 3600 + mins * 60 + secs;
	} else if (both) {
		if (Number(both[2]) < 60) seconds = Number(both[1]) * 60 + Number(both[2]);
	} else if (minutes) {
		seconds = Math.round(Number(minutes[1].replace(',', '.')) * 60);
	}
	return seconds && seconds > 0 && seconds <= MAX_SECONDS ? seconds : undefined;
}

/** 450 → "7:30", 3720 → "1:02:00". */
export function formatDuration(seconds: number): string {
	const s = Math.round(seconds);
	const pad = (n: number) => String(n).padStart(2, '0');
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	return hours ? `${hours}:${pad(minutes)}:${pad(s % 60)}` : `${minutes}:${pad(s % 60)}`;
}

/** Whole minutes, rounded, at least 1: what a programme's "ca. 74 Min." says. */
export const roundMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

export interface ProgramLength {
	/** Sum of the known durations. */
	seconds: number;
	/** Pieces in the programme without a duration. */
	missing: number;
	/** Pieces with one. */
	known: number;
}

/** The length of a programme from its pieces' durations (seconds, or undefined when unknown). */
export function programLength(durations: (number | undefined)[]): ProgramLength {
	let seconds = 0;
	let known = 0;
	for (const duration of durations) {
		if (duration) {
			seconds += duration;
			known++;
		}
	}
	return { seconds, known, missing: durations.length - known };
}

/**
 * Seconds into the programme each piece starts, from the durations of those before it (#411):
 * for the moderation sheet. Undefined from the first unknown duration on, since a guess would mislead.
 */
export function startTimes(durations: (number | undefined)[]): (number | undefined)[] {
	let at: number | undefined = 0;
	return durations.map((duration) => {
		const start = at;
		at = at !== undefined && duration ? at + duration : undefined;
		return start;
	});
}

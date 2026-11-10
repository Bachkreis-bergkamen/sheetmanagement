/**
 * Practice time ("Probenzeit"): how long a member had a part of their own instrument open in
 * the app's practice viewer. Opt-in on /profil, kept per day in D1 and shown only to the member.
 */

/** One day's practice, "2026-10-24" in the orchestra's time zone. */
export interface PracticeDay {
	day: string;
	seconds: number;
}

/** How often the viewer reports, and the most one report may add. */
export const BEAT_SECONDS = 30;
export const MAX_BEAT_SECONDS = 60;
/** No touch, scroll or key for this long: the member has probably put the instrument away. */
export const IDLE_MINUTES = 20;
/**
 * After that, the viewer asks "Noch am Üben?" (#304): a touch within this many minutes counts the
 * time since the pause began too, as someone playing from one page doesn't touch the device.
 */
export const GRACE_MINUTES = 15;
/** The most one report may add for time kept on the device while offline (#304): one opening's worth. */
export const MAX_QUEUED_SECONDS = 3 * 3600;
/** One opened part counts for at most this long; opening it again starts afresh. */
export const SESSION_HOURS = 3;
/** More than this in one day is a tab left open, not practice. */
export const DAY_CAP_SECONDS = 12 * 3600;

/** What one report adds: whole seconds between 0 and the most a report may add. */
export function beatSeconds(value: unknown, max = MAX_BEAT_SECONDS): number {
	const seconds = typeof value === 'number' ? value : Number.NaN;
	return Number.isFinite(seconds) ? Math.max(0, Math.min(max, Math.round(seconds))) : 0;
}

const HOUR = 3600;

/** The tree's stages: a seed, a seedling at 10 h, a small tree at 25 h, then a bigger, older tree every 20 h. */
export const SEEDLING_HOURS = 10;
export const SAPLING_HOURS = SEEDLING_HOURS + 15;
export const TREE_STEP_HOURS = 20;

export type TreeKind = 'seed' | 'seedling' | 'sapling' | 'tree';

export interface TreeStage {
	kind: TreeKind;
	/** 0 seed, 1 seedling, 2 small tree, 3 the first big tree, and one more every 20 h. */
	level: number;
	/** For the big tree: 1, 2, 3 … (its "age"); 0 before. */
	age: number;
	/** Where this stage started and the next one starts, in seconds. */
	from: number;
	next: number;
	/** 0 to 1 on the way to the next stage. */
	progress: number;
}

/** Seconds of practice at which a level starts. */
export function levelStart(level: number): number {
	if (level <= 0) return 0;
	if (level === 1) return SEEDLING_HOURS * HOUR;
	return (SAPLING_HOURS + (level - 2) * TREE_STEP_HOURS) * HOUR;
}

export function treeStage(seconds: number): TreeStage {
	const total = Math.max(0, seconds);
	let level = 0;
	if (total >= levelStart(2)) level = 2 + Math.floor((total - levelStart(2)) / (TREE_STEP_HOURS * HOUR));
	else if (total >= levelStart(1)) level = 1;
	const from = levelStart(level);
	const next = levelStart(level + 1);
	const kind: TreeKind = level === 0 ? 'seed' : level === 1 ? 'seedling' : level === 2 ? 'sapling' : 'tree';
	return { kind, level, age: Math.max(0, level - 2), from, next, progress: (total - from) / (next - from) };
}

/** Days as "YYYY-MM-DD", counted in UTC so no time zone or summer time shifts them. */
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
	const date = toDate(day);
	date.setUTCDate(date.getUTCDate() + days);
	return toDay(date);
}

/** The Monday of the day's week. */
export function weekStart(day: string): string {
	return addDays(day, -((toDate(day).getUTCDay() + 6) % 7));
}

export interface Period {
	/** The first day, "2026-10-19"; a month's is its 1st. */
	start: string;
	days: PracticeDay[];
	total: number;
}

function period(byDay: Map<string, number>, start: string, length: number): Period {
	const days = Array.from({ length }, (_, i) => {
		const day = addDays(start, i);
		return { day, seconds: byDay.get(day) ?? 0 };
	});
	return { start, days, total: days.reduce((sum, day) => sum + day.seconds, 0) };
}

const indexed = (days: PracticeDay[]) => {
	const byDay = new Map<string, number>();
	for (const { day, seconds } of days) byDay.set(day, (byDay.get(day) ?? 0) + seconds);
	return byDay;
};

/** Monday to Sunday of the week `offset` weeks before (negative) or after the one with `today`. */
export function practiceWeek(days: PracticeDay[], today: string, offset = 0): Period {
	return period(indexed(days), addDays(weekStart(today), offset * 7), 7);
}

/** Every day of the month `offset` months before or after today's. */
export function practiceMonth(days: PracticeDay[], today: string, offset = 0): Period {
	const first = toDate(`${today.slice(0, 7)}-01`);
	first.setUTCMonth(first.getUTCMonth() + offset);
	const start = toDay(first);
	const after = new Date(first);
	after.setUTCMonth(after.getUTCMonth() + 1);
	return period(indexed(days), start, Math.round((after.getTime() - first.getTime()) / 86_400_000));
}

export const totalSeconds = (days: PracticeDay[]) => days.reduce((sum, day) => sum + day.seconds, 0);

/**
 * Counts the time a part is open in front of the member: only while the page is visible, not
 * after IDLE_MINUTES without a touch, scroll or key, and at most SESSION_HOURS per opening.
 * Time while paused is held for GRACE_MINUTES: a touch within that counts it after all (#304).
 * Times are in milliseconds; tick() runs every few seconds, and a long gap between ticks (the
 * device slept) adds nothing.
 */
export class PracticeClock {
	counted = 0;
	private pending = 0;
	/** Visible time since the pause began, counted if the member comes back within the grace. */
	private held = 0;
	private lastTick: number;
	private lastActivity: number;

	constructor(
		now: number,
		private readonly tickMs = 5000
	) {
		this.lastTick = now;
		this.lastActivity = now;
	}

	activity(now: number) {
		if (this.held && this.inGrace(now)) this.add(this.held);
		this.held = 0;
		this.lastActivity = now;
	}

	/** Paused, but a touch now still counts the pause. */
	inGrace(now: number): boolean {
		return this.idle(now) && now - this.lastActivity < (IDLE_MINUTES + GRACE_MINUTES) * 60_000;
	}

	idle(now: number): boolean {
		return now - this.lastActivity >= IDLE_MINUTES * 60_000;
	}

	full(): boolean {
		return this.counted >= SESSION_HOURS * 3600_000;
	}

	tick(now: number, visible: boolean) {
		const gap = now - this.lastTick;
		this.lastTick = now;
		if (!visible || this.full() || gap <= 0 || gap > this.tickMs * 3) return;
		if (!this.idle(now)) this.add(gap);
		else if (this.inGrace(now)) this.held += gap;
		else this.held = 0;
	}

	private add(ms: number) {
		const add = Math.min(ms, SESSION_HOURS * 3600_000 - this.counted);
		this.counted += add;
		this.pending += add;
	}

	/** The whole seconds counted since the last call, at most what one report may add; the rest stays for the next. */
	take(): number {
		const seconds = Math.min(MAX_BEAT_SECONDS, Math.floor(this.pending / 1000));
		this.pending -= seconds * 1000;
		return seconds;
	}
}

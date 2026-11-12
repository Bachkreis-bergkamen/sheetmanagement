import { isSkill, type DayStats } from './progress.ts';

/**
 * What a member may share from the Übebereich (#300), and only if they choose to: a summary
 * per day and skill (how many answers, how many right, how long), never the answers themselves,
 * the notes they played or anything the microphone heard. Three separate choices:
 * - `board`: the weekly board of their orchestra, which counts days practised, not skill;
 * - `leaders`: the conductor and teachers (the right "ueben.begleiten") see their summary;
 * - `parents`: their parents see it in the parents' area.
 * A young player (someone a parent account names as its child) appears on the board and to the
 * leaders only once a parent has allowed it as well. Nothing is sent while all three are off,
 * and turning them all off deletes what was sent.
 */

export interface Sharing {
	board: boolean;
	leaders: boolean;
	parents: boolean;
}

export const NO_SHARING: Sharing = { board: false, leaders: false, parents: false };
export const sharesAny = (sharing: Sharing | null | undefined) => !!sharing && (sharing.board || sharing.leaders || sharing.parents);

/** A sharing choice read from a request; anything else is off. */
export const readSharing = (value: unknown): Sharing => {
	const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
	return { board: raw.board === true, leaders: raw.leaders === true, parents: raw.parents === true };
};

/**
 * What of a member's choice holds: for a young player, the board and the leaders only with a
 * parent's consent. Their own parents may always see it once they share it with them.
 */
export function effectiveSharing(sharing: Sharing | null, child: boolean, parentAllowed: boolean): Sharing {
	if (!sharing) return NO_SHARING;
	const allowed = !child || parentAllowed;
	return { board: sharing.board && allowed, leaders: sharing.leaders && allowed, parents: sharing.parents };
}

/** One day's summary of one skill. */
export interface SummaryRow {
	day: string;
	skill: string;
	answers: number;
	right: number;
	seconds: number;
}

/** Days sent back each time, so a day practised offline arrives once the device is online again. */
export const SYNC_DAYS = 28;
/** Skill name for days kept before skills were counted. */
export const OTHER_SKILL = 'other';
/** A day's summary is capped like practice time: nobody practises drills for more than this. */
const MAX_SECONDS = 6 * 3600;
const MAX_ANSWERS = 5000;

const dayKeyUtc = (date: Date) => date.toISOString().slice(0, 10);
/** `day` plus `by` days, on dates as "2026-11-12". */
export const shiftDay = (day: string, by: number) => {
	const date = new Date(`${day}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + by);
	return dayKeyUtc(date);
};

/** The device's days as rows per skill, the last SYNC_DAYS up to `today`. */
export function summaryRows(days: Record<string, DayStats>, today: string, count = SYNC_DAYS): SummaryRow[] {
	const since = shiftDay(today, -(count - 1));
	const rows: SummaryRow[] = [];
	for (const [day, stats] of Object.entries(days)) {
		if (day < since || day > today || !stats.answers) continue;
		const skills = Object.entries(stats.skills ?? {});
		const counted = skills.reduce((sum, [, each]) => sum + each.answers, 0);
		for (const [skill, each] of skills) if (each.answers) rows.push({ day, skill, answers: each.answers, right: each.right, seconds: Math.round(each.ms / 1000) });
		// What was practised before skills were counted, on that day.
		const rest = stats.answers - counted;
		if (rest > 0) {
			const ms = stats.ms - skills.reduce((sum, [, each]) => sum + each.ms, 0);
			const right = stats.right - skills.reduce((sum, [, each]) => sum + each.right, 0);
			rows.push({ day, skill: OTHER_SKILL, answers: rest, right: Math.max(0, right), seconds: Math.max(0, Math.round(ms / 1000)) });
		}
	}
	return rows.sort((a, b) => a.day.localeCompare(b.day) || a.skill.localeCompare(b.skill));
}

/** Rows from a request, checked: dates in the window up to `today`, known shapes, sane numbers. Null if malformed. */
export function readRows(value: unknown, today: string): SummaryRow[] | null {
	if (!Array.isArray(value) || value.length > SYNC_DAYS * 20) return null;
	const since = shiftDay(today, -SYNC_DAYS);
	// A day ahead allows for a device in another time zone.
	const until = shiftDay(today, 1);
	const rows: SummaryRow[] = [];
	for (const raw of value) {
		const row = raw as Partial<SummaryRow> | null;
		if (!row || typeof row.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !isSkill(row.skill)) return null;
		if (row.day < since || row.day > until) continue;
		const int = (number: unknown, max: number) => (Number.isFinite(number) ? Math.max(0, Math.min(max, Math.round(number as number))) : null);
		const answers = int(row.answers, MAX_ANSWERS);
		const right = int(row.right, MAX_ANSWERS);
		const seconds = int(row.seconds, MAX_SECONDS);
		if (answers === null || right === null || seconds === null) return null;
		rows.push({ day: row.day, skill: row.skill, answers, right: Math.min(right, answers), seconds });
	}
	return rows;
}

/** Monday to Sunday of the week `day` is in. */
export function weekOf(day: string): string[] {
	const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
	const monday = shiftDay(day, -weekday);
	return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}

/** The weekly challenge: practise on this many days. Reachable by anyone, at any level. */
export const CHALLENGE_DAYS = 5;

export interface BoardEntry {
	name: string;
	days: number;
	met: boolean;
	me: boolean;
	/** Place by days; the same days share a place. */
	place: number;
}

/**
 * The weekly board: who practised on how many days this week. It counts regular practice, not
 * how good anyone is, so a beginner who practises every day is at the top. First names only.
 */
export function boardOf(people: { email: string; name: string }[], rows: { email: string; day: string }[], week: string[], me: string): BoardEntry[] {
	const days = new Map<string, Set<string>>();
	for (const row of rows) if (week.includes(row.day)) days.set(row.email, (days.get(row.email) ?? new Set()).add(row.day));
	const entries = people.map((person) => {
		const count = days.get(person.email)?.size ?? 0;
		return { name: firstName(person.name), days: count, met: count >= CHALLENGE_DAYS, me: person.email === me, place: 0 };
	});
	entries.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
	entries.forEach((entry, i) => (entry.place = i && entries[i - 1].days === entry.days ? entries[i - 1].place : i + 1));
	return entries;
}

/** "Mia" of "Mia Beispiel": enough among the orchestra, less on a shared screen. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export interface Overview {
	/** Days practised in the window. */
	days: number;
	minutes: number;
	answers: number;
	/** Share right, 0 to 1; null without answers. */
	right: number | null;
	/** The last day practised. */
	last: string | null;
	/** Per skill, most practised first. */
	skills: { skill: string; answers: number; right: number | null; minutes: number }[];
	/** Days practised in each of the last four weeks, oldest first. */
	weeks: number[];
}

/** One member's summary over the last four weeks up to `today`, as leaders and parents see it. */
export function overviewOf(rows: SummaryRow[], today: string): Overview {
	const since = shiftDay(today, -(SYNC_DAYS - 1));
	const recent = rows.filter((row) => row.day >= since && row.day <= today);
	const days = [...new Set(recent.map((row) => row.day))].sort();
	const answers = recent.reduce((sum, row) => sum + row.answers, 0);
	const right = recent.reduce((sum, row) => sum + row.right, 0);
	const bySkill = new Map<string, { answers: number; right: number; seconds: number }>();
	for (const row of recent) {
		const each = bySkill.get(row.skill) ?? { answers: 0, right: 0, seconds: 0 };
		bySkill.set(row.skill, { answers: each.answers + row.answers, right: each.right + row.right, seconds: each.seconds + row.seconds });
	}
	const weeks = [3, 2, 1, 0].map((back) => {
		const from = shiftDay(today, -(back * 7 + 6));
		const to = shiftDay(today, -back * 7);
		return days.filter((day) => day >= from && day <= to).length;
	});
	return {
		days: days.length,
		minutes: Math.round(recent.reduce((sum, row) => sum + row.seconds, 0) / 60),
		answers,
		right: answers ? right / answers : null,
		last: days.at(-1) ?? null,
		skills: [...bySkill]
			.map(([skill, each]) => ({ skill, answers: each.answers, right: each.answers ? each.right / each.answers : null, minutes: Math.round(each.seconds / 60) }))
			.sort((a, b) => b.answers - a.answers || a.skill.localeCompare(b.skill)),
		weeks
	};
}

/**
 * Dienste for concerts and other dates (#298, #196): the jobs a date needs, such as setting up
 * chairs, the cake stand or the box office, each with how many people it needs, and who took
 * which place. Members take a free place themselves; organisers set the jobs up, can put
 * people down, and see over a season who did how many. Kept in D1 next to the date's id.
 */

/** One job on one date: "Aufbau, 17:00–18:00, 3 people". */
export interface DutySlot {
	id: string;
	/** The calendar event it belongs to. */
	eventId: string;
	/** The event's day and title when the job was last saved, so past dates read without the calendar. */
	eventDay: string;
	eventTitle: string;
	/** "Aufbau", "Kuchenverkauf", "Abendkasse". */
	task: string;
	/** "17:00"; both optional, "to" only with "from". */
	from?: string;
	to?: string;
	/** How many people it needs, 1 to 50. */
	needed: number;
	/** "Stühle aus dem Keller, Pulte aus Raum 112". */
	note?: string;
	createdAt: string;
}

/** What a job is, without where it hangs: the form's values, and a template's lines. */
export type DutyJob = Pick<DutySlot, 'task' | 'from' | 'to' | 'needed' | 'note'>;
export type NewDutySlot = DutyJob & Pick<DutySlot, 'eventId' | 'eventDay' | 'eventTitle'>;

/** One person on one job. */
export interface DutyTake {
	slotId: string;
	eventId: string;
	email: string;
	name: string;
	/** Who put them down, when it wasn't themselves. */
	by?: string;
	createdAt: string;
}

/** A set of jobs used again, like "Konzert in der Aula". */
export interface DutyTemplate {
	id: string;
	name: string;
	jobs: DutyJob[];
	createdAt: string;
}

export const MAX_NEEDED = 50;

type Checked<T, P extends string> = { values: T } | { problem: P };

const text = (data: FormData, key: string, max: number) => String(data.get(key) ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** "17", "17:30", "17.30", "9:05" as "HH:MM"; null for anything else, "" when empty. */
export function parseTime(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return '';
	const match = /^(\d{1,2})(?:[:.](\d{2}))?(?:\s*uhr)?$/i.exec(trimmed);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2] ?? '0');
	if (hours > 23 || minutes > 59) return null;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export type JobProblem = 'task-missing' | 'bad-time' | 'to-before-from' | 'bad-needed';

/** A job from the organiser's form: what, when on the day, how many people, and a note. */
export function jobFromForm(data: FormData): Checked<DutyJob, JobProblem> {
	const task = text(data, 'task', 100);
	if (!task) return { problem: 'task-missing' };
	const from = parseTime(String(data.get('from') ?? ''));
	const to = parseTime(String(data.get('to') ?? ''));
	if (from === null || to === null || (to && !from)) return { problem: 'bad-time' };
	// A job that ends past midnight isn't one a school concert has.
	if (from && to && to <= from) return { problem: 'to-before-from' };
	const neededText = String(data.get('needed') ?? '').trim();
	const needed = neededText === '' ? 1 : Number(neededText);
	if (!Number.isInteger(needed) || needed < 1 || needed > MAX_NEEDED) return { problem: 'bad-needed' };
	const note = text(data, 'note', 500);
	return { values: { task, ...(from ? { from } : {}), ...(to ? { to } : {}), needed, ...(note ? { note } : {}) } };
}

/** "17:00–18:30", "ab 17:00" or nothing. */
export function jobTime(job: Pick<DutyJob, 'from' | 'to'>, startsAt: (time: string) => string): string {
	if (!job.from) return '';
	return job.to ? `${job.from}–${job.to}` : startsAt(job.from);
}

/** In the order of the day: timed jobs by start, then the rest as they were added. */
export function sortSlots<T extends Pick<DutySlot, 'from' | 'createdAt'>>(slots: T[]): T[] {
	return [...slots].sort((a, b) => {
		if (!!a.from !== !!b.from) return a.from ? -1 : 1;
		return (a.from ?? '').localeCompare(b.from ?? '') || a.createdAt.localeCompare(b.createdAt);
	});
}

/** Who has a job, in the order they came, and how many places are still free. */
export function placesOf(slot: Pick<DutySlot, 'id' | 'needed'>, takes: DutyTake[]) {
	const on = takes.filter((take) => take.slotId === slot.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return { on, free: Math.max(0, slot.needed - on.length) };
}

/** Free places over all jobs of a date, and how many it needs in all. */
export function eventPlaces(slots: DutySlot[], takes: DutyTake[]) {
	return slots.reduce(
		(sum, slot) => {
			const { on, free } = placesOf(slot, takes);
			return { needed: sum.needed + slot.needed, taken: sum.taken + Math.min(on.length, slot.needed), free: sum.free + free };
		},
		{ needed: 0, taken: 0, free: 0 }
	);
}

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** How far ahead open places count as urgent for the organisers. */
export const SOON_DAYS = 14;

/** Dates from today on within two weeks that still have free places, the nearest first. */
export function urgentDuties(slots: DutySlot[], takes: DutyTake[], today: string, days = SOON_DAYS) {
	const last = addDays(today, days);
	const byEvent = new Map<string, DutySlot[]>();
	for (const slot of slots) if (slot.eventDay >= today && slot.eventDay <= last) byEvent.set(slot.eventId, [...(byEvent.get(slot.eventId) ?? []), slot]);
	return [...byEvent.values()]
		.map((mine) => ({ eventId: mine[0].eventId, eventDay: mine[0].eventDay, eventTitle: mine[0].eventTitle, free: eventPlaces(mine, takes).free }))
		.filter((one) => one.free > 0)
		.sort((a, b) => a.eventDay.localeCompare(b.eventDay));
}

/** Per person, how many jobs they did between two days, the most first; for spreading the work. */
export function dutyCounts(slots: DutySlot[], takes: DutyTake[], period: { from: string; to: string }) {
	const inside = new Map(slots.filter((slot) => slot.eventDay >= period.from && slot.eventDay <= period.to).map((slot) => [slot.id, slot]));
	const people = new Map<string, { email: string; name: string; count: number; tasks: string[] }>();
	for (const take of takes) {
		const slot = inside.get(take.slotId);
		if (!slot) continue;
		const person = people.get(take.email) ?? { email: take.email, name: take.name, count: 0, tasks: [] };
		person.count += 1;
		person.name = take.name;
		person.tasks.push(slot.task);
		people.set(take.email, person);
	}
	return [...people.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** A template from a date's jobs: what, when and how many, without who. */
export const jobsOf = (slots: DutySlot[]): DutyJob[] =>
	sortSlots(slots).map(({ task, from, to, needed, note }) => ({ task, ...(from ? { from } : {}), ...(to ? { to } : {}), needed, ...(note ? { note } : {}) }));

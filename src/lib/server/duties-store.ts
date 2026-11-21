import type { DutyJob, DutySlot, DutyTake, DutyTemplate, NewDutySlot, NewRide, Ride } from '#lib/duties/duties.ts';
import type { D1 } from './db/sql.ts';

/**
 * Where the Dienste for dates are kept (#298): in D1 with plain SQL on a deployment, in memory
 * for the demo and tests; both behave the same, and the tests run the SQL against SQLite.
 */
export interface DutyStore {
	/** Every job of every date; few enough to read whole. */
	slots(): Promise<DutySlot[]>;
	slotsOf(eventId: string): Promise<DutySlot[]>;
	slot(id: string): Promise<DutySlot | null>;
	addSlot(slot: NewDutySlot, now?: string): Promise<DutySlot>;
	updateSlot(id: string, job: DutyJob): Promise<void>;
	/** The job and everyone on it. */
	removeSlot(id: string): Promise<void>;
	/** The calendar's title and day of a date, when they changed there. */
	renameEvent(eventId: string, day: string, title: string): Promise<void>;

	takes(): Promise<DutyTake[]>;
	takesOf(eventId: string): Promise<DutyTake[]>;
	takesBy(email: string): Promise<DutyTake[]>;
	/** Puts someone on a job, unless it's full, gone, or they're on it already. */
	take(slotId: string, person: { email: string; name: string; by?: string }, now?: string): Promise<'taken' | 'full' | 'already' | 'gone'>;
	/** Takes someone off a job; false when they weren't on it. */
	leave(slotId: string, email: string): Promise<boolean>;
	/** Marks a place as up for taking over, or not any more; false when they weren't on it. */
	offer(slotId: string, email: string, offered: boolean): Promise<boolean>;
	/** Someone takes over a place that was offered; refused when it wasn't, or they're on the job already. */
	takeOver(slotId: string, from: string, person: { email: string; name: string }, now?: string): Promise<'taken' | 'gone' | 'already'>;

	/** An organiser asked to remind everyone without a job on this date; the reminders job sends it. */
	nudge(eventId: string, by: string, now?: string): Promise<void>;
	nudges(): Promise<{ eventId: string; by: string; requestedAt: string }[]>;

	/** Every ride offered or asked for, by date; few enough to read whole. */
	rides(): Promise<Ride[]>;
	ridesOf(eventId: string): Promise<Ride[]>;
	addRide(ride: NewRide, now?: string): Promise<Ride>;
	/** Only one's own; false when it isn't theirs or is gone. */
	removeRide(id: string, email: string): Promise<boolean>;

	templates(): Promise<DutyTemplate[]>;
	/** Saved under its name: one with the same name is replaced. */
	saveTemplate(name: string, jobs: DutyJob[], now?: string): Promise<DutyTemplate>;
	removeTemplate(id: string): Promise<void>;

	/** How many jobs and rides carry this address; for "Mitglied löschen" (#158). */
	countBy(email: string): Promise<number>;
	/** Their places and rides go: a job someone left is free again, and the count per person drops them. */
	forget(email: string): Promise<void>;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS duty_slots (
		id TEXT PRIMARY KEY,
		event_id TEXT NOT NULL,
		event_day TEXT NOT NULL,
		event_title TEXT NOT NULL,
		task TEXT NOT NULL,
		from_time TEXT,
		to_time TEXT,
		needed INTEGER NOT NULL,
		note TEXT,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS duty_slots_event ON duty_slots (event_id)`,
	`CREATE TABLE IF NOT EXISTS duty_takes (
		slot_id TEXT NOT NULL,
		event_id TEXT NOT NULL,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		by_email TEXT,
		offered INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		PRIMARY KEY (slot_id, email)
	)`,
	`CREATE INDEX IF NOT EXISTS duty_takes_event ON duty_takes (event_id)`,
	`CREATE INDEX IF NOT EXISTS duty_takes_email ON duty_takes (email)`,
	`CREATE TABLE IF NOT EXISTS duty_templates (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL UNIQUE,
		jobs TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS duty_nudges (
		event_id TEXT PRIMARY KEY,
		by_email TEXT NOT NULL,
		requested_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS duty_rides (
		id TEXT PRIMARY KEY,
		event_id TEXT NOT NULL,
		event_day TEXT NOT NULL,
		event_title TEXT NOT NULL,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		kind TEXT NOT NULL,
		from_place TEXT NOT NULL,
		seats INTEGER NOT NULL,
		note TEXT,
		created_at TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS duty_rides_event ON duty_rides (event_id)`
];

interface SlotRow {
	id: string;
	event_id: string;
	event_day: string;
	event_title: string;
	task: string;
	from_time: string | null;
	to_time: string | null;
	needed: number;
	note: string | null;
	created_at: string;
}

interface TakeRow {
	slot_id: string;
	event_id: string;
	email: string;
	name: string;
	by_email: string | null;
	offered: number;
	created_at: string;
}

interface RideRow {
	id: string;
	event_id: string;
	event_day: string;
	event_title: string;
	email: string;
	name: string;
	kind: string;
	from_place: string;
	seats: number;
	note: string | null;
	created_at: string;
}

interface TemplateRow {
	id: string;
	name: string;
	jobs: string;
	created_at: string;
}

const toSlot = (row: SlotRow): DutySlot => ({
	id: row.id,
	eventId: row.event_id,
	eventDay: row.event_day,
	eventTitle: row.event_title,
	task: row.task,
	...(row.from_time ? { from: row.from_time } : {}),
	...(row.to_time ? { to: row.to_time } : {}),
	needed: row.needed,
	...(row.note ? { note: row.note } : {}),
	createdAt: row.created_at
});

const toTake = (row: TakeRow): DutyTake => ({
	slotId: row.slot_id,
	eventId: row.event_id,
	email: row.email,
	name: row.name,
	...(row.by_email ? { by: row.by_email } : {}),
	...(row.offered ? { offered: true } : {}),
	createdAt: row.created_at
});

const toRide = (row: RideRow): Ride => ({
	id: row.id,
	eventId: row.event_id,
	eventDay: row.event_day,
	eventTitle: row.event_title,
	email: row.email,
	name: row.name,
	kind: row.kind as Ride['kind'],
	from: row.from_place,
	seats: row.seats,
	...(row.note ? { note: row.note } : {}),
	createdAt: row.created_at
});

const toTemplate = (row: TemplateRow): DutyTemplate => ({ id: row.id, name: row.name, jobs: JSON.parse(row.jobs) as DutyJob[], createdAt: row.created_at });

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const SLOT_ORDER = 'ORDER BY event_day, from_time IS NULL, from_time, created_at';
const TAKE_ORDER = 'ORDER BY created_at';

export class SqlDutyStore implements DutyStore {
	#ready: Promise<void> | null = null;

	constructor(private readonly db: D1) {}

	/** The tables are made on first use, so a new D1 database needs no setup step. */
	private ready(): Promise<void> {
		this.#ready ??= (async () => {
			for (const statement of SCHEMA) await this.db.prepare(statement).run();
		})().catch((cause) => {
			this.#ready = null;
			throw cause;
		});
		return this.#ready;
	}

	async slots(): Promise<DutySlot[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM duty_slots ${SLOT_ORDER}`).all<SlotRow>();
		return results.map(toSlot);
	}

	async slotsOf(eventId: string): Promise<DutySlot[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM duty_slots WHERE event_id = ? ${SLOT_ORDER}`).bind(eventId).all<SlotRow>();
		return results.map(toSlot);
	}

	async slot(id: string): Promise<DutySlot | null> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM duty_slots WHERE id = ?').bind(id).first<SlotRow>();
		return row ? toSlot(row) : null;
	}

	async addSlot(slot: NewDutySlot, now = new Date().toISOString()): Promise<DutySlot> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO duty_slots (id, event_id, event_day, event_title, task, from_time, to_time, needed, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(id, slot.eventId, slot.eventDay, slot.eventTitle, slot.task, slot.from ?? null, slot.to ?? null, slot.needed, slot.note ?? null, now)
			.run();
		return toSlot({ id, event_id: slot.eventId, event_day: slot.eventDay, event_title: slot.eventTitle, task: slot.task, from_time: slot.from ?? null, to_time: slot.to ?? null, needed: slot.needed, note: slot.note ?? null, created_at: now });
	}

	async updateSlot(id: string, job: DutyJob): Promise<void> {
		await this.ready();
		await this.db
			.prepare('UPDATE duty_slots SET task = ?, from_time = ?, to_time = ?, needed = ?, note = ? WHERE id = ?')
			.bind(job.task, job.from ?? null, job.to ?? null, job.needed, job.note ?? null, id)
			.run();
	}

	async removeSlot(id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM duty_takes WHERE slot_id = ?').bind(id).run();
		await this.db.prepare('DELETE FROM duty_slots WHERE id = ?').bind(id).run();
	}

	async renameEvent(eventId: string, day: string, title: string): Promise<void> {
		await this.ready();
		await this.db.prepare('UPDATE duty_slots SET event_day = ?, event_title = ? WHERE event_id = ?').bind(day, title, eventId).run();
		await this.db.prepare('UPDATE duty_rides SET event_day = ?, event_title = ? WHERE event_id = ?').bind(day, title, eventId).run();
	}

	async takes(): Promise<DutyTake[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM duty_takes ${TAKE_ORDER}`).all<TakeRow>();
		return results.map(toTake);
	}

	async takesOf(eventId: string): Promise<DutyTake[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM duty_takes WHERE event_id = ? ${TAKE_ORDER}`).bind(eventId).all<TakeRow>();
		return results.map(toTake);
	}

	async takesBy(email: string): Promise<DutyTake[]> {
		await this.ready();
		const { results } = await this.db.prepare(`SELECT * FROM duty_takes WHERE email = ? ${TAKE_ORDER}`).bind(email).all<TakeRow>();
		return results.map(toTake);
	}

	async take(slotId: string, person: { email: string; name: string; by?: string }, now = new Date().toISOString()) {
		await this.ready();
		const slot = await this.slot(slotId);
		if (!slot) return 'gone' as const;
		if (await this.db.prepare('SELECT 1 FROM duty_takes WHERE slot_id = ? AND email = ?').bind(slotId, person.email).first()) return 'already' as const;
		// One statement, so two people taking the last place at once can't both get it.
		await this.db
			.prepare(
				`INSERT OR IGNORE INTO duty_takes (slot_id, event_id, email, name, by_email, created_at)
				SELECT ?, ?, ?, ?, ?, ?
				WHERE (SELECT COUNT(*) FROM duty_takes WHERE slot_id = ?) < (SELECT needed FROM duty_slots WHERE id = ?)`
			)
			.bind(slotId, slot.eventId, person.email, person.name, person.by ?? null, now, slotId, slotId)
			.run();
		const row = await this.db.prepare('SELECT 1 FROM duty_takes WHERE slot_id = ? AND email = ?').bind(slotId, person.email).first();
		return row ? ('taken' as const) : ('full' as const);
	}

	async leave(slotId: string, email: string): Promise<boolean> {
		await this.ready();
		const on = await this.db.prepare('SELECT 1 FROM duty_takes WHERE slot_id = ? AND email = ?').bind(slotId, email).first();
		if (!on) return false;
		await this.db.prepare('DELETE FROM duty_takes WHERE slot_id = ? AND email = ?').bind(slotId, email).run();
		return true;
	}

	async offer(slotId: string, email: string, offered: boolean): Promise<boolean> {
		await this.ready();
		const on = await this.db.prepare('SELECT 1 FROM duty_takes WHERE slot_id = ? AND email = ?').bind(slotId, email).first();
		if (!on) return false;
		await this.db.prepare('UPDATE duty_takes SET offered = ? WHERE slot_id = ? AND email = ?').bind(offered ? 1 : 0, slotId, email).run();
		return true;
	}

	async takeOver(slotId: string, from: string, person: { email: string; name: string }, now = new Date().toISOString()) {
		await this.ready();
		if (await this.db.prepare('SELECT 1 FROM duty_takes WHERE slot_id = ? AND email = ?').bind(slotId, person.email).first()) return 'already' as const;
		// One statement, so two people taking over the same place can't both get it.
		await this.db
			.prepare(
				`UPDATE duty_takes SET email = ?, name = ?, by_email = NULL, offered = 0, created_at = ?
				WHERE slot_id = ? AND email = ? AND offered = 1
				AND NOT EXISTS (SELECT 1 FROM duty_takes WHERE slot_id = ? AND email = ?)`
			)
			.bind(person.email, person.name, now, slotId, from, slotId, person.email)
			.run();
		const row = await this.db.prepare('SELECT 1 FROM duty_takes WHERE slot_id = ? AND email = ?').bind(slotId, person.email).first();
		return row ? ('taken' as const) : ('gone' as const);
	}

	async nudge(eventId: string, by: string, now = new Date().toISOString()): Promise<void> {
		await this.ready();
		await this.db
			.prepare('INSERT INTO duty_nudges (event_id, by_email, requested_at) VALUES (?, ?, ?) ON CONFLICT (event_id) DO UPDATE SET by_email = excluded.by_email, requested_at = excluded.requested_at')
			.bind(eventId, by, now)
			.run();
	}

	async nudges() {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM duty_nudges').all<{ event_id: string; by_email: string; requested_at: string }>();
		return results.map((row) => ({ eventId: row.event_id, by: row.by_email, requestedAt: row.requested_at }));
	}

	async rides(): Promise<Ride[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM duty_rides ORDER BY event_day, created_at').all<RideRow>();
		return results.map(toRide);
	}

	async ridesOf(eventId: string): Promise<Ride[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM duty_rides WHERE event_id = ? ORDER BY created_at').bind(eventId).all<RideRow>();
		return results.map(toRide);
	}

	async addRide(ride: NewRide, now = new Date().toISOString()): Promise<Ride> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO duty_rides (id, event_id, event_day, event_title, email, name, kind, from_place, seats, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(id, ride.eventId, ride.eventDay, ride.eventTitle, ride.email, ride.name, ride.kind, ride.from, ride.seats, ride.note ?? null, now)
			.run();
		const { note, ...rest } = ride;
		return { ...rest, ...(note ? { note } : {}), id, createdAt: now };
	}

	async removeRide(id: string, email: string): Promise<boolean> {
		await this.ready();
		const row = await this.db.prepare('SELECT 1 FROM duty_rides WHERE id = ? AND email = ?').bind(id, email).first();
		if (!row) return false;
		await this.db.prepare('DELETE FROM duty_rides WHERE id = ? AND email = ?').bind(id, email).run();
		return true;
	}

	async templates(): Promise<DutyTemplate[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM duty_templates ORDER BY name').all<TemplateRow>();
		return results.map(toTemplate);
	}

	async saveTemplate(name: string, jobs: DutyJob[], now = new Date().toISOString()): Promise<DutyTemplate> {
		await this.ready();
		const id = newId();
		await this.db
			.prepare('INSERT INTO duty_templates (id, name, jobs, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET jobs = excluded.jobs')
			.bind(id, name, JSON.stringify(jobs), now)
			.run();
		const row = await this.db.prepare('SELECT * FROM duty_templates WHERE name = ?').bind(name).first<TemplateRow>();
		return toTemplate(row!);
	}

	async removeTemplate(id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM duty_templates WHERE id = ?').bind(id).run();
	}

	async countBy(email: string): Promise<number> {
		await this.ready();
		const row = await this.db
			.prepare('SELECT (SELECT COUNT(*) FROM duty_takes WHERE email = ?) + (SELECT COUNT(*) FROM duty_rides WHERE email = ?) AS n')
			.bind(email, email)
			.first<{ n: number }>();
		return row?.n ?? 0;
	}

	async forget(email: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM duty_takes WHERE email = ?').bind(email).run();
		await this.db.prepare('DELETE FROM duty_rides WHERE email = ?').bind(email).run();
	}
}

export class MemoryDutyStore implements DutyStore {
	private jobs = new Map<string, DutySlot>();
	private people: DutyTake[] = [];
	private kept = new Map<string, DutyTemplate>();
	private asked = new Map<string, { eventId: string; by: string; requestedAt: string }>();
	private lifts: Ride[] = [];

	private ordered(slots: DutySlot[]) {
		return slots
			.map((slot) => structuredClone(slot))
			.sort((a, b) => a.eventDay.localeCompare(b.eventDay) || (!!a.from !== !!b.from ? (a.from ? -1 : 1) : 0) || (a.from ?? '').localeCompare(b.from ?? '') || a.createdAt.localeCompare(b.createdAt));
	}

	private copies(takes: DutyTake[]) {
		return takes.map((take) => structuredClone(take)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	async slots() {
		return this.ordered([...this.jobs.values()]);
	}

	async slotsOf(eventId: string) {
		return this.ordered([...this.jobs.values()].filter((slot) => slot.eventId === eventId));
	}

	async slot(id: string) {
		const slot = this.jobs.get(id);
		return slot ? structuredClone(slot) : null;
	}

	async addSlot(slot: NewDutySlot, now = new Date().toISOString()) {
		const { from, to, note, ...rest } = slot;
		const added: DutySlot = { ...rest, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(note ? { note } : {}), id: newId(), createdAt: now };
		this.jobs.set(added.id, added);
		return structuredClone(added);
	}

	async updateSlot(id: string, job: DutyJob) {
		const old = this.jobs.get(id);
		if (!old) return;
		const { from: _, to: __, note: ___, ...kept } = old;
		this.jobs.set(id, { ...kept, task: job.task, needed: job.needed, ...(job.from ? { from: job.from } : {}), ...(job.to ? { to: job.to } : {}), ...(job.note ? { note: job.note } : {}) });
	}

	async removeSlot(id: string) {
		this.jobs.delete(id);
		this.people = this.people.filter((take) => take.slotId !== id);
	}

	async renameEvent(eventId: string, day: string, title: string) {
		for (const slot of this.jobs.values()) if (slot.eventId === eventId) Object.assign(slot, { eventDay: day, eventTitle: title });
		for (const ride of this.lifts) if (ride.eventId === eventId) Object.assign(ride, { eventDay: day, eventTitle: title });
	}

	async takes() {
		return this.copies(this.people);
	}

	async takesOf(eventId: string) {
		return this.copies(this.people.filter((take) => take.eventId === eventId));
	}

	async takesBy(email: string) {
		return this.copies(this.people.filter((take) => take.email === email));
	}

	async take(slotId: string, person: { email: string; name: string; by?: string }, now = new Date().toISOString()) {
		const slot = this.jobs.get(slotId);
		if (!slot) return 'gone' as const;
		if (this.people.some((take) => take.slotId === slotId && take.email === person.email)) return 'already' as const;
		if (this.people.filter((take) => take.slotId === slotId).length >= slot.needed) return 'full' as const;
		const { by, ...who } = person;
		this.people.push({ slotId, eventId: slot.eventId, ...who, ...(by ? { by } : {}), createdAt: now });
		return 'taken' as const;
	}

	async leave(slotId: string, email: string) {
		const before = this.people.length;
		this.people = this.people.filter((take) => !(take.slotId === slotId && take.email === email));
		return this.people.length < before;
	}

	async offer(slotId: string, email: string, offered: boolean) {
		const take = this.people.find((one) => one.slotId === slotId && one.email === email);
		if (!take) return false;
		if (offered) take.offered = true;
		else delete take.offered;
		return true;
	}

	async takeOver(slotId: string, from: string, person: { email: string; name: string }, now = new Date().toISOString()) {
		if (this.people.some((one) => one.slotId === slotId && one.email === person.email)) return 'already' as const;
		const take = this.people.find((one) => one.slotId === slotId && one.email === from && one.offered);
		if (!take) return 'gone' as const;
		this.people = this.people.filter((one) => one !== take);
		this.people.push({ slotId, eventId: take.eventId, ...person, createdAt: now });
		return 'taken' as const;
	}

	async nudge(eventId: string, by: string, now = new Date().toISOString()) {
		this.asked.set(eventId, { eventId, by, requestedAt: now });
	}

	async nudges() {
		return [...this.asked.values()].map((one) => ({ ...one }));
	}

	async rides() {
		return this.lifts.map((ride) => structuredClone(ride)).sort((a, b) => a.eventDay.localeCompare(b.eventDay) || a.createdAt.localeCompare(b.createdAt));
	}

	async ridesOf(eventId: string) {
		return (await this.rides()).filter((ride) => ride.eventId === eventId);
	}

	async addRide(ride: NewRide, now = new Date().toISOString()) {
		const { note, ...rest } = ride;
		const added: Ride = { ...rest, ...(note ? { note } : {}), id: newId(), createdAt: now };
		this.lifts.push(added);
		return structuredClone(added);
	}

	async removeRide(id: string, email: string) {
		const before = this.lifts.length;
		this.lifts = this.lifts.filter((ride) => !(ride.id === id && ride.email === email));
		return this.lifts.length < before;
	}

	async templates() {
		return [...this.kept.values()].map((template) => structuredClone(template)).sort((a, b) => a.name.localeCompare(b.name));
	}

	async saveTemplate(name: string, jobs: DutyJob[], now = new Date().toISOString()) {
		const old = [...this.kept.values()].find((template) => template.name === name);
		const saved: DutyTemplate = old ? { ...old, jobs: structuredClone(jobs) } : { id: newId(), name, jobs: structuredClone(jobs), createdAt: now };
		this.kept.set(saved.id, saved);
		return structuredClone(saved);
	}

	async removeTemplate(id: string) {
		this.kept.delete(id);
	}

	async countBy(email: string) {
		return this.people.filter((take) => take.email === email).length + this.lifts.filter((ride) => ride.email === email).length;
	}

	async forget(email: string) {
		this.people = this.people.filter((take) => take.email !== email);
		this.lifts = this.lifts.filter((ride) => ride.email !== email);
	}
}

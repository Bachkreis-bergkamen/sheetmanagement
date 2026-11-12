import type { SqlDatabase } from './polls-store.ts';
import type { NewTrip, Participant, PlanItem, Trip } from '#lib/trips/trips.ts';
import { slugFor } from '#lib/trips/trips.ts';

/**
 * Where Konzert- and Probenfahrten (#334) are kept: in D1 with plain SQL on a deployment,
 * in memory for the demo and tests; both behave the same, and the tests run the SQL against
 * SQLite. Never in the sheet: who comes along, their notes and later their lists are personal.
 */
export interface TripStore {
	/** Every trip, the next one first. */
	list(): Promise<Trip[]>;
	get(id: string): Promise<Trip | null>;
	create(trip: NewTrip, by: string, now?: string): Promise<Trip>;
	/** Changes what the form edits; the slug and the attached events stay. */
	update(id: string, trip: NewTrip): Promise<void>;
	/** The calendar events that belong to the trip. */
	setEvents(id: string, eventIds: string[]): Promise<void>;
	/** The trip with its participants and plan. */
	remove(id: string): Promise<void>;

	/** Everyone who answered, cancelled ones too, in the order they signed up. */
	participants(tripId: string): Promise<Participant[]>;
	/** One row per person and trip: signing up again replaces it. */
	saveParticipant(participant: Participant): Promise<void>;
	removeParticipant(tripId: string, email: string): Promise<void>;

	/** The trip's plan, by day and time. */
	plan(tripId: string): Promise<PlanItem[]>;
	/** Adds an item, or replaces the one with its id. */
	savePlanItem(item: PlanItem): Promise<void>;
	removePlanItem(tripId: string, id: string): Promise<void>;

	/** A person's sign-ups with their trips; for their data export (#158). */
	participationsOf(email: string): Promise<{ trip: Trip; participant: Participant }[]>;
	/** How many sign-ups and organiser places carry this address; for "Mitglied löschen". */
	countBy(email: string): Promise<number>;
	/** Deletes the person's sign-ups and puts a pseudonym where they organised or confirmed (#158). */
	forget(email: string, stand: { email: string }): Promise<void>;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS trips (
		id TEXT PRIMARY KEY,
		slug TEXT NOT NULL UNIQUE,
		title TEXT NOT NULL,
		kind TEXT NOT NULL,
		first_day TEXT NOT NULL,
		last_day TEXT NOT NULL,
		data TEXT NOT NULL,
		created_by TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS trip_participants (
		trip_id TEXT NOT NULL,
		email TEXT NOT NULL,
		name TEXT NOT NULL,
		role TEXT NOT NULL,
		status TEXT NOT NULL,
		data TEXT NOT NULL,
		signed_up_at TEXT NOT NULL,
		PRIMARY KEY (trip_id, email)
	)`,
	`CREATE INDEX IF NOT EXISTS trip_participants_email ON trip_participants (email)`,
	`CREATE TABLE IF NOT EXISTS trip_plan (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL,
		day TEXT NOT NULL,
		start TEXT,
		data TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS trip_plan_trip ON trip_plan (trip_id, day)`
];

interface TripRow {
	id: string;
	slug: string;
	title: string;
	kind: string;
	first_day: string;
	last_day: string;
	data: string;
	created_by: string;
	created_at: string;
}

interface ParticipantRow {
	trip_id: string;
	email: string;
	name: string;
	role: string;
	status: string;
	data: string;
	signed_up_at: string;
}

interface PlanRow {
	id: string;
	trip_id: string;
	day: string;
	start: string | null;
	data: string;
}

/** What doesn't get a column of its own: lists and the optional fields. */
type TripData = Pick<Trip, 'orchestras' | 'organisers' | 'stops' | 'eventIds' | 'note' | 'signupUntil' | 'cap'>;

const tripData = (trip: NewTrip, eventIds: string[]): TripData => ({
	orchestras: trip.orchestras,
	organisers: trip.organisers,
	stops: trip.stops,
	eventIds,
	...(trip.note ? { note: trip.note } : {}),
	...(trip.signupUntil ? { signupUntil: trip.signupUntil } : {}),
	...(trip.cap ? { cap: trip.cap } : {})
});

const toTrip = (row: TripRow): Trip => ({
	id: row.id,
	slug: row.slug,
	title: row.title,
	kind: row.kind as Trip['kind'],
	firstDay: row.first_day,
	lastDay: row.last_day,
	...(JSON.parse(row.data) as TripData),
	createdBy: row.created_by,
	createdAt: row.created_at
});

const toParticipant = (row: ParticipantRow): Participant => ({
	tripId: row.trip_id,
	email: row.email,
	name: row.name,
	role: row.role as Participant['role'],
	status: row.status as Participant['status'],
	...JSON.parse(row.data),
	signedUpAt: row.signed_up_at
});

const participantData = ({ arrival, departure, note, parentConfirmedBy, parentConfirmedAt }: Participant) =>
	JSON.stringify({ arrival, departure, note, parentConfirmedBy, parentConfirmedAt });

const toPlanItem = (row: PlanRow): PlanItem => ({ id: row.id, tripId: row.trip_id, day: row.day, ...(row.start ? { start: row.start } : {}), ...JSON.parse(row.data) });

const planData = ({ end, title, kind, place, audience, note }: PlanItem) => JSON.stringify({ end, title, kind, place, audience, note });

export const newTripId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** By first day, then name; the same order in both stores. */
const byDays = (a: Trip, b: Trip) => a.firstDay.localeCompare(b.firstDay) || a.title.localeCompare(b.title);
const byTime = (a: PlanItem, b: PlanItem) => a.day.localeCompare(b.day) || (a.start ?? '').localeCompare(b.start ?? '') || a.id.localeCompare(b.id);

export class SqlTripStore implements TripStore {
	#ready: Promise<void> | null = null;

	constructor(private readonly db: SqlDatabase) {}

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

	async list(): Promise<Trip[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trips').all<TripRow>();
		return results.map(toTrip).sort(byDays);
	}

	async get(id: string): Promise<Trip | null> {
		await this.ready();
		const row = await this.db.prepare('SELECT * FROM trips WHERE id = ?').bind(id).first<TripRow>();
		return row ? toTrip(row) : null;
	}

	async create(trip: NewTrip, by: string, now = new Date().toISOString()): Promise<Trip> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT slug FROM trips').all<{ slug: string }>();
		const created: Trip = { ...trip, id: newTripId(), slug: slugFor(trip.title, trip.firstDay, results.map((row) => row.slug)), eventIds: [], createdBy: by, createdAt: now };
		await this.db
			.prepare('INSERT INTO trips (id, slug, title, kind, first_day, last_day, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(created.id, created.slug, created.title, created.kind, created.firstDay, created.lastDay, JSON.stringify(tripData(trip, [])), by, now)
			.run();
		return created;
	}

	async update(id: string, trip: NewTrip): Promise<void> {
		const known = await this.get(id);
		if (!known) return;
		await this.db
			.prepare('UPDATE trips SET title = ?, kind = ?, first_day = ?, last_day = ?, data = ? WHERE id = ?')
			.bind(trip.title, trip.kind, trip.firstDay, trip.lastDay, JSON.stringify(tripData(trip, known.eventIds)), id)
			.run();
	}

	async setEvents(id: string, eventIds: string[]): Promise<void> {
		const known = await this.get(id);
		if (!known) return;
		await this.db
			.prepare('UPDATE trips SET data = ? WHERE id = ?')
			.bind(JSON.stringify(tripData(known, [...new Set(eventIds)])), id)
			.run();
	}

	async remove(id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_plan WHERE trip_id = ?').bind(id).run();
		await this.db.prepare('DELETE FROM trip_participants WHERE trip_id = ?').bind(id).run();
		await this.db.prepare('DELETE FROM trips WHERE id = ?').bind(id).run();
	}

	async participants(tripId: string): Promise<Participant[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trip_participants WHERE trip_id = ? ORDER BY signed_up_at, email').bind(tripId).all<ParticipantRow>();
		return results.map(toParticipant);
	}

	async saveParticipant(participant: Participant): Promise<void> {
		await this.ready();
		await this.db
			.prepare(
				`INSERT INTO trip_participants (trip_id, email, name, role, status, data, signed_up_at) VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (trip_id, email) DO UPDATE SET name = excluded.name, role = excluded.role, status = excluded.status, data = excluded.data, signed_up_at = excluded.signed_up_at`
			)
			.bind(participant.tripId, participant.email, participant.name, participant.role, participant.status, participantData(participant), participant.signedUpAt)
			.run();
	}

	async removeParticipant(tripId: string, email: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_participants WHERE trip_id = ? AND email = ?').bind(tripId, email).run();
	}

	async plan(tripId: string): Promise<PlanItem[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trip_plan WHERE trip_id = ?').bind(tripId).all<PlanRow>();
		return results.map(toPlanItem).sort(byTime);
	}

	async savePlanItem(item: PlanItem): Promise<void> {
		await this.ready();
		await this.db
			.prepare(
				`INSERT INTO trip_plan (id, trip_id, day, start, data) VALUES (?, ?, ?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET day = excluded.day, start = excluded.start, data = excluded.data`
			)
			.bind(item.id, item.tripId, item.day, item.start ?? null, planData(item))
			.run();
	}

	async removePlanItem(tripId: string, id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_plan WHERE trip_id = ? AND id = ?').bind(tripId, id).run();
	}

	async participationsOf(email: string) {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trip_participants WHERE email = ? ORDER BY signed_up_at').bind(email).all<ParticipantRow>();
		const found = await Promise.all(results.map(async (row) => ({ trip: await this.get(row.trip_id), participant: toParticipant(row) })));
		return found.filter((entry): entry is { trip: Trip; participant: Participant } => !!entry.trip);
	}

	async countBy(email: string): Promise<number> {
		const [own, trips] = await Promise.all([this.participationsOf(email), this.list()]);
		return own.length + trips.filter((trip) => trip.organisers.includes(email) || trip.createdBy === email).length;
	}

	async forget(email: string, stand: { email: string }): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_participants WHERE email = ?').bind(email).run();
		// Confirmed for a child: the confirmation stays, without the parent's address.
		const { results } = await this.db.prepare('SELECT * FROM trip_participants').all<ParticipantRow>();
		for (const participant of results.map(toParticipant).filter((p) => p.parentConfirmedBy === email)) {
			await this.saveParticipant({ ...participant, parentConfirmedBy: stand.email });
		}
		for (const trip of await this.list()) {
			if (!trip.organisers.includes(email) && trip.createdBy !== email) continue;
			const organisers = trip.organisers.filter((other) => other !== email);
			await this.db
				.prepare('UPDATE trips SET data = ?, created_by = ? WHERE id = ?')
				.bind(JSON.stringify(tripData({ ...trip, organisers }, trip.eventIds)), trip.createdBy === email ? stand.email : trip.createdBy, trip.id)
				.run();
		}
	}
}

export class MemoryTripStore implements TripStore {
	#trips = new Map<string, Trip>();
	#participants: Participant[] = [];
	#plan = new Map<string, PlanItem>();
	readonly #copy = <T>(value: T): T => structuredClone(value);

	async list(): Promise<Trip[]> {
		return [...this.#trips.values()].map(this.#copy).sort(byDays);
	}

	async get(id: string): Promise<Trip | null> {
		const trip = this.#trips.get(id);
		return trip ? this.#copy(trip) : null;
	}

	async create(trip: NewTrip, by: string, now = new Date().toISOString()): Promise<Trip> {
		const slugs = [...this.#trips.values()].map((other) => other.slug);
		const created: Trip = { ...tripData(trip, []), title: trip.title, kind: trip.kind, firstDay: trip.firstDay, lastDay: trip.lastDay, id: newTripId(), slug: slugFor(trip.title, trip.firstDay, slugs), createdBy: by, createdAt: now };
		this.#trips.set(created.id, created);
		return this.#copy(created);
	}

	async update(id: string, trip: NewTrip): Promise<void> {
		const known = this.#trips.get(id);
		if (known) this.#trips.set(id, { ...tripData(trip, known.eventIds), title: trip.title, kind: trip.kind, firstDay: trip.firstDay, lastDay: trip.lastDay, id, slug: known.slug, createdBy: known.createdBy, createdAt: known.createdAt });
	}

	async setEvents(id: string, eventIds: string[]): Promise<void> {
		const known = this.#trips.get(id);
		if (known) known.eventIds = [...new Set(eventIds)];
	}

	async remove(id: string): Promise<void> {
		this.#trips.delete(id);
		this.#participants = this.#participants.filter((p) => p.tripId !== id);
		for (const [key, item] of this.#plan) if (item.tripId === id) this.#plan.delete(key);
	}

	async participants(tripId: string): Promise<Participant[]> {
		return this.#participants
			.filter((p) => p.tripId === tripId)
			.sort((a, b) => a.signedUpAt.localeCompare(b.signedUpAt) || a.email.localeCompare(b.email))
			.map(this.#copy);
	}

	async saveParticipant(participant: Participant): Promise<void> {
		// Undefined fields dropped, as the JSON column drops them.
		const clean = JSON.parse(JSON.stringify(participant)) as Participant;
		this.#participants = [...this.#participants.filter((p) => !(p.tripId === participant.tripId && p.email === participant.email)), clean];
	}

	async removeParticipant(tripId: string, email: string): Promise<void> {
		this.#participants = this.#participants.filter((p) => !(p.tripId === tripId && p.email === email));
	}

	async plan(tripId: string): Promise<PlanItem[]> {
		return [...this.#plan.values()].filter((item) => item.tripId === tripId).sort(byTime).map(this.#copy);
	}

	async savePlanItem(item: PlanItem): Promise<void> {
		this.#plan.set(item.id, JSON.parse(JSON.stringify(item)));
	}

	async removePlanItem(tripId: string, id: string): Promise<void> {
		if (this.#plan.get(id)?.tripId === tripId) this.#plan.delete(id);
	}

	async participationsOf(email: string) {
		return this.#participants
			.filter((p) => p.email === email && this.#trips.has(p.tripId))
			.sort((a, b) => a.signedUpAt.localeCompare(b.signedUpAt))
			.map((participant) => ({ trip: this.#copy(this.#trips.get(participant.tripId)!), participant: this.#copy(participant) }));
	}

	async countBy(email: string): Promise<number> {
		return (await this.participationsOf(email)).length + [...this.#trips.values()].filter((trip) => trip.organisers.includes(email) || trip.createdBy === email).length;
	}

	async forget(email: string, stand: { email: string }): Promise<void> {
		this.#participants = this.#participants.filter((p) => p.email !== email);
		for (const participant of this.#participants) if (participant.parentConfirmedBy === email) participant.parentConfirmedBy = stand.email;
		for (const trip of this.#trips.values()) {
			trip.organisers = trip.organisers.filter((other) => other !== email);
			if (trip.createdBy === email) trip.createdBy = stand.email;
		}
	}
}

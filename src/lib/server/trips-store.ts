import type { SqlDatabase } from './polls-store.ts';
import type { Instrument, KeptList, ListEntry, ListKind } from '#lib/trips/lists.ts';
import { DEFAULT_LISTS } from '#lib/trips/lists.ts';
import type { NewTrip, Participant, PlanItem, Trip, TripPicture, TripPlace } from '#lib/trips/trips.ts';
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
	/** What was looked up for the trip's places: their pictures, where they are, the flags. */
	setLookups(id: string, found: Lookups): Promise<void>;
	/** The trip with its participants, plan and lists. */
	remove(id: string): Promise<void>;

	/** Everyone who answered, cancelled ones too, in the order they signed up. */
	participants(tripId: string): Promise<Participant[]>;
	/** One row per person and trip: signing up again replaces it. */
	saveParticipant(participant: Participant): Promise<void>;
	/** The person's sign-up and their lists for the trip. */
	removeParticipant(tripId: string, email: string): Promise<void>;

	/** The trip's plan, by day and time. */
	plan(tripId: string): Promise<PlanItem[]>;
	/** Adds an item, or replaces the one with its id. */
	savePlanItem(item: PlanItem): Promise<void>;
	removePlanItem(tripId: string, id: string): Promise<void>;

	/** The trip's lists, everyone's (step 2). */
	lists(tripId: string): Promise<ListEntry[]>;
	/** One list per person, trip and kind: saving again replaces it. */
	saveList(entry: ListEntry): Promise<void>;
	/** Deletes the lists of these trips, a while after they ended; the trips stay. */
	purgeLists(tripIds: string[]): Promise<number>;

	/** What a person keeps for the next trip, by kind. */
	kept(email: string): Promise<KeptList[]>;
	keep(list: KeptList): Promise<void>;
	unkeep(email: string, kind: ListKind): Promise<void>;

	/** People's instruments, kept across trips: one's own, or the participants' for the organisers. */
	instruments(emails: string[]): Promise<Instrument[]>;
	/** Adds or changes one; someone else's instrument isn't changed by its id. */
	saveInstrument(instrument: Instrument): Promise<void>;
	removeInstrument(email: string, id: string): Promise<void>;

	/** A person's sign-ups with their trips; for their data export (#158). */
	participationsOf(email: string): Promise<{ trip: Trip; participant: Participant }[]>;
	/** A person's lists on every trip; for their data export. */
	listsOf(email: string): Promise<ListEntry[]>;
	/** How many sign-ups, lists, instruments and organiser places carry this address; for "Mitglied löschen". */
	countBy(email: string): Promise<number>;
	/** Deletes the person's sign-ups and puts a pseudonym where they organised or confirmed (#158). */
	forget(email: string, stand: { email: string }): Promise<void>;
}

/** What the app looks up itself for a trip, outside its form. */
export interface Lookups {
	pictures?: Record<string, TripPicture | null>;
	places?: Record<string, TripPlace | null>;
	flags?: Record<string, string>;
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
	`CREATE INDEX IF NOT EXISTS trip_plan_trip ON trip_plan (trip_id, day)`,
	`CREATE TABLE IF NOT EXISTS trip_lists (
		trip_id TEXT NOT NULL,
		email TEXT NOT NULL,
		kind TEXT NOT NULL,
		data TEXT NOT NULL,
		saved_at TEXT NOT NULL,
		saved_by TEXT NOT NULL,
		PRIMARY KEY (trip_id, email, kind)
	)`,
	`CREATE INDEX IF NOT EXISTS trip_lists_email ON trip_lists (email)`,
	`CREATE TABLE IF NOT EXISTS trip_kept (
		email TEXT NOT NULL,
		kind TEXT NOT NULL,
		data TEXT NOT NULL,
		saved_at TEXT NOT NULL,
		PRIMARY KEY (email, kind)
	)`,
	`CREATE TABLE IF NOT EXISTS trip_instruments (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL,
		data TEXT NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS trip_instruments_email ON trip_instruments (email)`
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

interface ListRow {
	trip_id: string;
	email: string;
	kind: string;
	data: string;
	saved_at: string;
	saved_by: string;
}

interface KeptRow {
	email: string;
	kind: string;
	data: string;
	saved_at: string;
}

interface PlanRow {
	id: string;
	trip_id: string;
	day: string;
	start: string | null;
	data: string;
}

/** What doesn't get a column of its own: lists and the optional fields. */
type TripData = Pick<
	Trip,
	'orchestras' | 'organisers' | 'stops' | 'lists' | 'questions' | 'eventIds' | 'note' | 'signupUntil' | 'cap' | 'pictureSearch' | 'noPicture' | 'pictures' | 'places' | 'flags'
>;

/** What the trip's form doesn't edit, and stays when it's saved. */
type Unedited = Pick<Trip, 'eventIds' | 'pictures' | 'places' | 'flags'>;

/** The trip's lookups with what was just found. */
const withLookups = (trip: Trip, found: Lookups): Unedited => ({
	eventIds: trip.eventIds,
	pictures: found.pictures ?? trip.pictures,
	places: found.places ?? trip.places,
	flags: found.flags ?? trip.flags
});

const tripData = (trip: NewTrip, { eventIds, pictures, places, flags }: Unedited): TripData => ({
	orchestras: trip.orchestras,
	organisers: trip.organisers,
	stops: trip.stops,
	lists: trip.lists,
	questions: trip.questions,
	eventIds,
	...(trip.note ? { note: trip.note } : {}),
	...(trip.signupUntil ? { signupUntil: trip.signupUntil } : {}),
	...(trip.cap ? { cap: trip.cap } : {}),
	...(trip.pictureSearch ? { pictureSearch: trip.pictureSearch } : {}),
	...(trip.noPicture ? { noPicture: true } : {}),
	...(pictures ? { pictures } : {}),
	...(places ? { places } : {}),
	...(flags ? { flags } : {})
});

/** Trips from before the lists (#334, step 1) ask for the usual ones. */
const withDefaults = (data: Partial<TripData>): TripData => ({ lists: DEFAULT_LISTS, questions: [], ...data }) as TripData;

const toTrip = (row: TripRow): Trip => ({
	id: row.id,
	slug: row.slug,
	title: row.title,
	kind: row.kind as Trip['kind'],
	firstDay: row.first_day,
	lastDay: row.last_day,
	...withDefaults(JSON.parse(row.data)),
	createdBy: row.created_by,
	createdAt: row.created_at
});

const toParticipant = (row: ParticipantRow): Participant => ({
	tripId: row.trip_id,
	email: row.email,
	name: row.name,
	roles: row.role.split(',').filter(Boolean) as Participant['roles'],
	status: row.status as Participant['status'],
	...JSON.parse(row.data),
	signedUpAt: row.signed_up_at
});

const participantData = ({ arrival, departure, note, parentConfirmedBy, parentConfirmedAt }: Participant) =>
	JSON.stringify({ arrival, departure, note, parentConfirmedBy, parentConfirmedAt });

const toPlanItem = (row: PlanRow): PlanItem => ({ id: row.id, tripId: row.trip_id, day: row.day, ...(row.start ? { start: row.start } : {}), ...JSON.parse(row.data) });

const planData = ({ end, title, kind, place, audience, note }: PlanItem) => JSON.stringify({ end, title, kind, place, audience, note });

const toList = (row: ListRow): ListEntry => ({ tripId: row.trip_id, email: row.email, kind: row.kind as ListKind, data: JSON.parse(row.data), savedAt: row.saved_at, savedBy: row.saved_by });
const toKept = (row: KeptRow): KeptList => ({ email: row.email, kind: row.kind as ListKind, data: JSON.parse(row.data), savedAt: row.saved_at });
const byOwner = (a: Instrument, b: Instrument) => a.email.localeCompare(b.email) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const byEmail = (a: ListEntry, b: ListEntry) => a.email.localeCompare(b.email) || a.kind.localeCompare(b.kind);

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
			.bind(created.id, created.slug, created.title, created.kind, created.firstDay, created.lastDay, JSON.stringify(tripData(trip, { eventIds: [] })), by, now)
			.run();
		return created;
	}

	async update(id: string, trip: NewTrip): Promise<void> {
		const known = await this.get(id);
		if (!known) return;
		await this.db
			.prepare('UPDATE trips SET title = ?, kind = ?, first_day = ?, last_day = ?, data = ? WHERE id = ?')
			.bind(trip.title, trip.kind, trip.firstDay, trip.lastDay, JSON.stringify(tripData(trip, known)), id)
			.run();
	}

	async setEvents(id: string, eventIds: string[]): Promise<void> {
		const known = await this.get(id);
		if (!known) return;
		await this.db
			.prepare('UPDATE trips SET data = ? WHERE id = ?')
			.bind(JSON.stringify(tripData(known, { ...known, eventIds: [...new Set(eventIds)] })), id)
			.run();
	}

	async setLookups(id: string, found: Lookups): Promise<void> {
		const known = await this.get(id);
		if (!known) return;
		await this.db
			.prepare('UPDATE trips SET data = ? WHERE id = ?')
			.bind(JSON.stringify(tripData(known, withLookups(known, found))), id)
			.run();
	}

	async remove(id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_plan WHERE trip_id = ?').bind(id).run();
		await this.db.prepare('DELETE FROM trip_lists WHERE trip_id = ?').bind(id).run();
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
			.bind(participant.tripId, participant.email, participant.name, participant.roles.join(','), participant.status, participantData(participant), participant.signedUpAt)
			.run();
	}

	async removeParticipant(tripId: string, email: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_participants WHERE trip_id = ? AND email = ?').bind(tripId, email).run();
		await this.db.prepare('DELETE FROM trip_lists WHERE trip_id = ? AND email = ?').bind(tripId, email).run();
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

	async lists(tripId: string): Promise<ListEntry[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trip_lists WHERE trip_id = ?').bind(tripId).all<ListRow>();
		return results.map(toList).sort(byEmail);
	}

	async saveList(entry: ListEntry): Promise<void> {
		await this.ready();
		await this.db
			.prepare(
				`INSERT INTO trip_lists (trip_id, email, kind, data, saved_at, saved_by) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT (trip_id, email, kind) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at, saved_by = excluded.saved_by`
			)
			.bind(entry.tripId, entry.email, entry.kind, JSON.stringify(entry.data), entry.savedAt, entry.savedBy)
			.run();
	}

	async purgeLists(tripIds: string[]): Promise<number> {
		await this.ready();
		let gone = 0;
		for (const id of tripIds) {
			const row = await this.db.prepare('SELECT COUNT(*) AS n FROM trip_lists WHERE trip_id = ?').bind(id).first<{ n: number }>();
			if (!row?.n) continue;
			gone += Number(row.n);
			await this.db.prepare('DELETE FROM trip_lists WHERE trip_id = ?').bind(id).run();
		}
		return gone;
	}

	async kept(email: string): Promise<KeptList[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trip_kept WHERE email = ? ORDER BY kind').bind(email).all<KeptRow>();
		return results.map(toKept);
	}

	async keep(list: KeptList): Promise<void> {
		await this.ready();
		await this.db
			.prepare('INSERT INTO trip_kept (email, kind, data, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT (email, kind) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at')
			.bind(list.email, list.kind, JSON.stringify(list.data), list.savedAt)
			.run();
	}

	async unkeep(email: string, kind: ListKind): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_kept WHERE email = ? AND kind = ?').bind(email, kind).run();
	}

	async instruments(emails: string[]): Promise<Instrument[]> {
		await this.ready();
		const found: Instrument[] = [];
		// A few at a time: D1 limits the values bound to one statement.
		for (let i = 0; i < emails.length; i += 50) {
			const part = emails.slice(i, i + 50);
			const { results } = await this.db
				.prepare(`SELECT * FROM trip_instruments WHERE email IN (${part.map(() => '?').join(', ')})`)
				.bind(...part)
				.all<{ id: string; email: string; data: string }>();
			found.push(...results.map((row) => ({ ...JSON.parse(row.data), id: row.id, email: row.email }) as Instrument));
		}
		return found.sort(byOwner);
	}

	async saveInstrument(instrument: Instrument): Promise<void> {
		await this.ready();
		const { id, email, ...data } = instrument;
		await this.db
			.prepare('INSERT INTO trip_instruments (id, email, data) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data WHERE trip_instruments.email = excluded.email')
			.bind(id, email, JSON.stringify(data))
			.run();
	}

	async removeInstrument(email: string, id: string): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_instruments WHERE id = ? AND email = ?').bind(id, email).run();
	}

	async listsOf(email: string): Promise<ListEntry[]> {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trip_lists WHERE email = ? ORDER BY trip_id, kind').bind(email).all<ListRow>();
		return results.map(toList);
	}

	async participationsOf(email: string) {
		await this.ready();
		const { results } = await this.db.prepare('SELECT * FROM trip_participants WHERE email = ? ORDER BY signed_up_at').bind(email).all<ParticipantRow>();
		const found = await Promise.all(results.map(async (row) => ({ trip: await this.get(row.trip_id), participant: toParticipant(row) })));
		return found.filter((entry): entry is { trip: Trip; participant: Participant } => !!entry.trip);
	}

	async countBy(email: string): Promise<number> {
		const [own, trips, lists, kept, instruments] = await Promise.all([this.participationsOf(email), this.list(), this.listsOf(email), this.kept(email), this.instruments([email])]);
		return own.length + lists.length + kept.length + instruments.length + trips.filter((trip) => trip.organisers.includes(email) || trip.createdBy === email).length;
	}

	async forget(email: string, stand: { email: string }): Promise<void> {
		await this.ready();
		await this.db.prepare('DELETE FROM trip_participants WHERE email = ?').bind(email).run();
		await this.db.prepare('DELETE FROM trip_lists WHERE email = ?').bind(email).run();
		await this.db.prepare('DELETE FROM trip_kept WHERE email = ?').bind(email).run();
		await this.db.prepare('DELETE FROM trip_instruments WHERE email = ?').bind(email).run();
		// A parent filled in a child's list: it stays, without the parent's address.
		await this.db.prepare('UPDATE trip_lists SET saved_by = ? WHERE saved_by = ?').bind(stand.email, email).run();
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
				.bind(JSON.stringify(tripData({ ...trip, organisers }, trip)), trip.createdBy === email ? stand.email : trip.createdBy, trip.id)
				.run();
		}
	}
}

export class MemoryTripStore implements TripStore {
	#trips = new Map<string, Trip>();
	#participants: Participant[] = [];
	#plan = new Map<string, PlanItem>();
	#lists: ListEntry[] = [];
	#kept: KeptList[] = [];
	#instruments = new Map<string, Instrument>();
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
		const created: Trip = { ...tripData(trip, { eventIds: [] }), title: trip.title, kind: trip.kind, firstDay: trip.firstDay, lastDay: trip.lastDay, id: newTripId(), slug: slugFor(trip.title, trip.firstDay, slugs), createdBy: by, createdAt: now };
		this.#trips.set(created.id, created);
		return this.#copy(created);
	}

	async update(id: string, trip: NewTrip): Promise<void> {
		const known = this.#trips.get(id);
		if (known) this.#trips.set(id, { ...tripData(trip, known), title: trip.title, kind: trip.kind, firstDay: trip.firstDay, lastDay: trip.lastDay, id, slug: known.slug, createdBy: known.createdBy, createdAt: known.createdAt });
	}

	async setEvents(id: string, eventIds: string[]): Promise<void> {
		const known = this.#trips.get(id);
		if (known) known.eventIds = [...new Set(eventIds)];
	}

	async setLookups(id: string, found: Lookups): Promise<void> {
		const known = this.#trips.get(id);
		if (!known) return;
		const { title, kind, firstDay, lastDay, slug, createdBy, createdAt } = known;
		this.#trips.set(id, { ...structuredClone(tripData(known, withLookups(known, found))), id, title, kind, firstDay, lastDay, slug, createdBy, createdAt });
	}

	async remove(id: string): Promise<void> {
		this.#trips.delete(id);
		this.#participants = this.#participants.filter((p) => p.tripId !== id);
		this.#lists = this.#lists.filter((entry) => entry.tripId !== id);
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
		this.#lists = this.#lists.filter((entry) => !(entry.tripId === tripId && entry.email === email));
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

	async lists(tripId: string): Promise<ListEntry[]> {
		return this.#lists.filter((entry) => entry.tripId === tripId).sort(byEmail).map(this.#copy);
	}

	async saveList(entry: ListEntry): Promise<void> {
		this.#lists = [...this.#lists.filter((other) => !(other.tripId === entry.tripId && other.email === entry.email && other.kind === entry.kind)), JSON.parse(JSON.stringify(entry))];
	}

	async purgeLists(tripIds: string[]): Promise<number> {
		const before = this.#lists.length;
		this.#lists = this.#lists.filter((entry) => !tripIds.includes(entry.tripId));
		return before - this.#lists.length;
	}

	async kept(email: string): Promise<KeptList[]> {
		return this.#kept
			.filter((list) => list.email === email)
			.sort((a, b) => a.kind.localeCompare(b.kind))
			.map(this.#copy);
	}

	async keep(list: KeptList): Promise<void> {
		this.#kept = [...this.#kept.filter((other) => !(other.email === list.email && other.kind === list.kind)), JSON.parse(JSON.stringify(list))];
	}

	async unkeep(email: string, kind: ListKind): Promise<void> {
		this.#kept = this.#kept.filter((list) => !(list.email === email && list.kind === kind));
	}

	async instruments(emails: string[]): Promise<Instrument[]> {
		return [...this.#instruments.values()].filter((instrument) => emails.includes(instrument.email)).sort(byOwner).map(this.#copy);
	}

	async saveInstrument(instrument: Instrument): Promise<void> {
		const known = this.#instruments.get(instrument.id);
		if (known && known.email !== instrument.email) return;
		this.#instruments.set(instrument.id, JSON.parse(JSON.stringify(instrument)));
	}

	async removeInstrument(email: string, id: string): Promise<void> {
		if (this.#instruments.get(id)?.email === email) this.#instruments.delete(id);
	}

	async listsOf(email: string): Promise<ListEntry[]> {
		return this.#lists
			.filter((entry) => entry.email === email)
			.sort((a, b) => a.tripId.localeCompare(b.tripId) || a.kind.localeCompare(b.kind))
			.map(this.#copy);
	}

	async participationsOf(email: string) {
		return this.#participants
			.filter((p) => p.email === email && this.#trips.has(p.tripId))
			.sort((a, b) => a.signedUpAt.localeCompare(b.signedUpAt))
			.map((participant) => ({ trip: this.#copy(this.#trips.get(participant.tripId)!), participant: this.#copy(participant) }));
	}

	async countBy(email: string): Promise<number> {
		const own = this.#lists.filter((entry) => entry.email === email).length + this.#kept.filter((list) => list.email === email).length + (await this.instruments([email])).length;
		return own + (await this.participationsOf(email)).length + [...this.#trips.values()].filter((trip) => trip.organisers.includes(email) || trip.createdBy === email).length;
	}

	async forget(email: string, stand: { email: string }): Promise<void> {
		this.#participants = this.#participants.filter((p) => p.email !== email);
		this.#lists = this.#lists.filter((entry) => entry.email !== email);
		this.#kept = this.#kept.filter((list) => list.email !== email);
		for (const [id, instrument] of this.#instruments) if (instrument.email === email) this.#instruments.delete(id);
		for (const entry of this.#lists) if (entry.savedBy === email) entry.savedBy = stand.email;
		for (const participant of this.#participants) if (participant.parentConfirmedBy === email) participant.parentConfirmedBy = stand.email;
		for (const trip of this.#trips.values()) {
			trip.organisers = trip.organisers.filter((other) => other !== email);
			if (trip.createdBy === email) trip.createdBy = stand.email;
		}
	}
}

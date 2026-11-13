import { chosenLists, questionsFromForm, type ListKind, type Question } from './lists.ts';
import type { Organising } from './organising.ts';

/**
 * Konzertfahrten and Probenfahrten (#334): trips of several days, with sign-up, participants
 * and a plan per day. Kept in D1, not in the sheet: who comes along and their notes are
 * personal, and later the lists hold health data (see server/trips-store.ts).
 *
 * This file is the trip's rules without storage: reading the forms, who may see what, the
 * waiting list, and the plan grouped by day.
 */

export const TRIP_KINDS = ['konzertfahrt', 'probenfahrt'] as const;
export type TripKind = (typeof TRIP_KINDS)[number];

/** What someone is on the trip as. */
export const TRIP_ROLES = ['musiker', 'betreuer', 'fahrer', 'dirigent', 'gast'] as const;
export type TripRole = (typeof TRIP_ROLES)[number];

/** Signed up, waiting for a place, or cancelled (kept, so the organisers see who said no). */
export const PARTICIPANT_STATUSES = ['angemeldet', 'warteliste', 'abgemeldet'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

/** The kinds of things in the plan of a day. */
export const PLAN_KINDS = ['reise', 'essen', 'tutti', 'register', 'konzert', 'soundcheck', 'frei', 'sonstiges'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** A place the trip stays at, with its days: "Florenz, 2.–5. Mai". */
export interface TripStop {
	place: string;
	/** "2027-05-02". */
	from: string;
	until: string;
}

export interface Trip {
	/** Random and short; the trip's pages use it. */
	id: string;
	/** "italienreise-2027": readable, for the website later (#334, step 4). */
	slug: string;
	title: string;
	kind: TripKind;
	/** "2027-05-01". */
	firstDay: string;
	lastDay: string;
	/** Short orchestra names; empty: all of them. */
	orchestras: string[];
	/** The emails of those who organise this trip, besides everyone with "fahrten.bearbeiten". */
	organisers: string[];
	stops: TripStop[];
	note?: string;
	/** The last day to sign up; without one, until the trip starts. */
	signupUntil?: string;
	/** How many may come; more go on the waiting list. Without one, no limit. */
	cap?: number;
	/** The lists participants fill in (see lists.ts); "fragen" comes with the questions. */
	lists: ListKind[];
	/** The organisers' own questions for this trip. */
	questions: Question[];
	/** What to look up for the trip's first picture instead of its first place: "Kölner Dom". */
	pictureSearch?: string;
	/** No picture at all. */
	noPicture?: boolean;
	/** A picture for each place (and for the organisers' own search), from Wikimedia Commons; null: none found (server/trip-picture.ts). */
	pictures?: Record<string, TripPicture | null>;
	/** Where each place is, by the place as written: its address and country; null when not found (server/trip-geo.ts). */
	places?: Record<string, TripPlace | null>;
	/** The flags of the trip's countries, by country code ("DE"), as small PNG data URLs. */
	flags?: Record<string, string>;
	/** Calendar events that belong to the trip: its concerts and rehearsals. */
	eventIds: string[];
	/** Rooms, vehicles, the packing list and the fees (step 3, organising.ts); set on their own pages, not in the trip's form. */
	rooms?: Organising['rooms'];
	vehicles?: Organising['vehicles'];
	packing?: Organising['packing'];
	fee?: number;
	feeReduced?: number;
	createdBy: string;
	createdAt: string;
}

/** A sight of the place, from Wikimedia Commons, with what its licence asks to say. */
export interface TripPicture {
	/** The scaled image on upload.wikimedia.org; the app serves it from its own address. */
	url: string;
	/** The file's page on Commons, for the credit. */
	page: string;
	/** What it shows: the Wikidata item's name, "Kölner Dom". */
	title: string;
	artist?: string;
	license?: string;
	/** Taller than wide: the page shows its upper part, where the tower or dome is. */
	tall?: boolean;
}

/** A place of the trip as OpenStreetMap knows it. */
export interface TripPlace {
	lat: number;
	lon: number;
	/** "Stockwieser Damm 255, 45721 Haltern am See". */
	address?: string;
	/** "Nordrhein-Westfalen". */
	region?: string;
	/** "Deutschland", in the app's language. */
	country?: string;
	/** "DE". */
	countryCode?: string;
}

export type NewTrip = Omit<Trip, 'id' | 'slug' | 'createdBy' | 'createdAt' | 'eventIds' | 'pictures' | 'places' | 'flags' | 'rooms' | 'vehicles' | 'packing' | 'fee' | 'feeReduced'>;

export interface Participant {
	tripId: string;
	email: string;
	name: string;
	/** What they come along as; one person can be Betreuer·in, Musiker·in and Dirigent·in at once. Never empty. */
	roles: TripRole[];
	status: ParticipantStatus;
	/** A later first day than the trip's, for someone who comes later. */
	arrival?: string;
	/** An earlier last day, for someone who leaves early. */
	departure?: string;
	note?: string;
	/** When they signed up, ISO; the waiting list goes by it. */
	signedUpAt: string;
	/** For young players (#299): the parent who confirmed the sign-up, and when. */
	parentConfirmedBy?: string;
	parentConfirmedAt?: string;
}

export interface PlanItem {
	id: string;
	tripId: string;
	day: string;
	/** "09:30"; without one, the item has no set time (it lists first). */
	start?: string;
	end?: string;
	title: string;
	kind: PlanKind;
	place?: string;
	/** Who it's for: empty for everyone, else as written ("Streicher", "Orchester A", "Betreuer"). */
	audience?: string;
	note?: string;
}

/** Who is looking at a trip. */
export interface TripViewer {
	email: string;
	/** Their orchestras from "Mitglieder"; empty: all. */
	orchestras: string[];
	/** Holds "fahrten.bearbeiten": sees and edits every trip. */
	edits: boolean;
	/** A parent's children among the members (#299). */
	children: string[];
	/** A parent account ("eltern") or an admin login: never a participant themself. */
	adminOnly?: boolean;
}

export const TITLE_MAX = 120;
export const NOTE_MAX = 2000;
export const PLACE_MAX = 200;
export const STOPS_MAX = 20;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (form: FormData, name: string) =>
	String(form.get(name) ?? '')
		.trim()
		.replace(/[ \t]+/g, ' ');
const isDay = (value: string) => DAY.test(value) && !Number.isNaN(Date.parse(value));

export type TripProblem = 'title' | 'kind' | 'days' | 'order' | 'stop' | 'cap' | 'deadline' | 'questions' | 'too-long';

/**
 * The trip from its form: name, kind, days, orchestras, stops (rows of place, from, until),
 * sign-up deadline and cap. Every orchestra ticked is the same as none, as for notices.
 */
export function tripFromForm(form: FormData, { orchestras, newId = () => crypto.randomUUID().slice(0, 8) }: { orchestras: string[]; newId?: () => string }): { trip: NewTrip } | { problem: TripProblem } {
	const title = text(form, 'title');
	const kind = text(form, 'kind') as TripKind;
	const firstDay = text(form, 'firstDay');
	const lastDay = text(form, 'lastDay');
	const note = String(form.get('note') ?? '').trim();
	const signupUntil = text(form, 'signupUntil');
	const capText = text(form, 'cap');

	if (!title) return { problem: 'title' };
	if (!TRIP_KINDS.includes(kind)) return { problem: 'kind' };
	if (!isDay(firstDay) || !isDay(lastDay)) return { problem: 'days' };
	if (lastDay < firstDay) return { problem: 'order' };
	if (title.length > TITLE_MAX || note.length > NOTE_MAX) return { problem: 'too-long' };

	const places = form.getAll('stopPlace').map((value) => String(value).trim());
	const froms = form.getAll('stopFrom').map(String);
	const untils = form.getAll('stopUntil').map(String);
	const stops: TripStop[] = [];
	for (const [i, place] of places.entries()) {
		if (!place) continue;
		// A stop without days is for the whole trip.
		const from = froms[i]?.trim() || firstDay;
		const until = untils[i]?.trim() || lastDay;
		if (!isDay(from) || !isDay(until) || until < from || from < firstDay || until > lastDay) return { problem: 'stop' };
		if (place.length > PLACE_MAX) return { problem: 'too-long' };
		stops.push({ place, from, until });
	}
	if (stops.length > STOPS_MAX) return { problem: 'too-long' };
	stops.sort((a, b) => a.from.localeCompare(b.from) || a.until.localeCompare(b.until));

	let cap: number | undefined;
	if (capText) {
		cap = Number(capText);
		if (!Number.isInteger(cap) || cap < 1 || cap > 10_000) return { problem: 'cap' };
	}
	if (signupUntil && (!isDay(signupUntil) || signupUntil > lastDay)) return { problem: 'deadline' };

	const ticked = new Set(form.getAll('orchestra').map(String));
	const chosen = orchestras.filter((name) => ticked.has(name));
	const organisers = [...new Set(String(form.get('organisers') ?? '').split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter((email) => email.includes('@')))];
	const questions = questionsFromForm(form, newId);
	if (!questions) return { problem: 'questions' };
	const pictureSearch = text(form, 'pictureSearch');
	if (pictureSearch.length > PLACE_MAX) return { problem: 'too-long' };

	return {
		trip: {
			title,
			kind,
			firstDay,
			lastDay,
			orchestras: chosen.length === orchestras.length ? [] : chosen,
			organisers,
			stops,
			lists: chosenLists(form),
			questions,
			...(pictureSearch ? { pictureSearch } : {}),
			...(form.get('noPicture') ? { noPicture: true } : {}),
			...(note ? { note } : {}),
			...(signupUntil ? { signupUntil } : {}),
			...(cap ? { cap } : {})
		}
	};
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * "Italienreise 2027" → "italienreise-2027"; the trip's year is added when the name has
 * none, and a number when the slug is taken: "probenwochenende-2027-2".
 */
export function slugFor(title: string, firstDay: string, taken: Iterable<string> = []): string {
	const year = firstDay.slice(0, 4);
	let base = title
		.toLowerCase()
		.replace(/[äöüß]/g, (letter) => UMLAUTS[letter])
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	if (!base) base = 'fahrt';
	if (!base.includes(year)) base = `${base}-${year}`;
	const used = new Set(taken);
	if (!used.has(base)) return base;
	for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Every day of the trip, first to last. */
export function tripDays(trip: Pick<Trip, 'firstDay' | 'lastDay'>): string[] {
	const days: string[] = [];
	for (let at = Date.parse(trip.firstDay); at <= Date.parse(trip.lastDay) && days.length < 366; at += 86_400_000) {
		days.push(new Date(at).toISOString().slice(0, 10));
	}
	return days;
}

export const isPastTrip = (trip: Pick<Trip, 'lastDay'>, today: string) => trip.lastDay < today;
export const isRunning = (trip: Pick<Trip, 'firstDay' | 'lastDay'>, today: string) => trip.firstDay <= today && today <= trip.lastDay;

/** Whether people can still sign up or change their sign-up: until the deadline, else until the trip starts. */
export function signupOpen(trip: Pick<Trip, 'signupUntil' | 'firstDay'>, today: string): boolean {
	return today <= (trip.signupUntil ?? trip.firstDay);
}

export const isOrganiser = (trip: Pick<Trip, 'organisers'>, viewer: Pick<TripViewer, 'email' | 'edits'>) =>
	viewer.edits || trip.organisers.includes(viewer.email);

/** Signed up or on the waiting list: someone the trip counts on. */
export const isActive = (participant: Pick<Participant, 'status'>) => participant.status !== 'abgemeldet';

/** Whether a member is asked to come: one of the trip's orchestras, or all when it names none. */
export function isInvited(trip: Pick<Trip, 'orchestras'>, viewer: Pick<TripViewer, 'orchestras' | 'adminOnly'>): boolean {
	if (viewer.adminOnly) return false;
	if (!trip.orchestras.length || !viewer.orchestras.length) return true;
	const wanted = new Set(trip.orchestras.map((name) => name.toLowerCase()));
	return viewer.orchestras.some((name) => wanted.has(name.toLowerCase()));
}

/**
 * Whether someone sees a trip at all: organisers, those it's meant for (to sign up), those
 * who signed up, and the parents of a child who did (#299).
 */
export function canSeeTrip(trip: Trip, viewer: TripViewer, participants: Participant[]): boolean {
	if (isOrganiser(trip, viewer)) return true;
	if (participants.some((p) => p.email === viewer.email)) return true;
	if (participants.some((p) => isActive(p) && viewer.children.includes(p.email))) return true;
	return isInvited(trip, viewer);
}

/**
 * Whether someone sees the plan and who comes along: organisers, those signed up (not on the
 * waiting list), and parents of a child signed up. The others see only what the trip is.
 */
export function canSeeInside(trip: Trip, viewer: TripViewer, participants: Participant[]): boolean {
	if (isOrganiser(trip, viewer)) return true;
	return participants.some((p) => p.status === 'angemeldet' && (p.email === viewer.email || viewer.children.includes(p.email)));
}

/** Those holding a place, the organisers' count against the cap. */
export const signedUp = (participants: Participant[]) => participants.filter((p) => p.status === 'angemeldet');

/** Waiting for a place, first come first. */
export const waitingList = (participants: Participant[]) =>
	participants.filter((p) => p.status === 'warteliste').sort((a, b) => a.signedUpAt.localeCompare(b.signedUpAt));

/** Where a new sign-up goes: a place while there is one, else the waiting list. */
export function placeFor(trip: Pick<Trip, 'cap'>, participants: Participant[], email: string): 'angemeldet' | 'warteliste' {
	const own = participants.find((p) => p.email === email);
	// Someone who has a place keeps it when they change their details.
	if (own?.status === 'angemeldet') return 'angemeldet';
	if (trip.cap === undefined) return 'angemeldet';
	// The waiting list goes first: someone signing up again doesn't jump the queue.
	if (waitingList(participants).some((p) => p.email !== email)) return 'warteliste';
	return signedUp(participants).length < trip.cap ? 'angemeldet' : 'warteliste';
}

/** Who moves up from the waiting list now that places are free, in the order they signed up. */
export function movesUp(trip: Pick<Trip, 'cap'>, participants: Participant[]): Participant[] {
	const free = trip.cap === undefined ? Infinity : trip.cap - signedUp(participants).length;
	return free > 0 ? waitingList(participants).slice(0, free) : [];
}

/** Whether a young player's sign-up still waits for a parent (#299). */
export const waitsForParent = (participant: Participant, isChild: boolean) => isChild && isActive(participant) && !participant.parentConfirmedBy;

export type ParticipantProblem = 'role' | 'young' | 'young-days' | 'days' | 'too-long';

/**
 * Whether a member counts as young on trips: someone's child (#299), or, where the orchestra
 * names its adult orchestras, someone who plays in none of them. A member without orchestras
 * (a parent, a helper) counts as grown-up.
 */
export function isYoung(member: { email: string; orchestras: string[] }, children: Set<string>, adultOrchestras: string[] = []): boolean {
	if (children.has(member.email)) return true;
	if (!adultOrchestras.length || !member.orchestras.length) return false;
	const adult = new Set(adultOrchestras.map((name) => name.toLowerCase()));
	return !member.orchestras.some((name) => adult.has(name.toLowerCase()));
}

/**
 * The roles someone can pick for themself. Young members (#299) come along to play and be
 * looked after: Musiker·in, nothing else.
 */
export const selfRoles = (minor: boolean): TripRole[] => (minor ? ['musiker'] : [...TRIP_ROLES]);

/** Someone's sign-up from its form: one role or more, maybe a later arrival or earlier departure, a note. */
export function signupFromForm(
	form: FormData,
	trip: Pick<Trip, 'firstDay' | 'lastDay'>,
	{ minor = false }: { minor?: boolean } = {}
): { roles: TripRole[]; arrival?: string; departure?: string; note?: string } | { problem: ParticipantProblem } {
	const ticked = new Set(form.getAll('role').map(String));
	// In the list's order, whatever order the form sent them in.
	const roles = TRIP_ROLES.filter((role) => ticked.has(role));
	if (!roles.length || [...ticked].some((role) => !(TRIP_ROLES as readonly string[]).includes(role))) return { problem: 'role' };
	if (roles.some((role) => !selfRoles(minor).includes(role))) return { problem: 'young' };
	const arrival = text(form, 'arrival');
	const departure = text(form, 'departure');
	const note = String(form.get('note') ?? '').trim();
	for (const day of [arrival, departure]) if (day && (!isDay(day) || day < trip.firstDay || day > trip.lastDay)) return { problem: 'days' };
	// Young members come for the whole trip: arriving later or leaving early is for grown-ups.
	if (minor && ((arrival && arrival !== trip.firstDay) || (departure && departure !== trip.lastDay))) return { problem: 'young-days' };
	if (arrival && departure && departure < arrival) return { problem: 'days' };
	if (note.length > NOTE_MAX) return { problem: 'too-long' };
	return {
		roles,
		// The trip's own first and last day say nothing more.
		...(arrival && arrival !== trip.firstDay ? { arrival } : {}),
		...(departure && departure !== trip.lastDay ? { departure } : {}),
		...(note ? { note } : {})
	};
}

/** Whether a participant is there on a day, going by their arrival and departure. */
export const presentOn = (participant: Pick<Participant, 'arrival' | 'departure'>, day: string) =>
	(!participant.arrival || participant.arrival <= day) && (!participant.departure || day <= participant.departure);

export type PlanProblem = 'title' | 'kind' | 'day' | 'time' | 'end' | 'too-long';

/** An item of the plan from its form; the day must be one of the trip's. */
export function planItemFromForm(form: FormData, trip: Pick<Trip, 'firstDay' | 'lastDay'>): { item: Omit<PlanItem, 'id' | 'tripId'> } | { problem: PlanProblem } {
	const title = text(form, 'title');
	const kind = (text(form, 'kind') || 'sonstiges') as PlanKind;
	const day = text(form, 'day');
	const start = text(form, 'start');
	const end = text(form, 'end');
	const place = text(form, 'place');
	const audience = text(form, 'audience');
	const note = String(form.get('note') ?? '').trim();
	if (!title) return { problem: 'title' };
	if (!PLAN_KINDS.includes(kind)) return { problem: 'kind' };
	if (!isDay(day) || day < trip.firstDay || day > trip.lastDay) return { problem: 'day' };
	if ((start && !TIME.test(start)) || (end && !TIME.test(end)) || (end && !start)) return { problem: 'time' };
	if (start && end && end <= start) return { problem: 'end' };
	if (title.length > TITLE_MAX || place.length > PLACE_MAX || audience.length > TITLE_MAX || note.length > NOTE_MAX) return { problem: 'too-long' };
	return {
		item: {
			day,
			title,
			kind,
			...(start ? { start } : {}),
			...(end ? { end } : {}),
			...(place ? { place } : {}),
			...(audience ? { audience } : {}),
			...(note ? { note } : {})
		}
	};
}

/** A calendar event shown in the plan: a concert or rehearsal attached to the trip. */
export interface PlanEvent {
	id: string;
	day: string;
	start?: string;
	end?: string;
	title: string;
	type: 'konzert' | 'probe' | 'generalprobe' | 'sonstiges';
	location?: string;
}

export type PlanEntry = { item: PlanItem; event?: undefined } | { event: PlanEvent; item?: undefined };

export interface PlanDay {
	day: string;
	/** Where the trip is that day: the stops whose days include it. */
	places: string[];
	entries: PlanEntry[];
}

const startOf = (entry: PlanEntry) => (entry.item ? entry.item.start : entry.event.start) ?? '';

/** The plan grouped by the trip's days, each day by time; the attached events among the items. */
export function planByDay(trip: Pick<Trip, 'firstDay' | 'lastDay' | 'stops'>, items: PlanItem[], events: PlanEvent[] = []): PlanDay[] {
	return tripDays(trip).map((day) => ({
		day,
		places: trip.stops.filter((stop) => stop.from <= day && day <= stop.until).map((stop) => stop.place),
		entries: [...items.filter((item) => item.day === day).map((item) => ({ item })), ...events.filter((event) => event.day === day).map((event) => ({ event }))].sort(
			(a, b) => startOf(a).localeCompare(startOf(b))
		)
	}));
}

/**
 * "Today" during the trip: what's on now and what comes next, at a time like "14:05". An item
 * without an end lasts until the next one starts.
 */
export function nowAndNext(day: PlanDay | undefined, time: string): { now: PlanEntry[]; next: PlanEntry | undefined } {
	if (!day) return { now: [], next: undefined };
	const timed = day.entries.filter((entry) => startOf(entry));
	const now = timed.filter((entry, i) => {
		const start = startOf(entry);
		const following = timed.slice(i + 1).find((other) => startOf(other) > start);
		const end = (entry.item ? entry.item.end : entry.event.end) ?? (following ? startOf(following) : '24:00');
		return start <= time && time < end;
	});
	return { now, next: timed.find((entry) => startOf(entry) > time) };
}

/** The organisers' overview: how many come in which role, who waits, and who hasn't answered yet. */
export function overview(participants: Participant[], invited: { email: string; name: string }[], children: Set<string>) {
	const answered = new Set(participants.map((p) => p.email));
	return {
		signedUp: signedUp(participants).length,
		waiting: waitingList(participants).length,
		cancelled: participants.filter((p) => p.status === 'abgemeldet').length,
		/** Someone with several roles counts in each of them. */
		byRole: Object.fromEntries(TRIP_ROLES.map((role) => [role, signedUp(participants).filter((p) => p.roles.includes(role)).length])) as Record<TripRole, number>,
		/** Members the trip is for who haven't signed up or said no. */
		unanswered: invited.filter((member) => !answered.has(member.email)).map((member) => member.name),
		/** Young players whose parents haven't confirmed yet. */
		awaitingParent: participants.filter((p) => waitsForParent(p, children.has(p.email))).map((p) => p.name)
	};
}

/** The trip a calendar event belongs to, if any. */
export const tripOfEvent = <T extends Pick<Trip, 'eventIds'>>(trips: T[], eventId: string) => trips.find((trip) => trip.eventIds.includes(eventId));

const utc = (day: string) => new Date(`${day}T00:00:00Z`);

/** "1.–3. Mai 2027", or one day alone. */
export function formatDays(first: string, last: string, locale: string): string {
	const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
	return first === last ? format.format(utc(first)) : format.formatRange(utc(first), utc(last));
}

/** The day a moment falls on in the orchestra's time zone: "2026-11-13" for just after midnight there. */
export const localDay = (iso: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(iso));

/** "Sa., 1. Mai": a day of the plan. */
export const formatWeekday = (day: string, locale: string) =>
	new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(day));

/**
 * What to say under a place's name, without saying it twice: "Peking / Peking / China" becomes
 * "China", "Xi'an / Shaanxi, China" becomes "Shaanxi, China".
 */
export function placeLines(name: string, { address, region, country }: { address?: string; region?: string; country?: string }) {
	const same = (other?: string) => !!other && other.replace(/[’']/g, "'").toLowerCase() === name.replace(/[’']/g, "'").toLowerCase();
	const where = [region, country].filter((part) => part && !same(part)).join(', ');
	return { ...(address && !same(address) ? { address } : {}), ...(where ? { where } : {}) };
}

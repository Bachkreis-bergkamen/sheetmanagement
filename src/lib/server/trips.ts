import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { isAdminOnly, normalizeEmail, type AccessList } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { config } from '#lib/config/index.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { canSeeInside, canSeeTrip, isOrganiser, isYoung, tripOfEvent, type Participant, type PlanEvent, type Trip, type TripViewer } from '#lib/trips/trips.ts';
import { DEFAULT_LISTS, looksBulky, type Instrument, type ListEntry } from '#lib/trips/lists.ts';
import { DEMO_ADMIN, DEMO_MEMBER } from './demo/data.ts';
import { features, isDemo } from './env.ts';
import type { SqlDatabase } from './polls-store.ts';
import { getAccessList } from './repertoire.ts';
import { MemoryTripStore, SqlTripStore, type TripStore } from './trips-store.ts';

/**
 * Konzert- and Probenfahrten (#334) live in D1, the binding "DB" (#161); without it the
 * pages say they aren't set up. The demo keeps them in memory, with a sample trip.
 */

let demo: MemoryTripStore | null = null;

export function tripStore(): TripStore | null {
	if (isDemo()) return (demo ??= demoTrips());
	const db = (env as { DB?: SqlDatabase }).DB;
	return db ? new SqlTripStore(db) : null;
}

/** Back to the sample trip, with the rest of the demo. */
export function resetDemoTrips() {
	demo = null;
}

/** Who's looking, as the trip's rules need it; null when nobody is signed in. */
export async function tripViewer(locals: App.Locals, list?: AccessList | null): Promise<(TripViewer & { name: string }) | null> {
	const user = locals.access.user;
	if (!user) return null;
	const email = normalizeEmail(user.email);
	const member = (list === undefined ? await getAccessList().catch(() => null) : list)?.membersByEmail.get(email);
	return {
		email,
		name: member?.name ?? user.name,
		orchestras: member?.orchestras ?? [],
		edits: locals.access.rights.has('fahrten.bearbeiten'),
		children: locals.access.parent?.children ?? [],
		adminOnly: isAdminOnly(member)
	};
}

/** The members who are someone's child (#299): their sign-ups wait for a parent. */
export const childrenIn = (list: AccessList | null) => new Set(list?.members.flatMap((member) => member.children) ?? []);

/** Whether someone counts as young on trips: Musiker·in only, for the whole trip (see isYoung). */
export function youngOnTrips(list: AccessList | null, email: string): boolean {
	const member = list?.membersByEmail.get(email);
	return isYoung({ email, orchestras: member?.orchestras ?? [] }, childrenIn(list), config.adultOrchestras);
}

/** A trip, its participants and who's looking; a 404 when it isn't there or isn't for them. */
export async function openTrip(locals: App.Locals, id: string) {
	const store = tripStore();
	if (!store) error(404, t.trips.notSetUp);
	const list = await getAccessList().catch(() => null);
	const viewer = await tripViewer(locals, list);
	if (!viewer) error(401, t.messages.signInFirst);
	const trip = await store.get(id);
	const participants = trip ? await store.participants(trip.id) : [];
	// Not there and not for you look the same.
	if (!trip || !canSeeTrip(trip, viewer, participants)) error(404, t.trips.noAccess);
	return {
		store,
		list,
		viewer,
		trip,
		participants,
		organises: isOrganiser(trip, viewer),
		inside: canSeeInside(trip, viewer, participants)
	};
}

/** The trips someone may see, the next first; none without a store or a viewer. */
export async function visibleTrips(locals: App.Locals): Promise<{ trip: Trip; participants: Participant[] }[]> {
	const store = tripStore();
	const viewer = await tripViewer(locals);
	if (!store || !viewer) return [];
	const trips = await Promise.all((await store.list()).map(async (trip) => ({ trip, participants: await store.participants(trip.id) })));
	return trips.filter(({ trip, participants }) => canSeeTrip(trip, viewer, participants));
}

/** A person's trip lists, kept lists and instruments, for their data export; empty without a store. */
export async function tripListsOf(email: string) {
	const store = tripStore();
	const none = { lists: [], kept: [], instruments: [], trips: [] };
	if (!store) return none;
	try {
		const [lists, kept, instruments, trips] = await Promise.all([store.listsOf(email), store.kept(email), store.instruments([email]), store.list()]);
		return { lists, kept, instruments, trips };
	} catch (cause) {
		console.error('Reading the trip lists for the export failed:', cause);
		return none;
	}
}

/**
 * The trip a concert or rehearsal belongs to, for its page: "Teil der Fahrt …". Only for those
 * who see the trip; a concert on a trip stays a normal concert otherwise.
 */
export async function tripLink(locals: App.Locals, eventId: string): Promise<{ id: string; title: string } | null> {
	const store = features().trips ? tripStore() : null;
	if (!store) return null;
	try {
		const trip = tripOfEvent(await store.list(), eventId);
		const viewer = trip && (await tripViewer(locals));
		if (!trip || !viewer || !canSeeTrip(trip, viewer, await store.participants(trip.id))) return null;
		return { id: trip.id, title: trip.title };
	} catch (cause) {
		console.error('Looking up the trip of a date failed:', cause);
		return null;
	}
}

const clock = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: config.timeZone });

/** A calendar event as the plan shows it: its day and times in the orchestra's time zone. */
export function planEventOf(event: ShownEvent): PlanEvent {
	const time = (iso: string) => clock().format(new Date(iso));
	return {
		id: event.id,
		day: eventDay(event, config.timeZone),
		...(event.allDay ? {} : { start: time(event.start), end: time(event.end) }),
		title: event.displayTitle,
		type: event.type,
		...(event.location ? { location: event.location } : {})
	};
}

/** The calendar's events on the trip's days, for the organisers to attach. */
export const eventsInWindow = (events: ShownEvent[], trip: Pick<Trip, 'firstDay' | 'lastDay'>) =>
	events.map(planEventOf).filter((event) => trip.firstDay <= event.day && event.day <= trip.lastDay);

const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

/** A rehearsal weekend in a few weeks, with a plan and some sign-ups, so the pages have something to show. */
function demoTrips(): MemoryTripStore {
	const store = new MemoryTripStore();
	const created = new Date(Date.now() - 5 * DAY_MS).toISOString();
	const first = day(24);
	const second = day(25);
	const last = day(26);
	void store
		.create(
			{
				title: 'Probenwochenende Haltern',
				kind: 'probenfahrt',
				firstDay: first,
				lastDay: last,
				orchestras: [],
				organisers: ['tim@example.org'],
				stops: [{ place: 'Jugendherberge Haltern am See', from: first, until: last }],
				note: 'Drei Tage Proben für das Frühjahrskonzert: Tutti, Register und ein bunter Abend.',
				signupUntil: day(14),
				cap: 40,
				lists: DEFAULT_LISTS,
				questions: [
					{ id: 'q1', text: 'T-Shirt-Größe für das Fahrt-Shirt', type: 'auswahl', options: ['XS', 'S', 'M', 'L', 'XL'] },
					{ id: 'q2', text: 'Bringst du einen Notenständer mit?', type: 'janein', options: [] }
				]
			},
			DEMO_ADMIN.email,
			created
		)
		.then(async (trip) => {
			const sign = (email: string, name: string, roles: Participant['roles'], extra: Partial<Participant> = {}) =>
				store.saveParticipant({ tripId: trip.id, email, name, roles, status: 'angemeldet', signedUpAt: created, ...extra });
			await sign('tim@example.org', 'Tim Trompeter', ['betreuer', 'musiker']);
			await sign('david@example.org', 'David Dirigent', ['dirigent']);
			await sign('jonas@example.org', 'Jonas Geiger', ['musiker']);
			await sign('paul@example.org', 'Paul Probe', ['musiker'], { arrival: second });
			await sign('bea@example.org', 'Bea Bass', ['musiker'], { note: 'Ich bringe meinen Kontrabass mit.' });
			await store.saveParticipant({ tripId: trip.id, email: 'lea@example.org', name: 'Lea Lang', roles: ['musiker'], status: 'abgemeldet', signedUpAt: created });
			// Lists (step 2): some filled in, some missing, so the overview has something to say.
			const fill = (email: string, kind: ListEntry['kind'], data: ListEntry['data']) => store.saveList({ tripId: trip.id, email, kind, data, savedAt: created, savedBy: email });
			const instrument = (id: string, email: string, name: string, value: number, extra: Partial<Instrument> = {}) =>
				store.saveInstrument({ id, email, name, owner: 'eigen', value, insurance: 'gruppe', bulky: looksBulky(name), confirmedAt: created, ...extra });
			await instrument('i-bea', 'bea@example.org', 'Kontrabass', 9500, { serial: 'KB-2231' });
			await instrument('i-paul', 'paul@example.org', 'Violoncello', 6800, { owner: 'orchester' });
			await instrument('i-jonas', 'jonas@example.org', 'Geige', 3200, { insurance: 'eigene' });
			await instrument('i-mia', DEMO_MEMBER.email, 'Geige', 1800, { owner: 'leihe', confirmedAt: new Date(Date.now() - 300 * DAY_MS).toISOString() });
			await fill('bea@example.org', 'instrumente', { taken: ['i-bea'] });
			await fill('paul@example.org', 'instrumente', { taken: ['i-paul'] });
			await fill('jonas@example.org', 'ernaehrung', { diet: 'vegetarisch', allergies: [{ what: 'Erdnüsse', severity: 'schwer' }], medication: 'EpiPen im Geigenkasten' });
			await fill('bea@example.org', 'ernaehrung', { diet: 'vegan', allergies: [{ what: 'Laktose', severity: 'leicht' }] });
			await fill('tim@example.org', 'ernaehrung', { diet: 'alles', allergies: [] });
			await fill('paul@example.org', 'ernaehrung', { diet: 'alles', allergies: [{ what: 'Erdnüsse', severity: 'mittel' }], dietNote: 'Kein Schweinefleisch' });
			await fill('jonas@example.org', 'notfall', { name: 'Maria Geiger', phone: '+49 170 1234567', insurance: 'AOK' });
			await fill('bea@example.org', 'notfall', { name: 'Ben Bass', phone: '0231 998877' });
			await fill('jonas@example.org', 'wuensche', { roomWith: 'Paul Probe', busWith: 'Paul Probe' });
			await fill('paul@example.org', 'wuensche', { roomWith: 'Jonas Geiger' });
			await fill('jonas@example.org', 'einverstaendnis', { photos: true, travelAlone: true });
			await fill('bea@example.org', 'einverstaendnis', { photos: false, travelAlone: true });
			await fill('jonas@example.org', 'fragen', { q1: 'L', q2: 'ja' });
			// The demo member's lists from an earlier trip, kept to be confirmed.
			const kept = new Date(Date.now() - 200 * DAY_MS).toISOString();
			await store.keep({ email: DEMO_MEMBER.email, kind: 'notfall', data: { name: 'Petra Beispiel', phone: '+49 151 2345678', insurance: 'TK' }, savedAt: kept });
			await store.keep({ email: DEMO_MEMBER.email, kind: 'wuensche', data: { roomWith: 'Greta Pult' }, savedAt: kept });
			const item = (id: string, dayOf: string, start: string, end: string | undefined, title: string, kind: Parameters<typeof store.savePlanItem>[0]['kind'], extra: object = {}) =>
				store.savePlanItem({ id, tripId: trip.id, day: dayOf, start, ...(end ? { end } : {}), title, kind, ...extra });
			await item('p1', first, '16:00', '17:30', 'Anreise mit dem Bus', 'reise', { place: 'Treffpunkt Schulhof', note: 'Instrumente in den Gepäckraum.' });
			await item('p2', first, '18:30', '19:30', 'Abendessen', 'essen');
			await item('p3', first, '19:30', '21:30', 'Tuttiprobe', 'tutti', { place: 'Großer Saal' });
			await item('p4', second, '08:00', '09:00', 'Frühstück', 'essen');
			await item('p5', second, '09:30', '12:30', 'Registerproben', 'register', { audience: 'Streicher und Bläser getrennt', place: 'Seminarräume 1–3' });
			await item('p6', second, '15:00', '18:00', 'Tuttiprobe', 'tutti', { place: 'Großer Saal' });
			await item('p7', second, '20:00', undefined, 'Bunter Abend', 'frei');
			await item('p8', last, '09:30', '12:00', 'Durchlauf', 'tutti', { place: 'Großer Saal' });
			await item('p9', last, '14:00', '15:30', 'Rückfahrt', 'reise');
		});
	// The demo member isn't signed up yet: the trip waits for their answer.
	return store;
}

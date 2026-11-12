import { env } from 'cloudflare:workers';
import { error } from '@sveltejs/kit';
import { isAdminOnly, normalizeEmail, type AccessList } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { config } from '#lib/config/index.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { canSeeInside, canSeeTrip, isOrganiser, tripOfEvent, type Participant, type PlanEvent, type Trip, type TripViewer } from '#lib/trips/trips.ts';
import { DEMO_ADMIN } from './demo/data.ts';
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
				cap: 40
			},
			DEMO_ADMIN.email,
			created
		)
		.then(async (trip) => {
			const sign = (email: string, name: string, role: Participant['role'], extra: Partial<Participant> = {}) =>
				store.saveParticipant({ tripId: trip.id, email, name, role, status: 'angemeldet', signedUpAt: created, ...extra });
			await sign('tim@example.org', 'Tim Trompeter', 'betreuer');
			await sign('david@example.org', 'David Dirigent', 'dirigent');
			await sign('jonas@example.org', 'Jonas Geiger', 'musiker');
			await sign('paul@example.org', 'Paul Probe', 'musiker', { arrival: second });
			await sign('bea@example.org', 'Bea Bass', 'musiker', { note: 'Ich bringe meinen Kontrabass mit.' });
			await store.saveParticipant({ tripId: trip.id, email: 'lea@example.org', name: 'Lea Lang', role: 'musiker', status: 'abgemeldet', signedUpAt: created });
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

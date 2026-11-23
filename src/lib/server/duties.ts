import { env } from 'cloudflare:workers';
import { isAdminOnly, normalizeEmail, type AccessList } from '#lib/access/access.ts';
import { eventPlaces, openDuties } from '#lib/duties/duties.ts';
import { DEMO_ADMIN, DEMO_DESK_PARTNER, DEMO_MEMBER } from './demo/data.ts';
import { MemoryDutyStore, SqlDutyStore, type DutyStore } from './duties-store.ts';
import { features, isDemo } from './env.ts';
import { today } from './members.ts';
import { perDatabase } from './polls-store.ts';
import { getAccessList } from './repertoire.ts';
import type { D1 } from './db/sql.ts';

/**
 * Dienste for dates (#298) live in D1, the binding "DB"; without it the pages say they aren't
 * set up. The demo keeps them in memory, with jobs for the next concert.
 */

export const DUTY_RIGHT = 'dienste.verwalten';

let demo: Promise<MemoryDutyStore> | null = null;
const sql = perDatabase((db) => new SqlDutyStore(db));

export async function dutyStore(): Promise<DutyStore | null> {
	if (!features().duties) return null;
	if (isDemo()) return (demo ??= demoDuties());
	const db = (env as { DB?: D1 }).DB;
	return db ? sql(db) : null;
}

/** Back to the sample jobs, with the rest of the demo. */
export function resetDemoDuties() {
	demo = null;
}

/** Who can take a job: members who play or help, by name; with `parents`, parent accounts too (#299). */
export function helpers(list: AccessList | null, { parents = false } = {}): { email: string; name: string }[] {
	return (list?.members ?? [])
		.filter((member) => (!isAdminOnly(member) || (parents && member.status === 'eltern')) && member.status !== 'inaktiv')
		.map((member) => ({ email: normalizeEmail(member.email), name: member.name || member.email }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The signed-in member or parent (#299) as a helper, by the name the member list has; null for anyone else. */
export async function dutyPerson(locals: App.Locals, list?: AccessList | null): Promise<{ email: string; name: string } | null> {
	const user = locals.access.user;
	if (!user || !locals.access.member) return null;
	const email = normalizeEmail(user.email);
	const member = (list === undefined ? await getAccessList().catch(() => null) : list)?.membersByEmail.get(email);
	return { email, name: member?.name || user.name || email };
}

/**
 * The line on a date's page: how many places are free and which jobs the viewer took. For
 * organisers also on an upcoming concert without jobs, to set them up; null otherwise then.
 */
export async function dutyLink(locals: App.Locals, event: { id: string; past: boolean; type: string }) {
	const store = await dutyStore();
	if (!store) return null;
	const manage = locals.access.rights.has(DUTY_RIGHT);
	try {
		const [slots, takes, rides] = await Promise.all([store.slotsOf(event.id), store.takesOf(event.id), store.ridesOf(event.id)]);
		// Upcoming concerts always: people offer rides to them (#196), and organisers set up the jobs.
		if (!slots.length && !rides.length && (event.past || event.type !== 'konzert')) return null;
		const email = locals.access.user ? normalizeEmail(locals.access.user.email) : '';
		const mine = new Set(takes.filter((take) => take.email === email).map((take) => take.slotId));
		return {
			href: `/kalender/${encodeURIComponent(event.id)}/dienste`,
			places: slots.length ? eventPlaces(slots, takes) : null,
			mine: slots.filter((slot) => mine.has(slot.id)).map((slot) => slot.task),
			rides: { offers: rides.filter((ride) => ride.kind === 'offer').length, requests: rides.filter((ride) => ride.kind === 'request').length },
			manage
		};
	} catch (cause) {
		console.error('Reading the Dienste of a date failed:', cause);
		return null;
	}
}

/**
 * Jobs within two weeks that are free or up for taking over, for the start page and the
 * parents' area (#196): only dates the viewer sees, and not those they're on already.
 */
export async function openDutiesFor(eventIds: Set<string> | Promise<Set<string>>, email: string | undefined, today: string) {
	const store = await dutyStore();
	if (!store) return [];
	try {
		// The dates may still be on their way: D1 is asked meanwhile, not after.
		const [slots, takes, ids] = await Promise.all([store.slots(), store.takes(), eventIds]);
		const me = email ? normalizeEmail(email) : '';
		return openDuties(
			slots.filter((slot) => ids.has(slot.eventId)),
			takes,
			today
		).map((one) => ({ ...one, href: `/kalender/${encodeURIComponent(one.eventId)}/dienste`, mine: takes.some((take) => take.eventId === one.eventId && take.email === me) }));
	} catch (cause) {
		console.error('Reading the open Dienste failed:', cause);
		return [];
	}
}

/** For a list of dates (the parents' area, #299): per date with jobs or lifts, the places and the lifts, in one read. */
export async function dutySummaries(eventIds: string[]) {
	const store = await dutyStore();
	const found = new Map<string, { href: string; places: ReturnType<typeof eventPlaces> | null; rides: number }>();
	if (!store || !eventIds.length) return found;
	try {
		const wanted = new Set(eventIds);
		const [slots, takes, rides] = await Promise.all([store.slots(), store.takes(), store.rides()]);
		for (const id of eventIds) {
			const mine = slots.filter((slot) => slot.eventId === id);
			const lifts = rides.filter((ride) => ride.eventId === id).length;
			if (mine.length || lifts) found.set(id, { href: `/kalender/${encodeURIComponent(id)}/dienste`, places: mine.length ? eventPlaces(mine, takes.filter((take) => wanted.has(take.eventId))) : null, rides: lifts });
		}
	} catch (cause) {
		console.error('Reading the Dienste for the parents failed:', cause);
	}
	return found;
}

/** A person's lifts offered or asked for (#196); empty without a store or when reading fails. */
export async function myRides(email: string) {
	const store = await dutyStore();
	if (!store) return [];
	const me = normalizeEmail(email);
	return (await store.rides().catch(() => [])).filter((ride) => ride.email === me);
}

/** A person's jobs with the job itself, the next first; empty without a store or when reading fails. */
export async function myDuties(email: string) {
	const store = await dutyStore();
	if (!store) return [];
	try {
		const [takes, slots] = await Promise.all([store.takesBy(normalizeEmail(email)), store.slots()]);
		const byId = new Map(slots.map((slot) => [slot.id, slot]));
		return takes
			.flatMap((take) => {
				const slot = byId.get(take.slotId);
				return slot ? [{ take, slot }] : [];
			})
			.sort((a, b) => a.slot.eventDay.localeCompare(b.slot.eventDay) || (a.slot.from ?? '').localeCompare(b.slot.from ?? ''));
	} catch (cause) {
		console.error('Reading the Dienste failed:', cause);
		return [];
	}
}

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The Herbstkonzert's jobs, partly taken (the demo member sets up), drinks for a rehearsal
 * soon, last summer's concert for the count per person, and a template to use again.
 */
async function demoDuties(): Promise<MemoryDutyStore> {
	const store = new MemoryDutyStore();
	const day = today();
	const herbst = { eventId: 'demo-herbstkonzert', eventDay: addDays(day, 25), eventTitle: 'Herbstkonzert' };
	const setUp = await store.addSlot({ ...herbst, task: 'Aufbau: Stühle und Pulte', from: '15:00', to: '16:00', needed: 4, note: 'Stühle aus dem Lager hinter der Bühne, Pulte aus dem Bus.' });
	const door = await store.addSlot({ ...herbst, task: 'Abendkasse', from: '16:15', to: '17:15', needed: 2, note: 'Wechselgeld liegt im Sekretariat.' });
	await store.addSlot({ ...herbst, task: 'Kuchenverkauf in der Pause', needed: 4 });
	await store.addSlot({ ...herbst, task: 'Abbau', from: '19:00', to: '19:45', needed: 6 });
	await store.take(setUp.id, DEMO_MEMBER);
	await store.take(setUp.id, DEMO_DESK_PARTNER);
	await store.take(door.id, { ...DEMO_ADMIN, by: DEMO_ADMIN.email });
	const rehearsal = await store.addSlot({ eventId: 'demo-probe-4', eventDay: addDays(day, 11), eventTitle: 'Probe Herbstkonzert 🎶', task: 'Getränke für die Pause', needed: 2 });
	await store.take(rehearsal.id, DEMO_DESK_PARTNER);
	// Greta can't do the drinks after all: up for taking over.
	await store.offer(rehearsal.id, DEMO_DESK_PARTNER.email, true);
	await store.addRide({ ...herbst, email: DEMO_DESK_PARTNER.email, name: DEMO_DESK_PARTNER.name, kind: 'offer', from: 'Bergkamen, Marktplatz', seats: 3, note: 'Abfahrt 14:30, zurück auch.' });
	await store.addRide({ ...herbst, email: 'paul@example.org', name: 'Paul Probe', kind: 'request', from: 'Unna', seats: 1, note: 'Mit Cello.' });
	const sommer = { eventId: 'demo-sommerkonzert', eventDay: addDays(day, -60), eventTitle: 'Sommerkonzert' };
	const pastSetUp = await store.addSlot({ ...sommer, task: 'Aufbau', from: '15:00', to: '16:00', needed: 3 }, `${addDays(day, -70)}T10:00:00Z`);
	const cake = await store.addSlot({ ...sommer, task: 'Kuchenverkauf', needed: 2 }, `${addDays(day, -70)}T10:01:00Z`);
	await store.take(pastSetUp.id, DEMO_MEMBER, `${addDays(day, -65)}T10:00:00Z`);
	await store.take(pastSetUp.id, DEMO_ADMIN, `${addDays(day, -65)}T10:01:00Z`);
	await store.take(cake.id, DEMO_DESK_PARTNER, `${addDays(day, -65)}T10:02:00Z`);
	await store.saveTemplate('Konzert in der Stadthalle', [
		{ task: 'Aufbau: Stühle und Pulte', from: '15:00', to: '16:00', needed: 4 },
		{ task: 'Abendkasse', from: '16:15', to: '17:15', needed: 2 },
		{ task: 'Kuchenverkauf in der Pause', needed: 4 },
		{ task: 'Abbau', needed: 6 }
	]);
	return store;
}

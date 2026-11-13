import { error, fail, redirect } from '@sveltejs/kit';
import { isAdminOnly, normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { runInBackground } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { today } from '#lib/server/members.ts';
import { notify } from '#lib/server/push/index.ts';
import { ensureLookups, withinTime } from '#lib/server/trip-geo.ts';
import { shownPictures } from '#lib/server/trip-picture.ts';
import { listPerson } from '#lib/server/trip-lists.ts';
import { childrenIn, eventsInWindow, openTrip, planEventOf, youngOnTrips } from '#lib/server/trips.ts';
import type { TripStore } from '#lib/server/trips-store.ts';
import {
	isActive,
	isInvited,
	localDay,
	movesUp,
	overview,
	placeFor,
	selfRoles,
	signedUp,
	signupFromForm,
	signupOpen,
	tripFromForm,
	waitingList,
	waitsForParent,
	type Participant,
	type Trip
} from '#lib/trips/trips.ts';
import { isCarer, listProgress, listsFor } from '#lib/trips/lists.ts';
import type { Actions, PageServerLoad } from './$types';

/** A trip (#334): what it is, your sign-up, your child's, and for organisers who comes and its dates. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const opened = await openTrip(locals, params.id);
	const { participants, viewer, list, organises, inside, store } = opened;
	// Where the trip goes and its picture, looked up once per place: a little while on this load,
	// the rest in the background for the next one.
	const lookups = ensureLookups(store, opened.trip);
	runInBackground(lookups);
	const trip = await withinTime(lookups, opened.trip);
	const day = today();
	const children = childrenIn(list);
	const mine = participants.find((p) => p.email === viewer.email) ?? null;
	const names = (emails: string[]) => emails.map((email) => list?.membersByEmail.get(email)?.name ?? email);

	// The trip's concerts and rehearsals from the calendar; for organisers also the others on its days.
	const library = await getLibrary().catch(() => null);
	const schedule = library?.schedule.ok ? library.schedule : null;
	const attached = trip.eventIds.flatMap((id) => {
		const event = schedule?.byId.get(id);
		return event ? [planEventOf(event)] : [];
	});
	const pickable = organises && schedule ? eventsInWindow(schedule.events, trip).map((event) => ({ ...event, attached: trip.eventIds.includes(event.id) })) : [];

	const waiting = waitingList(participants);
	const shown = (p: Participant) => ({
		email: p.email,
		name: p.name,
		roles: p.roles,
		arrival: p.arrival,
		departure: p.departure,
		// Notes, and whose parents still have to confirm, are for the organisers only.
		parentPending: organises && waitsForParent(p, children.has(p.email)),
		...(organises ? { note: p.note } : {})
	});
	const invited = (list?.members ?? []).filter((member) => member.status !== 'inaktiv' && !isAdminOnly(member) && isInvited(trip, member));

	// The lists (step 2): how far one's own and one's children's are, and for those who read them, everyone's.
	const entries = await store.lists(trip.id).catch(() => []);
	const listsOf = (email: string, roles: Participant['roles']) => {
		const due = listsFor(trip, roles);
		return { filled: due.filter((kind) => entries.some((entry) => entry.email === email && entry.kind === kind)).length, of: due.length };
	};
	const carer = isCarer(participants, viewer.email);
	const people = [null, ...viewer.children.map((_, i) => String(i + 1))].flatMap((fuer) => {
		const person = listPerson(opened, fuer);
		return person ? [{ person, fuer }] : [];
	});

	return {
		trip: {
			id: trip.id,
			title: trip.title,
			kind: trip.kind,
			firstDay: trip.firstDay,
			lastDay: trip.lastDay,
			stops: trip.stops,
			orchestras: trip.orchestras,
			organisers: trip.organisers,
			organiserNames: names(trip.organisers),
			note: trip.note,
			cap: trip.cap,
			signupUntil: trip.signupUntil,
			lists: trip.lists,
			questions: trip.questions,
			pictureSearch: trip.pictureSearch,
			noPicture: trip.noPicture,
			// A picture per place, shown in turn; the image itself comes from /fahrten/[id]/bild?nr=….
			pictures: shownPictures(trip).map(({ place, picture }) => ({ place, title: picture.title, artist: picture.artist, license: picture.license, page: picture.page, tall: !!picture.tall })),
			// Each place with its address, country and flag, as far as OpenStreetMap knows it.
			where: trip.stops.map((stop) => {
				const place = trip.places?.[stop.place] ?? null;
				return {
					place: stop.place,
					from: stop.from,
					until: stop.until,
					...(place ? { lat: place.lat, lon: place.lon, address: place.address, region: place.region, country: place.country, flag: place.countryCode ? (trip.flags?.[place.countryCode] ?? null) : null } : {})
				};
			})
		},
		myLists: people.map(({ person, fuer }) => ({ name: person.name, fuer, ...listsOf(person.email, person.participant.roles) })).filter((one) => one.of > 0),
		listProgress: organises || carer ? listProgress(trip, participants, entries, children) : null,
		organises,
		inside,
		open: signupOpen(trip, day),
		full: trip.cap !== undefined && signedUp(participants).length >= trip.cap,
		canJoin: !viewer.adminOnly,
		// The roles to pick from: young members only as Musiker·in.
		roles: selfRoles(youngOnTrips(list, viewer.email)),
		// Young members come for the whole trip.
		young: youngOnTrips(list, viewer.email),
		mine: mine && {
			...mine,
			waitPlace: mine.status === 'warteliste' ? waiting.findIndex((p) => p.email === mine.email) + 1 : 0,
			parentPending: waitsForParent(mine, children.has(mine.email))
		},
		// A parent's children (#299), with their sign-up for this trip.
		children: viewer.children.map((email) => {
			const child = participants.find((p) => p.email === email);
			return {
				email,
				name: list?.membersByEmail.get(email)?.name ?? email,
				status: child?.status ?? null,
				confirmedAt: child?.parentConfirmedAt ? localDay(child.parentConfirmedAt, config.timeZone) : null
			};
		}),
		attached,
		pickable,
		signedUp: inside ? signedUp(participants).map(shown) : [],
		waiting: organises ? waiting.map(shown) : [],
		cancelled: organises ? participants.filter((p) => p.status === 'abgemeldet').map(shown) : [],
		overview: organises ? overview(participants, invited, children) : null,
		orchestras: config.orchestras,
		saved: url.searchParams.has('gespeichert')
	};
};

/** Gives the free places to the waiting list, in order, and tells those who move up. */
async function fillPlaces(store: TripStore, trip: Trip) {
	const participants = await store.participants(trip.id);
	const up = movesUp(trip, participants);
	for (const participant of up) await store.saveParticipant({ ...participant, status: 'angemeldet' });
	if (up.length) runInBackground(notify(up.map((p) => p.email), { title: trip.title, body: t.trips.signup.movedUp(trip.title), url: `/fahrten/${trip.id}`, tag: `fahrt-${trip.id}` }));
}

const now = () => new Date().toISOString();

export const actions: Actions = {
	signup: async ({ locals, params, request }) => {
		const { store, trip, participants, viewer, list } = await openTrip(locals, params.id);
		if (viewer.adminOnly) return fail(403, { error: t.trips.signup.noAdmin });
		const own = participants.find((p) => p.email === viewer.email);
		// After the deadline only the organisers change a sign-up.
		if (!signupOpen(trip, today())) return fail(409, { error: t.trips.signup.problems.closed });
		const parsed = signupFromForm(await request.formData(), trip, { minor: youngOnTrips(list, viewer.email) });
		if ('problem' in parsed) return fail(400, { error: t.trips.signup.problems[parsed.problem] });
		const status = placeFor(trip, participants, viewer.email);
		// Signing up again after a no, or for the first time: the waiting list counts from now.
		const keepsTurn = own && isActive(own);
		try {
			await store.saveParticipant({
				tripId: trip.id,
				email: viewer.email,
				name: viewer.name,
				status: keepsTurn ? own.status : status,
				...parsed,
				signedUpAt: keepsTurn ? own.signedUpAt : now(),
				// A parent's confirmation holds for this sign-up, not for one after a no.
				...(keepsTurn && own.parentConfirmedBy ? { parentConfirmedBy: own.parentConfirmedBy, parentConfirmedAt: own.parentConfirmedAt } : {})
			});
		} catch (cause) {
			console.error('Saving a trip sign-up failed:', cause);
			return fail(503, { error: t.trips.failed });
		}
		redirect(303, `/fahrten/${trip.id}?gespeichert`);
	},

	decline: async ({ locals, params }) => {
		const { store, trip, participants, viewer } = await openTrip(locals, params.id);
		if (viewer.adminOnly) return fail(403, { error: t.trips.signup.noAdmin });
		if (!signupOpen(trip, today())) return fail(409, { error: t.trips.signup.problems.closed });
		const own = participants.find((p) => p.email === viewer.email);
		await store.saveParticipant({
			...(own ?? { tripId: trip.id, email: viewer.email, roles: ['musiker' as const] }),
			name: viewer.name,
			status: 'abgemeldet',
			signedUpAt: now(),
			parentConfirmedBy: undefined,
			parentConfirmedAt: undefined
		});
		if (own?.status === 'angemeldet') await fillPlaces(store, trip);
		redirect(303, `/fahrten/${trip.id}?gespeichert`);
	},

	/** A parent confirms (or withdraws) their child's sign-up (#299). */
	confirmChild: async ({ locals, params, request }) => {
		const { store, participants, viewer } = await openTrip(locals, params.id);
		const child = normalizeEmail(String((await request.formData()).get('child') ?? ''));
		const participant = participants.find((p) => p.email === child);
		if (!viewer.children.includes(child) || !participant || !isActive(participant)) error(403, t.messages.noRight);
		await store.saveParticipant({ ...participant, parentConfirmedBy: viewer.email, parentConfirmedAt: now() });
		return { saved: true };
	},

	withdrawChild: async ({ locals, params, request }) => {
		const { store, trip, participants, viewer } = await openTrip(locals, params.id);
		const child = normalizeEmail(String((await request.formData()).get('child') ?? ''));
		const participant = participants.find((p) => p.email === child);
		if (!viewer.children.includes(child) || !participant) error(403, t.messages.noRight);
		await store.saveParticipant({ ...participant, status: 'abgemeldet', parentConfirmedBy: undefined, parentConfirmedAt: undefined });
		if (participant.status === 'angemeldet') await fillPlaces(store, trip);
		return { saved: true };
	},

	update: async ({ locals, params, request }) => {
		const { store, trip, organises } = await openTrip(locals, params.id);
		if (!organises) error(403, t.messages.noRight);
		const result = tripFromForm(await request.formData(), { orchestras: config.orchestras });
		if ('problem' in result) return fail(400, { editError: t.trips.problems[result.problem] });
		await store.update(trip.id, result.trip);
		// More places now: the waiting list moves up.
		await fillPlaces(store, { ...trip, ...result.trip });
		// Another place: its address, flag and picture, looked up while the page reloads.
		const changed = await store.get(trip.id);
		if (changed) runInBackground(ensureLookups(store, changed));
		return { edited: true };
	},

	events: async ({ locals, params, request }) => {
		const { store, trip, organises } = await openTrip(locals, params.id);
		if (!organises) error(403, t.messages.noRight);
		const ticked = new Set((await request.formData()).getAll('event').map(String));
		const library = await getLibrary();
		const window = library.schedule.ok ? eventsInWindow(library.schedule.events, trip).map((event) => event.id) : [];
		// Events outside the window stay as they were: the form only shows those inside.
		await store.setEvents(trip.id, [...trip.eventIds.filter((id) => !window.includes(id)), ...window.filter((id) => ticked.has(id))]);
		return { eventsSaved: true };
	},

	moveUp: async ({ locals, params, request }) => {
		const { store, trip, participants, organises } = await openTrip(locals, params.id);
		if (!organises) error(403, t.messages.noRight);
		const email = String((await request.formData()).get('email') ?? '');
		const participant = participants.find((p) => p.email === email);
		if (participant) {
			await store.saveParticipant({ ...participant, status: 'angemeldet' });
			runInBackground(notify([email], { title: trip.title, body: t.trips.signup.movedUp(trip.title), url: `/fahrten/${trip.id}`, tag: `fahrt-${trip.id}` }));
		}
		return { saved: true };
	},

	removeParticipant: async ({ locals, params, request }) => {
		const { store, trip, participants, organises } = await openTrip(locals, params.id);
		if (!organises) error(403, t.messages.noRight);
		const email = String((await request.formData()).get('email') ?? '');
		const participant = participants.find((p) => p.email === email);
		await store.removeParticipant(trip.id, email);
		if (participant?.status === 'angemeldet') await fillPlaces(store, trip);
		return { saved: true };
	},

	remove: async ({ locals, params }) => {
		const { store, trip, organises } = await openTrip(locals, params.id);
		if (!organises) error(403, t.messages.noRight);
		await store.remove(trip.id);
		redirect(303, '/fahrten');
	}
};

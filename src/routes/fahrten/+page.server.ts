import { error, fail, redirect } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { today } from '#lib/server/members.ts';
import { shownPictures } from '#lib/server/trip-picture.ts';
import { tripStore, tripViewer, visibleTrips } from '#lib/server/trips.ts';
import { isActive, isPastTrip, signedUp, signupOpen, tripFromForm } from '#lib/trips/trips.ts';
import type { Actions, PageServerLoad } from './$types';

/** Konzert- and Probenfahrten (#334): the ones for you, the next first; a new one for organisers. */
export const load: PageServerLoad = async ({ locals }) => {
	const store = tripStore();
	const viewer = await tripViewer(locals);
	if (!viewer) error(401, t.messages.signInFirst);
	const creates = viewer.edits;
	if (!store) return { state: 'not-set-up' as const, upcoming: [], past: [], creates, orchestras: config.orchestras };

	const day = today();
	const trips = (await visibleTrips(locals)).map(({ trip, participants }) => {
		const mine = participants.find((p) => p.email === viewer.email);
		const children = participants.filter((p) => isActive(p) && viewer.children.includes(p.email));
		return {
			id: trip.id,
			title: trip.title,
			kind: trip.kind,
			firstDay: trip.firstDay,
			lastDay: trip.lastDay,
			places: trip.stops.map((stop) => stop.place),
			// The sight of the place, shown small in the list; the trip's page looks it up.
			picture: shownPictures(trip).length > 0,
			cap: trip.cap,
			signupUntil: trip.signupUntil,
			signedUp: signedUp(participants).length,
			mine: mine?.status ?? null,
			children: children.map((child) => child.name),
			// Asked to answer: open, not answered, and someone who can come along.
			yourTurn: !mine && !viewer.adminOnly && signupOpen(trip, day),
			past: isPastTrip(trip, day)
		};
	});
	return {
		state: 'ready' as const,
		upcoming: trips.filter((trip) => !trip.past),
		// The latest first.
		past: trips.filter((trip) => trip.past).reverse(),
		creates,
		orchestras: config.orchestras
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireRight(locals, 'fahrten.bearbeiten');
		const store = tripStore();
		const viewer = await tripViewer(locals);
		if (!store || !viewer) return fail(503, { error: t.trips.notSetUp });
		const result = tripFromForm(await request.formData(), { orchestras: config.orchestras });
		if ('problem' in result) return fail(400, { error: t.trips.problems[result.problem] });
		let id: string;
		try {
			({ id } = await store.create(result.trip, viewer.email));
		} catch (cause) {
			console.error('Creating a trip failed:', cause);
			return fail(503, { error: t.trips.failed });
		}
		redirect(303, `/fahrten/${id}`);
	}
};

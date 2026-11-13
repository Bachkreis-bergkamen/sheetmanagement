import { fail } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { arrangementOf, organisersOnly, organisingReader, youngGoing } from '#lib/server/trip-organising.ts';
import { openTrip } from '#lib/server/trips.ts';
import { newTripId } from '#lib/server/trips-store.ts';
import { instrumentsOnTrip } from '#lib/trips/lists.ts';
import { LEGS, VEHICLES_MAX, VEHICLE_KINDS, pickupsText, rideBoard, ridesWith, vehicleFromForm, type Leg } from '#lib/trips/organising.ts';
import type { Actions, PageServerLoad } from './$types';

/** Transport (#334, step 3): the bus, cars and trains there and back, who goes in which, and the big instruments. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const opened = await openTrip(locals, params.id);
	const { organises } = organisingReader(opened);
	const { store, trip, participants } = opened;
	const leg: Leg = url.searchParams.get('weg') === 'rueck' ? 'rueck' : 'hin';
	const [arrangements, entries] = await Promise.all([store.arrangements(trip.id), store.lists(trip.id)]);
	const instruments = await store.instruments(participants.filter((p) => p.status === 'angemeldet').map((p) => p.email)).catch(() => []);
	const { bulky } = instrumentsOnTrip(participants, entries, instruments);
	const board = rideBoard(trip, leg, participants, arrangements, entries, youngGoing(opened), bulky);
	return {
		trip: { id: trip.id, title: trip.title, firstDay: trip.firstDay, lastDay: trip.lastDay },
		organises,
		leg,
		legs: LEGS,
		kinds: VEHICLE_KINDS,
		vehicles: board.units.map((unit) => ({ ...unit, pickupsText: pickupsText(unit.unit.pickups) })),
		// Vehicles of the other way only, so the organisers see them exist.
		elsewhere: (trip.vehicles ?? []).filter((vehicle) => !vehicle.legs.includes(leg)).length,
		unplaced: board.unplaced,
		bulky: bulky.map((row) => ({ email: row.instrument.email, person: row.person, name: row.instrument.name }))
	};
};

const legOf = (form: FormData): Leg => (form.get('leg') === 'rueck' ? 'rueck' : 'hin');

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const form = await request.formData();
		const parsed = vehicleFromForm(form);
		const id = String(form.get('id') ?? '');
		if ('problem' in parsed) return fail(400, { error: t.trips.organising.problems[parsed.problem], id });
		const vehicles = opened.trip.vehicles ?? [];
		if (!id && vehicles.length >= VEHICLES_MAX) return fail(400, { error: t.trips.organising.problems['too-many'], id });
		const known = vehicles.some((vehicle) => vehicle.id === id);
		const saved = known ? vehicles.map((vehicle) => (vehicle.id === id ? { ...parsed.vehicle, id } : vehicle)) : [...vehicles, { ...parsed.vehicle, id: newTripId() }];
		await opened.store.setOrganising(opened.trip.id, { vehicles: saved });
		// A way it no longer goes: those riding it that way have no seat now.
		if (known)
			for (const one of await opened.store.arrangements(opened.trip.id)) {
				const dropped = LEGS.filter((leg) => one.rides?.[leg] === id && !parsed.vehicle.legs.includes(leg));
				if (dropped.length) await opened.store.saveArrangement({ ...one, rides: Object.fromEntries(Object.entries(one.rides ?? {}).filter(([leg]) => !dropped.includes(leg as Leg))) });
			}
		return { saved: true };
	},

	remove: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const id = String((await request.formData()).get('id') ?? '');
		await opened.store.setOrganising(opened.trip.id, { vehicles: (opened.trip.vehicles ?? []).filter((vehicle) => vehicle.id !== id) });
		for (const one of await opened.store.arrangements(opened.trip.id))
			if (LEGS.some((leg) => one.rides?.[leg] === id)) await opened.store.saveArrangement({ ...one, rides: Object.fromEntries(Object.entries(one.rides ?? {}).filter(([, vehicle]) => vehicle !== id)) });
		return { saved: true };
	},

	/**
	 * Everyone without a seat this way into one vehicle: the usual case, the whole group in one
	 * bus or plane. For the other way too where it goes both and they have nothing there yet.
	 */
	everyone: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const form = await request.formData();
		const leg = legOf(form);
		const vehicle = (opened.trip.vehicles ?? []).find((one) => one.id === String(form.get('unit') ?? '') && one.legs.includes(leg));
		if (!vehicle) return fail(400, { error: t.trips.organising.problems.gone, id: '' });
		const known = new Set((opened.trip.vehicles ?? []).filter((one) => one.legs.includes(leg)).map((one) => one.id));
		const arrangements = await opened.store.arrangements(opened.trip.id);
		for (const participant of opened.participants.filter((p) => p.status === 'angemeldet')) {
			const own = arrangements.find((one) => one.email === participant.email) ?? { tripId: opened.trip.id, email: participant.email };
			const seat = own.rides?.[leg];
			if (seat && known.has(seat)) continue;
			await opened.store.saveArrangement({ ...own, rides: ridesWith(own, vehicle, leg) });
		}
		return { saved: true };
	},

	/** Someone into a vehicle for one way (and the other, when it goes both and they have none), or out. */
	assign: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const form = await request.formData();
		const id = String(form.get('unit') ?? '');
		const leg = legOf(form);
		const vehicle = (opened.trip.vehicles ?? []).find((one) => one.id === id && one.legs.includes(leg));
		const arrangement = await arrangementOf(opened, String(form.get('email') ?? ''));
		if (!arrangement || (id && !vehicle)) return fail(400, { error: t.trips.organising.problems.gone, id: '' });
		await opened.store.saveArrangement({ ...arrangement, rides: ridesWith(arrangement, vehicle, leg) });
		return { saved: true };
	}
};

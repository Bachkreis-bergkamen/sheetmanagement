import { fail } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { arrangementOf, organisersOnly, organisingReader, youngGoing } from '#lib/server/trip-organising.ts';
import { openTrip } from '#lib/server/trips.ts';
import { newTripId } from '#lib/server/trips-store.ts';
import { ROOMS_MAX, roomBoard, roomFromForm } from '#lib/trips/organising.ts';
import type { Actions, PageServerLoad } from './$types';

/** Zimmerverteilung (#334, step 3): rooms with beds, people into them, with the wishes beside. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const opened = await openTrip(locals, params.id);
	const { organises } = organisingReader(opened);
	const { store, trip, participants } = opened;
	const [arrangements, entries] = await Promise.all([store.arrangements(trip.id), store.lists(trip.id)]);
	const board = roomBoard(trip, participants, arrangements, entries, youngGoing(opened));
	return {
		trip: { id: trip.id, title: trip.title },
		organises,
		rooms: board.units,
		unplaced: board.unplaced,
		beds: (trip.rooms ?? []).reduce((sum, room) => sum + room.beds, 0)
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const form = await request.formData();
		const parsed = roomFromForm(form);
		const id = String(form.get('id') ?? '');
		if ('problem' in parsed) return fail(400, { error: t.trips.organising.problems[parsed.problem], id });
		const rooms = opened.trip.rooms ?? [];
		if (!id && rooms.length >= ROOMS_MAX) return fail(400, { error: t.trips.organising.problems['too-many'], id });
		const known = rooms.some((room) => room.id === id);
		await opened.store.setOrganising(opened.trip.id, { rooms: known ? rooms.map((room) => (room.id === id ? { ...parsed.room, id } : room)) : [...rooms, { ...parsed.room, id: newTripId() }] });
		return { saved: true };
	},

	/** Several rooms at once: "Zimmer 1" to "Zimmer 8", four beds each. */
	addMany: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const form = await request.formData();
		const count = Number(form.get('count'));
		const beds = Number(form.get('beds'));
		const prefix = String(form.get('prefix') ?? '').trim() || t.trips.organising.stays.room;
		const rooms = opened.trip.rooms ?? [];
		if (!Number.isInteger(count) || count < 1 || rooms.length + count > ROOMS_MAX) return fail(400, { error: t.trips.organising.problems['too-many'], id: '' });
		if (!Number.isInteger(beds) || beds < 1 || beds > 100) return fail(400, { error: t.trips.organising.problems.beds, id: '' });
		const start = rooms.length + 1;
		const added = Array.from({ length: count }, (_, i) => ({ id: newTripId(), name: `${prefix} ${start + i}`.slice(0, 80), beds }));
		await opened.store.setOrganising(opened.trip.id, { rooms: [...rooms, ...added] });
		return { saved: true };
	},

	remove: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const id = String((await request.formData()).get('id') ?? '');
		await opened.store.setOrganising(opened.trip.id, { rooms: (opened.trip.rooms ?? []).filter((room) => room.id !== id) });
		// Those in it have no bed now; their arrangement forgets the room.
		for (const one of await opened.store.arrangements(opened.trip.id)) if (one.room === id) await opened.store.saveArrangement({ ...one, room: undefined });
		return { saved: true };
	},

	/** Someone into a room, or out of every room with an empty one; by drag and drop or the select. */
	assign: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const form = await request.formData();
		const room = String(form.get('unit') ?? '');
		const arrangement = await arrangementOf(opened, String(form.get('email') ?? ''));
		if (!arrangement || (room && !(opened.trip.rooms ?? []).some((one) => one.id === room))) return fail(400, { error: t.trips.organising.problems.gone, id: '' });
		await opened.store.saveArrangement({ ...arrangement, room: room || undefined });
		return { saved: true };
	}
};

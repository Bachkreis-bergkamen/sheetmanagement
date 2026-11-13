import { error, fail } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { listPerson } from '#lib/server/trip-lists.ts';
import { openTrip } from '#lib/server/trips.ts';
import { newTripId } from '#lib/server/trips-store.ts';
import { PACKING_SUGGESTIONS, packedCount, packingFromText, withTick } from '#lib/trips/organising.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * The packing list (#334, step 3): one per trip, made by the organisers; everyone going ticks it
 * off on their phone, and a parent ticks their child's (?fuer=1).
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const opened = await openTrip(locals, params.id);
	const { store, trip, organises, inside } = opened;
	if (!inside) error(404, t.trips.noAccess);
	const fuer = url.searchParams.get('fuer');
	const person = listPerson(opened, fuer);
	const arrangements = await store.arrangements(trip.id);
	const packing = trip.packing ?? [];
	const ticked = person ? (arrangements.find((one) => one.email === person.email)?.packed ?? []) : [];
	// For the organisers: how far everyone is, without what each one ticked.
	const going = opened.participants.filter((p) => p.status === 'angemeldet');
	const ready = going.filter((p) => packing.length && packedCount(packing, arrangements.find((one) => one.email === p.email)).packed === packing.length).length;
	return {
		trip: { id: trip.id, title: trip.title },
		packing,
		ticked,
		person: person && { name: person.name, byParent: person.byParent },
		fuer,
		organises,
		suggestions: PACKING_SUGGESTIONS[trip.kind],
		progress: organises ? { ready, of: going.length } : null
	};
};

export const actions: Actions = {
	tick: async ({ locals, params, request, url }) => {
		const opened = await openTrip(locals, params.id);
		const form = await request.formData();
		const person = listPerson(opened, url.searchParams.get('fuer'));
		if (!person || person.participant.status !== 'angemeldet') error(403, t.messages.noRight);
		const packing = opened.trip.packing ?? [];
		const known = (await opened.store.arrangements(opened.trip.id)).find((one) => one.email === person.email) ?? { tripId: opened.trip.id, email: person.email };
		await opened.store.saveArrangement({ ...known, packed: withTick(packing, known, String(form.get('item') ?? ''), form.get('packed') === 'on') });
		return { saved: true };
	},

	items: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		if (!opened.organises) error(403, t.messages.noRight);
		const packing = packingFromText(String((await request.formData()).get('items') ?? ''), opened.trip.packing ?? [], newTripId);
		if (!packing) return fail(400, { error: t.trips.organising.problems['too-many'] });
		await opened.store.setOrganising(opened.trip.id, { packing });
		return { saved: true };
	}
};

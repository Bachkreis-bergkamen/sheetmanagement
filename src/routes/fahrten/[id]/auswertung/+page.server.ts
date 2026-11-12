import { listReader } from '#lib/server/trip-lists.ts';
import { childrenIn, openTrip } from '#lib/server/trips.ts';
import { instrumentsOnTrip, kitchen, listProgress, listsGoneOn, LIST_READERS, type ListEntry } from '#lib/trips/lists.ts';
import type { PageServerLoad } from './$types';

/**
 * The trip's lists for those who need them (#334, step 2): the organisers see every list, the
 * Betreuer·innen on the trip the diet, emergency contacts and consents. Who still has to fill in
 * what, the kitchen's counts, the instruments for the insurer, and each list as a file.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const opened = await openTrip(locals, params.id);
	const { store, trip, participants, list } = opened;
	const { organises, readable } = listReader(opened);
	const going = participants.filter((p) => p.status === 'angemeldet');
	const entries = (await store.lists(trip.id)).filter((entry) => readable.includes(entry.kind));
	const instruments = readable.includes('instrumente') ? await store.instruments(going.map((p) => p.email)) : [];
	const minors = childrenIn(list);
	const of = (entry: ListEntry) => going.find((p) => p.email === entry.email);

	return {
		trip: { id: trip.id, title: trip.title, firstDay: trip.firstDay, lastDay: trip.lastDay },
		organises,
		goneOn: listsGoneOn(trip),
		questions: trip.questions,
		readable: readable.map((kind) => ({ kind, readers: LIST_READERS[kind] })),
		progress: listProgress(trip, participants, entries, minors).filter((one) => readable.includes(one.kind)),
		kitchen: readable.includes('ernaehrung') ? kitchen(participants, entries) : null,
		instruments: readable.includes('instrumente') ? instrumentsOnTrip(participants, entries, instruments) : null,
		// Each filled-in list with the person's name, theirs only while they have a place.
		entries: entries.flatMap((entry) => {
			const person = of(entry);
			return person ? [{ kind: entry.kind, name: person.name, minor: minors.has(person.email), byParent: entry.savedBy !== entry.email, data: entry.data }] : [];
		})
	};
};

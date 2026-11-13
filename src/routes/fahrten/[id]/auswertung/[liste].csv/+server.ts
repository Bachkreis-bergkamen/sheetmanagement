import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { toCsv } from '#lib/repertoire/music-report.ts';
import { kitchenRows, listReader, listRows } from '#lib/server/trip-lists.ts';
import { openTrip } from '#lib/server/trips.ts';
import { LIST_KINDS, type ListKind } from '#lib/trips/lists.ts';
import type { RequestHandler } from './$types';

/**
 * A list of the trip as a CSV file (#334, step 2): the instruments for the insurer and customs,
 * the kitchen's counts, the emergency contacts for the Betreuer·innen. Only for those who read
 * the list; "kueche" is the diet list without names where names aren't needed.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const opened = await openTrip(locals, params.id);
	const { readable } = listReader(opened);
	const kind = params.liste === 'kueche' ? 'ernaehrung' : (params.liste as ListKind);
	if (!LIST_KINDS.includes(kind) || !readable.includes(kind)) error(404, t.trips.noAccess);
	const { store, trip, participants } = opened;
	const entries = (await store.lists(trip.id)).filter((entry) => entry.kind === kind);
	const instruments = kind === 'instrumente' ? await store.instruments(participants.filter((p) => p.status === 'angemeldet').map((p) => p.email)) : [];
	const rows = params.liste === 'kueche' ? kitchenRows(participants, entries) : listRows(kind, participants, entries, { questions: trip.questions, instruments });
	const label = params.liste === 'kueche' ? t.trips.lists.kitchen.title : t.trips.lists.kinds[kind];
	const name = `${label} ${trip.title}`.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim();
	return new Response(toCsv(rows), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${params.liste}.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`,
			'cache-control': 'private, no-store'
		}
	});
};

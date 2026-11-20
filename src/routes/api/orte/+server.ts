import { error } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { suggestPlaces } from '#lib/server/places.ts';
import type { RequestHandler } from './$types';

/** Suggestions for the location while a date is entered on /kalender: for those who may enter one. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.access.rights.has('termine.planen') && !locals.access.rights.has('archiv.bearbeiten')) error(403, t.messages.signInFirst);
	const query = (url.searchParams.get('q') ?? '').slice(0, 200);
	return Response.json({ places: await suggestPlaces(query) }, { headers: { 'cache-control': 'private, max-age=300' } });
};

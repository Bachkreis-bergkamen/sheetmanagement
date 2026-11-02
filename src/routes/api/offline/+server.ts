import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { features } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import type { RequestHandler } from './$types';

/**
 * The pieces whose pages the service worker keeps offline, once a day (#62): every piece in the
 * archive. Only for signed-in members, and only where the orchestra uses offline mode.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.auth !== 'on' || !locals.access.member) error(403, t.messages.membersOnly);
	if (!features().offline) error(404, t.messages.noFile);
	const library = await getLibrary();
	if (!library.catalog.ok) error(503, t.messages.archiveUnavailable);
	return Response.json({ pieces: library.pieces.map((piece) => piece.id) }, { headers: { 'cache-control': 'private, no-store' } });
};

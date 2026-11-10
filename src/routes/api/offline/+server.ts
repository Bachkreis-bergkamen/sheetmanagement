import { error } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { features } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { upcomingParts } from '#lib/server/my-concerts.ts';
import { getAccessList, getMusicConfig, getPartAssignments } from '#lib/server/repertoire.ts';
import type { RequestHandler } from './$types';

/**
 * What the service worker keeps offline, once a day (#62): every piece's page in the archive, and
 * the member's own parts for their next two concerts, so the viewer opens them without a
 * connection. Only for signed-in members, and only where the orchestra uses offline mode.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.auth !== 'on' || !locals.access.member || !locals.access.user) error(403, t.messages.membersOnly);
	if (!features().offline) error(404, t.messages.noFile);
	const [library, access, music, assignments] = await Promise.all([getLibrary(), getAccessList(), getMusicConfig(), getPartAssignments()]);
	if (!library.catalog.ok) error(503, t.messages.archiveUnavailable);
	const member = access?.membersByEmail.get(normalizeEmail(locals.access.user.email));
	return Response.json(
		{
			pieces: library.pieces.map((piece) => piece.id),
			parts: member ? upcomingParts(library, member, music, assignments.assignments) : []
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};

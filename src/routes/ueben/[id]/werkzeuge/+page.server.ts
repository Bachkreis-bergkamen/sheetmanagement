import { error } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { youtubeId } from '#lib/links.ts';
import { getCatalog } from '#lib/server/catalog.ts';
import { getLibrary } from '#lib/server/library.ts';
import { archivePart } from '#lib/server/practice.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { PageServerLoad } from './$types';

/**
 * The practice viewer's tools in a window of their own (#410), opened from the part's page,
 * e.g. for a second screen: the piece's recording, metronome, tuner and drone. For members only,
 * like the viewer.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.membersOnly);
	const [catalog, access, library] = await Promise.all([getCatalog(), getAccessList(), getLibrary()]);
	if (!catalog.ok) error(503, t.messages.archiveUnavailable);
	const member = access?.membersByEmail.get(normalizeEmail(user.email));
	const found = member ? archivePart(catalog.catalog, params.id) : null;
	if (!found) error(404, t.messages.noFile);
	const recording = library.piecesById.get(found.piece.id)?.sheet?.recording;
	return {
		piece: found.piece.title,
		part: found.part.label,
		recording: recording ? { url: recording, youtube: youtubeId(recording) } : null
	};
};

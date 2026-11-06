import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { getLibrary } from '#lib/server/library.ts';
import { pieceFindables } from '#lib/server/piece-search.ts';
import { getPieceNotes } from '#lib/server/repertoire.ts';
import { searchText } from '#lib/music/text.ts';
import type { RequestHandler } from './$types';

/**
 * What the quick search (Ctrl+K) looks through: every piece (with its parts and notes, as the
 * archive searches them) and every concert, small enough
 * to send once and search in the browser while typing.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.auth === 'on' && !locals.access.member) error(401, t.messages.signInFirst);
	const [library, pieceNotes] = await Promise.all([getLibrary(), getPieceNotes()]);
	// Parts and notes too, so it finds the same pieces as the archive's list ("Bariton", "Goldfinger").
	const findables = pieceFindables(library, pieceNotes);
	return Response.json(
		{
			pieces: library.pieces.map((piece) => ({
				id: piece.id,
				title: piece.title,
				composer: piece.composer,
				search: piece.search,
				instruments: findables.get(piece.id)?.instruments ?? [],
				notes: findables.get(piece.id)?.notes ?? []
			})),
			concerts: library.concerts.map((concert) => ({
				id: concert.id,
				title: concert.title,
				when: concert.label?.long ?? concert.dateText ?? '',
				dateKey: concert.dateKey,
				search: searchText(concert.title, concert.location, concert.label?.year)
			})),
			today: library.today
		},
		// Per person and short: the archive changes when someone edits the sheet.
		{ headers: { 'cache-control': 'private, max-age=300' } }
	);
};

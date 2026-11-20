import { fail } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { DETAIL_FILTERS, gapCounts, gapsOf, parseGapFilter } from '#lib/repertoire/details.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { formText, setRecording } from '#lib/server/feedback.ts';
import { getLibrary } from '#lib/server/library.ts';
import { SheetLayoutError } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

const RIGHT = 'stuecke.bearbeiten';

/** Pieces with gaps in their details, to work through on the edit page one after another. */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireRight(locals, RIGHT);
	const library = await getLibrary();
	const filter = parseGapFilter(url.searchParams.get('filter')) ?? 'alle';
	const counts = gapCounts(library.pieces);
	return {
		filter,
		filters: DETAIL_FILTERS.map((value) => ({ value, count: counts[value] })),
		total: library.pieces.filter((piece) => piece.sheet).length,
		done: url.searchParams.has('fertig'),
		pieces: library.pieces
			.map((piece) => ({ id: piece.id, title: piece.title, composer: piece.composer, catalogue: piece.catalogue, gaps: gapsOf(piece, filter) }))
			.filter((piece) => piece.gaps.length)
	};
};

export const actions: Actions = {
	/** "Gibt es keins": "keins" in the piece's Hörbeispiel, so the list stops asking for one. */
	noRecording: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		const piece = (await getLibrary()).piecesById.get(formText(await request.formData(), 'id', 200));
		if (!piece?.sheet) return fail(404, { message: t.messages.noPiece });
		try {
			if (!(await setRecording(piece.sheet, t.sheetValues.noRecording))) return fail(404, { message: t.messages.noPiece });
			return { noRecording: piece.title };
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message });
			console.error('Marking a piece without a recording failed:', cause);
			return fail(503, { message: t.messages.sheetFailed });
		}
	}
};

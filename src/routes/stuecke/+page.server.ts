import { fileUrl } from '#lib/server/catalog.ts';
import { getLibrary } from '#lib/server/library.ts';
import type { PieceSummary } from '#lib/music/types.ts';
import { addPiece } from '#lib/server/archive.ts';
import { getPieceNotes } from '#lib/server/repertoire.ts';
import { partInstruments } from '#lib/music/piece-search.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * A piece in the list; `recording` marks a Hörbeispiel in the sheet. The search also looks at
 * `instruments` (those with a part) and `notes`: the sheet's "Notiz" and the piece's Hinweise.
 */
type ListedPiece = PieceSummary & { recording: boolean; instruments: string[]; notes: string[] };

export const load: PageServerLoad = async ({ locals }) => {
	const [library, pieceNotes] = await Promise.all([getLibrary(), getPieceNotes()]);
	const canAdd = locals.access.rights.has('archiv.bearbeiten') && library.sheet === 'ok';
	if (!library.catalog.ok) {
		return {
			canAdd,
			error: library.catalog.reason,
			pieces: [] as ListedPiece[],
			categories: [] as string[],
			programs: [] as string[],
			categoryFiles: {} as Record<string, { id: string; name: string; url: string }[]>
		};
	}

	// Hinweise by the piece's title in "Stücke", as on the piece page.
	const hints = new Map<string, string[]>();
	for (const note of pieceNotes.notes) {
		const key = normalize(note.pieceName);
		hints.set(key, [...(hints.get(key) ?? []), note.text]);
	}

	// Only what the list shows; of the parts just their instruments, for the search.
	const pieces: ListedPiece[] = library.pieces.map(
		({ id, title, composer, catalogue, category, programs, partCount, status, search, sheet, detail }) => ({
			id,
			title,
			composer,
			catalogue,
			category,
			programs,
			partCount,
			status,
			search,
			recording: !!sheet?.recording,
			instruments: partInstruments(detail?.parts ?? []),
			notes: [sheet?.notes ?? '', ...(hints.get(normalize(sheet?.title ?? title)) ?? [])].filter(Boolean)
		})
	);
	const categories = [...new Set(pieces.map((piece) => piece.category).filter((c): c is string => !!c))];
	// Loose files in a category folder, e.g. the running order of the Christmas pieces.
	const categoryFiles = Object.fromEntries(
		Object.entries(library.catalog.catalog.categoryFiles).map(([category, files]) => [
			category,
			files.map((file) => ({ id: file.id, name: file.name.replace(/\.pdf$/i, ''), url: fileUrl(file.id, file.mimeType) }))
		])
	);
	return { error: null, pieces, categories, programs: library.catalog.catalog.programs, categoryFiles, canAdd };
};

export const actions: Actions = {
	addPiece: ({ locals, request }) => addPiece(locals, request)
};

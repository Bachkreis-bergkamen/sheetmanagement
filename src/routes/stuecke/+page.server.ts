import { fileUrl } from '#lib/server/catalog.ts';
import { getLibrary, isPastConcert } from '#lib/server/library.ts';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { parseInstruments, sharedPartsFor } from '#lib/music/my-parts.ts';
import { forMember } from '#lib/music/part-assignments.ts';
import type { PieceSummary } from '#lib/music/types.ts';
import { addPiece } from '#lib/server/archive.ts';
import { getAccessList, getPartAssignments, getPieceNotes } from '#lib/server/repertoire.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import { pieceFindables } from '#lib/server/piece-search.ts';
import { difficultyOptions, genreOptions, lengthOf, pieceGenres, type Length } from '#lib/music/piece-filters.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * A piece in the list; `recording` marks a Hörbeispiel in the sheet. The search also looks at
 * `instruments` (those with a part) and `notes`: the sheet's "Notiz" and the piece's Hinweise.
 * For the filters "Für mich": `mine` has a part for one of the member's instruments, `assigned`
 * has a part assigned to them (#262), `coming` is in a coming concert's programme.
 */
type ListedPiece = PieceSummary & {
	recording: boolean;
	instruments: string[];
	notes: string[];
	mine: boolean;
	assigned: boolean;
	coming: boolean;
	/** From "Genre" and the Drive folder: "Weihnachtsstücke" counts as Weihnachten. */
	genres: string[];
	difficulty?: string;
	length?: Length;
};

export const load: PageServerLoad = async ({ locals }) => {
	const [library, pieceNotes, access, assignments] = await Promise.all([getLibrary(), getPieceNotes(), getAccessList().catch(() => null), getPartAssignments()]);
	const canAdd = locals.access.rights.has('archiv.bearbeiten') && library.sheet === 'ok';
	if (!library.catalog.ok) {
		return {
			canAdd,
			error: library.catalog.reason,
			pieces: [] as ListedPiece[],
			categories: [] as string[],
			difficulties: [] as string[],
			programs: [] as string[],
			categoryFolders: {} as Record<string, string[]>,
			categoryFiles: {} as Record<string, { id: string; name: string; url: string }[]>
		};
	}

	const findables = pieceFindables(library, pieceNotes);

	// What's the member's: their instruments (and the parts they share, "Streicher"), the pieces
	// a part was assigned to them in, and what the coming concerts play.
	const email = locals.access.user ? normalizeEmail(locals.access.user.email) : null;
	const member = email ? access?.membersByEmail.get(email) : undefined;
	const played = new Set(parseInstruments(member?.instrument ?? '', config).flatMap((choice) => [choice.instrument, ...sharedPartsFor(choice.instrument, config)]));
	const assignedTitles = new Set(
		assignments.assignments
			.filter((assignment) => email && forMember(assignment) && normalizeEmail(assignment.who) === email && assignment.pieceName)
			.map((assignment) => normalize(assignment.pieceName))
	);
	const coming = new Set(library.concerts.filter((concert) => !isPastConcert(concert, library.today)).flatMap((concert) => concert.program.map((item) => item.pieceId)));

	// Only what the list shows; of the parts just their instruments, for the search.
	const pieces: ListedPiece[] = library.pieces.map(({ id, title, composer, catalogue, category, programs, partCount, status, search, sheet }) => ({
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
		instruments: findables.get(id)?.instruments ?? [],
		notes: findables.get(id)?.notes ?? [],
		mine: (findables.get(id)?.instruments ?? []).some((name) => played.has(name)),
		assigned: assignedTitles.has(normalize(sheet?.title ?? title)),
		coming: coming.has(id),
		genres: pieceGenres({ genre: sheet?.genre, category }, config.genres ?? []),
		...(sheet?.difficulty ? { difficulty: sheet.difficulty.trim() } : {}),
		...(lengthOf(sheet?.duration) ? { length: lengthOf(sheet?.duration) } : {})
	}));
	const categories = genreOptions(pieces.flatMap((piece) => piece.genres), config.genres ?? []);
	// The Drive folders behind a genre ("Weihnachten" → "Weihnachtsstücke"), for their loose files.
	const categoryFolders: Record<string, string[]> = {};
	for (const folder of new Set(pieces.map((piece) => piece.category).filter((c): c is string => !!c))) {
		const genre = pieceGenres({ category: folder }, config.genres ?? [])[0];
		(categoryFolders[genre] ??= []).push(folder);
	}
	// Loose files in a category folder, e.g. the running order of the Christmas pieces.
	const categoryFiles = Object.fromEntries(
		Object.entries(library.catalog.catalog.categoryFiles).map(([category, files]) => [
			category,
			files.map((file) => ({
				id: file.id,
				name: file.name.replace(/\.pdf$/i, ''),
				url: fileUrl(file.id, file.mimeType)
			}))
		])
	);
	return {
		error: null,
		pieces,
		categories,
		categoryFolders,
		difficulties: difficultyOptions(pieces.flatMap((piece) => (piece.difficulty ? [piece.difficulty] : []))),
		programs: library.catalog.catalog.programs,
		categoryFiles,
		canAdd
	};
};

export const actions: Actions = {
	addPiece: ({ locals, request }) => addPiece(locals, request)
};

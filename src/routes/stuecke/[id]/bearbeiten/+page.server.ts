import { error, fail, redirect } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { gapsOf, nextWithGaps, parseGapFilter } from '#lib/repertoire/details.ts';
import { t } from '#lib/i18n/index.ts';
import { searchText } from '#lib/music/text.ts';
import { checkPieceValues, EDITABLE, findPieceRow, pieceValues, pieceVersion, renameInProgram, writableValues, type PieceValues } from '#lib/repertoire/piece-edit.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { getLibrary } from '#lib/server/library.ts';
import { instrumentationFromParts } from '#lib/music/instrumentation.ts';
import { playableInstruments, playedParts } from '#lib/music/my-parts.ts';
import { getRepertoire } from '#lib/server/repertoire.ts';
import { youtubeEnabled } from '#lib/server/youtube.ts';
import { listItems } from '#lib/repertoire/lists.ts';
import { readTab, refreshAfterWrite, SheetLayoutError, updateRecord, updateRecords } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

const RIGHT = 'stuecke.bearbeiten';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	requireRight(locals, RIGHT);
	const [library, repertoire] = await Promise.all([getLibrary(), getRepertoire()]);
	const piece = library.piecesById.get(params.id);
	if (!piece) error(404, t.messages.noPiece);
	const row = piece.sheet && repertoire.ok ? findPieceRow(repertoire.repertoire.tables.pieces, piece.sheet) : undefined;
	if (!row) return { state: 'not-in-sheet' as const, piece: { id: piece.id, title: piece.title } };

	const values = pieceValues(row);
	// A Drive piece without its own title in the sheet shows what the folder name says; start from that.
	if (!values.title) values.title = piece.title;
	// Names already in use, one by one ("Mozart, Haydn" offers both), so typing follows the archive's words.
	const used = (pick: (p: (typeof library.pieces)[number]) => string | undefined) =>
		listItems(library.pieces.map(pick)).sort((a, b) => a.localeCompare(b, config.locale));
	const genres = listItems([...(config.genres ?? []), ...used((p) => p.sheet?.genre)]);
	const pdfs = (piece.detail?.parts ?? []).filter((part) => part.mimeType === 'application/pdf' && part.status === 'ok');
	// The score first: its title page names composer and arranger most often.
	const files = [...pdfs.filter((part) => part.kind === 'partitur'), ...pdfs.filter((part) => part.kind !== 'partitur')]
		.slice(0, 12)
		.map((part) => ({ id: part.id, label: part.label }));
	// Working through "Angaben ergänzen": where "Speichern & weiter" goes next.
	const list = parseGapFilter(url.searchParams.get('liste'));
	return {
		state: 'ready' as const,
		piece: { id: piece.id, title: piece.title, folderName: piece.detail?.folderName, category: piece.category },
		values,
		version: pieceVersion(row),
		// Columns an older sheet lacks; their fields wait until "Tabelle einrichten" adds them.
		missing: EDITABLE.filter((column) => repertoire.ok && repertoire.repertoire.tables.pieces.missing.includes(column)),
		genres,
		composers: listItems([...config.naming.knownComposers, ...used((p) => p.sheet?.composer)]),
		arrangers: used((p) => p.sheet?.arranger),
		publishers: used((p) => p.sheet?.publisher),
		files,
		// Beside the Besetzung picker, for members who may read them: the score first, then every
		// part, so a percussion part can be opened to see what it holds.
		sheets:
			locals.auth === 'on' && locals.access.member
				? [...pdfs.filter((part) => part.kind === 'partitur'), ...pdfs.filter((part) => part.kind !== 'partitur')].map((part) => ({
						id: part.id,
						label: part.label,
						score: part.kind === 'partitur',
						voices: part.voices.map(({ instrument, numbers }) => ({ instrument, numbers }))
					}))
				: [],
		// The Besetzung as the parts there are spell it, to take over in one tap.
		fromParts: piece.detail ? instrumentationFromParts(playedParts(piece.detail)) : '',
		// The PDFs come through the app, which is for signed-in members.
		canRead: locals.auth === 'on' && locals.access.member,
		// A duration from the Hörbeispiel's video, with a YouTube key (#133).
		videoLength: youtubeEnabled(),
		list: list ? { filter: list, open: library.pieces.filter((p) => gapsOf(p, list).length).length } : null,
		// The Besetzung's instrument picker, as on the profile.
		instruments: playableInstruments(config)
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		// A medley's contents may run longer than one line.
		const submitted = Object.fromEntries(
			EDITABLE.map((column) => [column, String(data.get(column) ?? '').slice(0, column === 'contents' ? 4000 : 1000)])
		) as PieceValues;

		const library = await getLibrary();
		const sheetPiece = library.piecesById.get(params.id)?.sheet;
		if (!sheetPiece) return fail(409, { message: t.pieceEditor.notInSheet, values: submitted });

		let renamed = 0;
		try {
			const table = await readTab('pieces');
			const row = findPieceRow(table, sheetPiece);
			if (!row) return fail(409, { message: t.pieceEditor.notInSheet, values: submitted });
			if (pieceVersion(row) !== String(data.get('version'))) return fail(409, { message: t.pieceEditor.conflict, values: submitted });
			const checked = checkPieceValues(submitted, table, row.row);
			if ('problem' in checked) return fail(400, { message: t.pieceEditor.problems[checked.problem], values: submitted });

			await updateRecord('pieces', table, row.row, writableValues(checked.values, table));
			// Programme rows name pieces by title: a rename has to follow there, or they lose the piece.
			const oldTitle = row.values.title;
			if (oldTitle && oldTitle !== checked.values.title) {
				const program = await readTab('program');
				const updates = renameInProgram(program, oldTitle, checked.values.title);
				await updateRecords('program', program, updates);
				renamed = updates.length;
			}
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message, values: submitted });
			console.error('Saving a piece failed:', cause);
			return fail(503, { message: t.messages.sheetFailed, values: submitted });
		}

		// "Speichern & weiter": the next piece in the list being worked through.
		const list = parseGapFilter(String(data.get('liste') ?? ''));
		if (list) {
			const next = nextWithGaps((await getLibrary()).pieces, list, params.id);
			redirect(303, next ? `/stuecke/${encodeURIComponent(next)}/bearbeiten?liste=${list}` : `/stuecke/angaben?filter=${list}&fertig`);
		}
		// Pieces without sheet music are keyed by title, so a rename gives them a new address.
		const id = sheetPiece.driveFolderId
			? params.id
			: ((await getLibrary()).pieces.find((piece) => !piece.detail && searchText(piece.title) === searchText(submitted.title.trim()))?.id ??
				params.id);
		redirect(303, `/stuecke/${encodeURIComponent(id)}?gespeichert=${renamed}`);
	}
};

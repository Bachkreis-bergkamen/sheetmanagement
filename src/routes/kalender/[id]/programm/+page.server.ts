import { error, fail, redirect } from '@sveltejs/kit';
import { parseEntries, planProgramSave, programVersion, type OrchestraScope } from '#lib/repertoire/program-edit.ts';
import { addPieceFromProgram, pickablePieces } from '#lib/server/archive.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { isOn } from '#lib/server/env.ts';
import { getLibrary, type Library, type LibraryConcert } from '#lib/server/library.ts';
import { concertOrchestras, pickOrchestra, programLabel, programScopes, sameOrchestra } from '#lib/repertoire/orchestras.ts';
import { performerNames, withGuests } from '#lib/repertoire/ensembles.ts';
import { formatDuration } from '#lib/repertoire/duration.ts';
import { getFeedback, getRepertoire } from '#lib/server/repertoire.ts';
import { planWishes } from '#lib/server/feedback.ts';
import { programSuggestions } from '#lib/repertoire/suggestions.ts';
import { appendRecords, deleteRows, readTab, refreshAfterWrite, SheetLayoutError, updateRecord } from '#lib/server/sheet-writes.ts';
import { findConcertRow, programConcert, type SheetConcert } from '#lib/repertoire/sheet.ts';
import { joinList } from '#lib/repertoire/lists.ts';
import { t } from '#lib/i18n/index.ts';
import { currentProgramAvailable, isCurrentConcert, syncCurrentProgram } from '#lib/server/current-program.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * The orchestra being edited ("?orchester=A"), for a concert several orchestras (or we and
 * guests) play; what our orchestras play together first, else our first orchestra's.
 */
function scopeOf(concert: LibraryConcert, wanted: string | null): OrchestraScope {
	const partners = concert.partners.map((partner) => partner.shortName);
	return { orchestra: pickOrchestra(concert.orchestras, wanted || joinList(concert.orchestras), partners), orchestras: concert.orchestras, partners };
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	requireRight(locals, 'programme.bearbeiten');
	const [library, repertoire, feedback] = await Promise.all([getLibrary(), getRepertoire(), getFeedback()]);
	const concert = library.concertsById.get(params.id);
	if (!concert) error(404, t.messages.noConcert);
	if (!concert.sheet || !repertoire.ok) {
		return { state: 'not-in-sheet' as const, concert: { id: concert.id, title: concert.title } };
	}

	const sheet = concert.sheet;
	const scope = scopeOf(concert, url.searchParams.get('orchester'));
	// Sheet entries and library items are sorted alike, so they line up one by one.
	const own = sheet.program.flatMap((entry, i) => (sameOrchestra(entry.orchestra, scope.orchestra) ? [{ entry, item: concert.program[i] }] : []));
	const scopes = programScopes(concert.orchestras, scope.partners);
	const names = (short: string) => performerNames(short, concert.partners)[0] ?? short;
	return {
		state: 'ready' as const,
		concert: { id: concert.id, title: concert.title },
		// Tabs only when several orchestras (or guests) play the concert: one each, and for playing together.
		orchestra: scope.orchestra ?? '',
		orchestras: scopes.length > 1 ? scopes : [],
		labels: Object.fromEntries(scopes.map((name) => [name, programLabel(name, names)])),
		// Guests play in this tab: pieces not in our archive can be typed in with what the GEMA list needs.
		guests: withGuests(scope.orchestra, concert.partners),
		/** Who plays in this tab, guests by their full name: "EO", "Kammerchor Unna". */
		scopeNames: performerNames(scope.orchestra, concert.partners),
		version: programVersion(repertoire.repertoire.tables.program, programConcert(repertoire.repertoire, sheet), scope),
		entries: own.map(({ entry, item }) => ({
			piece: entry.pieceName,
			notes: entry.notes ?? '',
			title: item?.title ?? entry.pieceName,
			subtitle: item?.subtitle,
			duration: item?.duration,
			// Sent back as they are, so saving keeps a guest piece's details.
			...(entry.composer ? { composer: entry.composer } : {}),
			...(entry.arranger ? { arranger: entry.arranger } : {}),
			...(entry.publisher ? { publisher: entry.publisher } : {}),
			...(entry.duration ? { durationText: formatDuration(entry.duration) } : {})
		})),
		suggestions: suggestions(library, concert.id, sheet.ref, isOn('wishes') ? (feedback?.wishes ?? []) : []),
		sharedFrom: concert.sharedFrom,
		sharedWith: concert.sharedWith,
		shareOptions: shareOptions(library, concert.id),
		// Only pieces with a row in "Stücke" can be picked; that's what the sheet's dropdown allows too.
		pieces: pickablePieces(library),
		// Pieces not in the archive yet can be added from here (#192).
		canAddPieces: locals.access.rights.has('archiv.bearbeiten')
	};
};

/**
 * Concerts whose programme this one could take over (#70): those in the sheet with a
 * programme of their own, the ones closest in time first.
 */
function shareOptions(library: Library, concertId: string) {
	const concert = library.concertsById.get(concertId);
	// "1957" and "1957-12" count as the middle of the year or month.
	const day = (key: string) => Date.parse(key.length === 4 ? `${key}-07-01` : key.length === 7 ? `${key}-15` : key) / 86_400_000;
	const distance = (key: string) => (concert?.dateKey && key ? Math.abs(day(concert.dateKey) - day(key)) : Infinity);
	return library.concerts
		.filter((other) => other.id !== concertId && other.sheet?.title && other.program.length && !other.sharedFrom)
		.sort((a, b) => distance(a.dateKey) - distance(b.dateKey))
		.slice(0, 30)
		.map((other) => ({ name: other.sheet!.ref, title: other.title, label: other.label?.long ?? other.dateText ?? '', count: other.program.length }));
}

/** Wishes for this concert or any time, and pieces not played for long, ready to add (#91, #108). */
function suggestions(library: Library, concertId: string, concertTitle: string, wishes: NonNullable<Awaited<ReturnType<typeof getFeedback>>>['wishes']) {
	const concert = library.concertsById.get(concertId);
	const lastPlayed = (ids: string[]) =>
		ids
			.map((id) => library.concertsById.get(id)?.dateKey)
			.filter((key): key is string => !!key && key < library.today)
			.sort()
			.at(-1);
	const result = programSuggestions({
		concertTitle,
		programPieceIds: (concert?.program ?? []).flatMap((item) => item.pieceId ?? []),
		today: library.today,
		pieces: library.pieces.map((piece) => ({
			id: piece.id,
			title: piece.title,
			genre: piece.sheet?.genre,
			lastPlayed: lastPlayed(piece.playedAt),
			pickable: !!piece.sheet?.title
		})),
		wishes: wishes
			.filter((wish) => wish.kind === 'piece')
			.map(({ id, title, pieceId, concert: wishConcert, votes, status }) => ({ id, title, pieceId, concert: wishConcert, votes: votes.length, status }))
	});
	// What the editor needs to add one, plus hints for the planner.
	const shown = (suggestion: (typeof result.wished)[number]) => {
		const piece = suggestion.pieceId ? library.piecesById.get(suggestion.pieceId) : undefined;
		return {
			...suggestion,
			name: piece?.sheet?.title,
			subtitle: piece ? [piece.composer, piece.catalogue].filter(Boolean).join(' · ') || undefined : undefined,
			status: piece?.status,
			duration: piece?.sheet?.duration
		};
	};
	return { wished: result.wished.map(shown), longAgo: result.longAgo.map(shown), genres: result.genres };
}

/** Clears "Programm wie" on the concert's row, so its own rows count. */
async function clearShare(concert: SheetConcert) {
	const concerts = await readTab('concerts');
	if (concerts.indexes.sameProgramAs === undefined) return;
	const row = findConcertRow(concerts, concert);
	if (row?.values.sameProgramAs) await updateRecord('concerts', concerts, row.row, { sameProgramAs: '' });
}

/** The sheet as read for the library, for finding a concert's rows by the names they use. */
async function sheetConcert(sheet: SheetConcert) {
	const repertoire = await getRepertoire();
	if (!repertoire.ok) throw new Error('The sheet could not be read.');
	return programConcert(repertoire.repertoire, sheet);
}

/**
 * "ok" or "fehler" after syncing the orchestra's Drive folder, empty when it isn't this
 * concert's turn. Pieces played together go into each of their orchestras' folders.
 */
async function syncIfCurrent(id: string, scope: string | undefined): Promise<string> {
	if (!currentProgramAvailable()) return '';
	const library = await getLibrary();
	const concert = library.concertsById.get(id);
	if (!concert) return '';
	// Guests have no Drive folder here: only our orchestras of the scope.
	const orchestras = scope ? concertOrchestras(scope).filter((name) => concert.orchestras.some((own) => sameOrchestra(own, name))) : [undefined];
	let result = '';
	for (const orchestra of orchestras.filter((name) => isCurrentConcert(concert, library, name))) {
		const done = await syncCurrentProgram(concert, library, orchestra).then(
			() => 'ok',
			(cause) => {
				console.error('Syncing the current programme failed:', cause);
				return 'fehler';
			}
		);
		if (result !== 'fehler') result = done;
	}
	return result;
}

export const actions: Actions = {
	/** A piece that isn't in the archive yet, created from the search; the editor adds it to the programme. */
	newPiece: async ({ request, locals }) => addPieceFromProgram(locals, await request.formData()),

	save: async ({ params, request, locals }) => {
		requireRight(locals, 'programme.bearbeiten');
		const data = await request.formData();
		const entries = parseEntries(String(data.get('entries') ?? ''));
		if (!entries) return fail(400, { message: t.messages.programUnreadable });

		const library = await getLibrary();
		const concert = library.concertsById.get(params.id);
		const sheet = concert?.sheet;
		if (!concert || !sheet) return fail(409, { message: t.editor.notInSheet });
		const scope = scopeOf(concert, String(data.get('orchestra') ?? ''));

		try {
			const [table, named] = await Promise.all([readTab('program'), sheetConcert(sheet)]);
			if (programVersion(table, named, scope) !== String(data.get('version'))) {
				return fail(409, { message: t.editor.conflict });
			}
			const plan = planProgramSave(table, named, entries, scope);
			// New rows first: if deleting the old ones fails, nothing is lost, only doubled.
			await appendRecords('program', table, plan.append);
			await deleteRows('program', table, plan.remove);
			// A concert that played another one's programme now has its own.
			if (sheet.sameProgramAs) await clearShare(sheet);
			// Wishes taken into the programme become "geplant"; the programme counts even if this fails.
			const wishIds = String(data.get('wishes') ?? '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 50);
			await planWishes(wishIds).catch((cause) => console.error('Marking wishes as planned failed:', cause));
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message });
			console.error('Saving a programme failed:', cause);
			return fail(503, { message: t.messages.sheetFailed });
		}
		// The orchestra's next concert: its pieces go into "01 | Aktuelles Programm" too (#60).
		// The programme is saved either way; the concert page says how Drive went.
		const drive = await syncIfCurrent(params.id, scope.orchestra);
		redirect(303, `/kalender/${encodeURIComponent(params.id)}?gespeichert${drive ? `&drive=${drive}` : ''}`);
	},

	/** Plays another concert's programme from now on; this concert's own rows go. */
	share: async ({ params, request, locals }) => {
		requireRight(locals, 'programme.bearbeiten');
		const data = await request.formData();
		const library = await getLibrary();
		const concert = library.concertsById.get(params.id);
		const sheet = concert?.sheet;
		if (!concert || !sheet) return fail(409, { message: t.editor.notInSheet });
		const repertoire = await getRepertoire();
		const picked = repertoire.ok ? repertoire.repertoire.concertNames.get(String(data.get('source') ?? '')) : undefined;
		const source = picked && library.concerts.find((other) => other.sheet?.key === picked.key);
		if (!source?.sheet || source.sheet.key === sheet.key || !source.program.length) {
			return fail(400, { message: t.editor.shareUnknown });
		}

		try {
			const [table, concerts, named] = await Promise.all([readTab('program'), readTab('concerts'), sheetConcert(sheet)]);
			// The version the editor showed: of the orchestra it had open.
			if (programVersion(table, named, scopeOf(concert, String(data.get('orchestra') ?? ''))) !== String(data.get('version'))) {
				return fail(409, { message: t.editor.conflict });
			}
			const row = findConcertRow(concerts, sheet);
			if (!row) return fail(409, { message: t.editor.notInSheet });
			// The column first: if that fails, the old programme is still there.
			await updateRecord('concerts', concerts, row.row, { sameProgramAs: source.sheet.ref });
			await deleteRows('program', table, planProgramSave(table, named, []).remove);
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: t.editor.shareNeedsSetup });
			console.error('Sharing a programme failed:', cause);
			return fail(503, { message: t.messages.sheetFailed });
		}
		redirect(303, `/kalender/${encodeURIComponent(params.id)}?gespeichert`);
	}
};

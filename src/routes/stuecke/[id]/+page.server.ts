import { error, fail, isHttpError, redirect } from '@sveltejs/kit';
import { isActiveReport, newId, REPORT_KINDS, type ReportKind } from '#lib/feedback/feedback.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { normalizeEmail } from '#lib/access/access.ts';
import { commonInstruments, formatInstrument, matchParts, parseInstruments, playableInstruments, playedParts } from '#lib/music/my-parts.ts';
import { feedbackUser, formText, playAgain } from '#lib/server/feedback.ts';
import { reportFromForm } from '#lib/server/report-form.ts';
import { features, isOn } from '#lib/server/env.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { getAccessList, getFeedback, getLoans, getMusicConfig, getPartAssignments, getPieceNotes, getRehearsalPlan, getScanTasks } from '#lib/server/repertoire.ts';
import { isGap, priorityRank } from '#lib/repertoire/missing-parts.ts';
import { planScans, scanners } from '#lib/server/scan-tasks.ts';
import { addAssignment, assignmentEditor, comingConcerts, deleteAssignment } from '#lib/server/part-assignments.ts';
import { choicesAt } from '#lib/music/part-assignments.ts';
import { checkNote, notesOf, sectionOptions } from '#lib/notes/piece-notes.ts';
import { today } from '#lib/server/members.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import { daysUntilDue, loanState, loansOf } from '#lib/loans/loans.ts';
import { formatDay } from '#lib/events/format.ts';
import { pieceArt } from '#lib/music/piece-art.ts';
import { missingVoices, readInstrumentation } from '#lib/music/instrumentation.ts';
import { bandFor, filmArt, filmSourceUrl } from '#lib/server/film-art.ts';
import { portraitFor, portraitPageUrl } from '#lib/server/portraits.ts';
import { appendRecords, deleteRows, ensureTab, readTab, refreshAfterWrite, SheetLayoutError } from '#lib/server/sheet-writes.ts';
import { folderUrl, partUrl } from '#lib/server/catalog.ts';
import { addPlaceholder, createPieceFolder, folderTools, FolderError } from '#lib/server/piece-folder.ts';
import { listsOverlap } from '#lib/repertoire/lists.ts';
import { workKey } from '#lib/music/piece-name.ts';
import { formatDuration } from '#lib/repertoire/duration.ts';
import { concertSummary, getLibrary, isPastConcert, namedItem, type Library, type LibraryPiece } from '#lib/server/library.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const on = features();
	const [library, feedback, plan, loans, pieceNotes, access, music, assignments] = await Promise.all([
		getLibrary(),
		getFeedback(),
		getRehearsalPlan(),
		on.loans ? getLoans() : null,
		getPieceNotes(),
		locals.access.user ? getAccessList() : null,
		getMusicConfig(),
		getPartAssignments()
	]);
	const piece = library.piecesById.get(params.id);
	if (!piece) {
		if (!library.catalog.ok) error(503, t.messages.archiveUnavailable);
		error(404, t.messages.noPiece);
	}

	const { detail, sheet } = piece;
	// The Besetzung (#249), and what of it has no part to play from.
	const scored = readInstrumentation(sheet?.instrumentation, music);
	const unscored = detail?.parts.length ? missingVoices(scored, playedParts(detail), music) : [];
	const byComposer = piece.composer
		? library.pieces.filter((other) => other.id !== piece.id && sameComposer(other.composer, piece.composer))
		: [];
	const work = workKey(piece.title);
	const canClose = locals.access.rights.has('stuecke.bearbeiten');
	// "Wieder spielen": the +1s on the piece's open or planned wish.
	const user = feedbackUser(locals);
	const againWish = (feedback?.wishes ?? []).find((wish) => wish.pieceId === piece.id && (wish.status === 'open' || wish.status === 'planned'));
	// The banner's picture: for film music and musicals the film's logo or an icon for it (#312),
	// else the composer's portrait, else their band's logo (#319), else a drawing for the genre or the title.
	const art = pieceArt({ genre: sheet?.genre, title: piece.title });
	const screen = art === 'filmmusik' || art === 'musical';
	const film = screen ? await filmArt(piece.title, art === 'musical') : null;
	const [portrait, band] = film ? [null, null] : await Promise.all([portraitFor(piece.composer), bandFor(piece.composer)]);
	const logo = film ?? (portrait ? null : band);
	// The member's own parts (#216), matched like "Meine Noten": from their instruments in "Mitglieder".
	const member = locals.access.user ? access?.membersByEmail.get(normalizeEmail(locals.access.user.email)) : undefined;
	// What they play here: their own instruments, or the part assigned to them (#262) for this piece and its coming concerts.
	const choices = member
		? choicesAt(
				{ email: member.email, choices: parseInstruments(member.instrument ?? '', config) },
				assignments.assignments,
				{ piece: sheet?.title ?? piece.title, concerts: comingConcerts(library, piece) },
				config
			)
		: [];
	const played = detail && choices.length ? playedParts(detail) : [];
	// "Zu scannen": the piece's gaps with their planned scans, for whoever plans them.
	const gaps = canClose ? (detail?.parts ?? []).filter(isGap) : [];
	const [tasks, people] = gaps.length ? await Promise.all([getScanTasks(), scanners().catch(() => [])]) : [new Map(), []];
	const me = normalizeEmail(locals.access.user?.email ?? '');
	const viewer = locals.auth === 'on' && !!member;
	const mine = choices.flatMap((choice) => {
		const { own, shared } = matchParts(played, choice, music);
		return [...own.map((part) => ({ part, shared: false })), ...shared.map((part) => ({ part, shared: true }))];
	});
	return {
		banner: {
			art,
			film: logo && {
				// The picture's file in the address too: the browser keeps each answer for a month, so another picture needs another address.
				src: `/api/filmbild?${new URLSearchParams({
					...(film ? { titel: piece.title, ...(art === 'musical' ? { musical: '' } : {}) } : { band: band!.query }),
					bild: logo.logo ?? logo.icon ?? ''
				})}`,
				name: logo.name,
				band: !film,
				kind: logo.logo ? ('logo' as const) : ('icon' as const),
				source: filmSourceUrl(logo)
			},
			portrait: portrait && {
				src: `/api/portraet?komponist=${encodeURIComponent(portrait.query)}`,
				name: portrait.name,
				source: portraitPageUrl(portrait.file)
			}
		},
		canEdit: locals.access.rights.has('stuecke.bearbeiten') && !!sheet,
		scans:
			gaps.length && people.length
				? {
						scanners: people,
						gaps: gaps
							.map((part) => {
								const task = tasks.get(part.id);
								return {
									id: part.id,
									label: part.label,
									status: part.status,
									priority: task?.priority,
									assignee: task?.assignee,
									assigneeName: task?.assignee ? people.find((person) => person.email === task.assignee)?.name || task.assignee : undefined,
									mine: !!me && task?.assignee === me,
									done: !!task?.done
								};
							})
							.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
					}
				: null,
		// The Stimmensatz of this piece alone (#251), once there are parts to print.
		canPrintSet: locals.access.rights.has('stuecke.bearbeiten') && !!piece.detail?.parts.length,
		saved: url.searchParams.has('gespeichert'),
		// How many programmes followed a rename.
		renamedIn: Number(url.searchParams.get('gespeichert')) || 0,
		// Reports still looked after (new, or with the scanning team), shown quietly on the parts so
		// nobody reports the same thing twice. Who reported is for admins only.
		reports: {
			open: (feedback?.reports ?? [])
				.filter((report) => report.pieceId === piece.id && isActiveReport(report))
				.map(({ id, part, fileId, kind, comment, status, reportedAt, reportedBy }) => ({
					id,
					part,
					fileId,
					kind,
					comment,
					status: status as 'open' | 'scan',
					reportedAt,
					reportedBy: canClose ? reportedBy : undefined
				})),
			// Without parts, only the Hörbeispiel of a piece in the sheet can be reported.
			state: !detail && !sheet
				? ('no-parts' as const)
				: !feedbackUser(locals)
					? ('sign-in' as const)
					: feedback?.tables.reports
						? ('ready' as const)
						: ('not-set-up' as const),
			canClose,
			kinds: detail ? REPORT_KINDS : (['recording'] as ReportKind[]),
			// What "Hörbeispiel falsch" is about: the link, or "keins".
			recording: sheet?.recording ?? (sheet?.noRecording ? t.sheetValues.noRecording : undefined),
			instruments: playableInstruments(config),
			common: commonInstruments(config),
			present: [...new Set((detail?.parts ?? []).filter((part) => part.status !== 'missing').flatMap((part) => part.instruments))]
		},
		// Own parts first, then the shared ones they may play from; PDFs open in the practice viewer, as in "Meine Noten".
		mine: mine
			.filter(({ part }, i) => mine.findIndex((other) => other.part.id === part.id) === i)
			.sort((a, b) => Number(a.shared) - Number(b.shared))
			.map(({ part, shared }) => ({
				id: part.id,
				label: part.label,
				shared,
				status: part.status,
				url: viewer && part.mimeType === 'application/pdf' ? `/ueben/${encodeURIComponent(part.id)}` : partUrl(part.id, part.mimeType, locals.access.viaLink)
			})),
		piece: {
			id: piece.id,
			title: piece.title,
			composer: piece.composer,
			catalogue: piece.catalogue,
			category: piece.category,
			programs: piece.programs,
			partCount: piece.partCount,
			status: piece.status,
			folderUrl: detail ? folderUrl(detail.id) : undefined,
			recording: sheet?.recording,
			// Every PDF opens in the app's viewer for members; Drive only for other files and with sign-in off.
			parts: (detail?.parts ?? []).map((part) => ({
				...part,
				url: viewer && part.mimeType === 'application/pdf' ? `/ueben/${encodeURIComponent(part.id)}` : partUrl(part.id, part.mimeType, locals.access.viaLink)
			})),
			sections: (detail?.sections ?? []).map((section) => ({ ...section, folderUrl: folderUrl(section.folderId) })),
			// The Besetzung as a seating plan, and what of it has no part (#249).
			// The conductor's score is always needed: present unless no file is there (#249).
			besetzung: {
				voices: scored,
				missing: unscored,
				score: !!detail?.parts.some((part) => part.kind === 'partitur' && part.status !== 'missing'),
				// Solo parts ("@Geige", "Solo"): beside the conductor on the plan.
				soloists: [...new Set((detail?.parts ?? []).filter((part) => part.kind === 'solo').flatMap((part) => part.instruments))]
			},
			info: {
				duration: sheet?.duration ? formatDuration(sheet.duration) : undefined,
				publisher: sheet?.publisher,
				arranger: sheet?.arranger,
				genre: sheet?.genre,
				difficulty: sheet?.difficulty,
				// "2026-10-22" reads "22. Oktober 2026"; anything else as entered.
				reviewedAt: sheet?.reviewedAt && /^\d{4}-\d{2}-\d{2}$/.test(sheet.reviewedAt) ? formatDay(sheet.reviewedAt, config.locale) : sheet?.reviewedAt,
				notes: sheet?.notes
			}
		},
		again: user && on.wishes && feedback?.tables.wishes
			? {
					votes: againWish?.votes.length ?? 0,
					mine: !!againWish?.votes.includes(user.email.toLowerCase()),
					planned: againWish?.status === 'planned'
				}
			: null,
		// Rented or borrowed (#119): from whom and until when, so it goes back in time.
		loans: loansOf(loans?.loans ?? [], sheet?.title ?? piece.title).map((loan) => ({
			from: loan.from,
			dueAt: loan.dueAt ? formatDay(loan.dueAt, config.locale) : loan.dueText || undefined,
			state: loanState(loan, library.today),
			days: daysUntilDue(loan, library.today)
		})),
		canManageLoans: canClose && !!loans,
		// Coming up: concerts with this piece on the programme and rehearsals that plan it.
		upcoming: upcoming(library, piece, plan?.byEvent),
		playedAt: piece.playedAt
			.map((id) => library.concertsById.get(id))
			.filter((concert) => concert !== undefined)
			.filter((concert) => !concert.event || concert.event.past)
			.map(concertSummary),
		// Other folders of the same work ("Sinfonie Nr4 Satz 2 - Streicherbesetzung"), then
		// "Weitere Werke von Bach": the same composer, as read from the folder or corrected in the sheet.
		otherVersions: byComposer.filter((other) => work && workKey(other.title) === work).map(summary),
		moreByComposer: byComposer.filter((other) => !work || workKey(other.title) !== work).map(summary),
		sheet: library.sheet,
		// New sheet music from the app (#193): the folder to create, or uploads into it.
		folder: await folderTools(locals, piece),
		folderCreated: url.searchParams.has('ordner'),
		notes: notesFor(library, piece, pieceNotes.notes, locals),
		assignments: assignmentEditor(library, piece, assignments.assignments, access, locals)
	};
};

/** Upcoming calendar events this piece is part of, soonest first. */
function upcoming(library: Library, piece: LibraryPiece, planned: Map<string, { pieceName: string }[]> | undefined) {
	if (!library.schedule.ok) return [];
	const concerts = new Set(piece.playedAt);
	return library.schedule.events.filter(
		(event) =>
			!event.past &&
			(event.type === 'konzert'
				? concerts.has(event.id)
				: (planned?.get(event.id) ?? []).some((entry) => namedItem(library, entry.pieceName).pieceId === piece.id))
	);
}

/**
 * The piece's notes from rehearsals (#125): current ones, and those for concerts that are
 * over, kept apart so an old cut doesn't confuse the next performance. Who may write them
 * gets the choices for "Für" and "Konzert".
 */
function notesFor(library: Library, piece: LibraryPiece, notes: Awaited<ReturnType<typeof getPieceNotes>>['notes'], locals: App.Locals) {
	const concerts = new Map(library.concerts.flatMap((concert) => (concert.sheet ? [[normalize(concert.sheet.title), concert] as const] : [])));
	const shown = notesOf(notes, piece.sheet?.title ?? piece.title).map((note) => {
		const concert = note.concert ? concerts.get(normalize(note.concert)) : undefined;
		return {
			id: note.id,
			text: note.text,
			section: note.section,
			concert: note.concert ? (concert?.title ?? note.concert) : undefined,
			by: note.by,
			at: /^\d{4}-\d{2}-\d{2}$/.test(note.at) ? formatDay(note.at, config.locale) : note.at,
			earlier: !!concert && isPastConcert(concert, library.today)
		};
	});
	const canWrite = locals.access.rights.has('programme.bearbeiten') && !!piece.sheet;
	return {
		current: shown.filter((note) => !note.earlier),
		earlier: shown.filter((note) => note.earlier),
		form: canWrite ? { ...sectionOptions(config), concerts: noteConcerts(library, piece) } : null
	};
}

/** The concerts a note can be for: coming ones with a row in the sheet, those playing the piece first. */
function noteConcerts(library: Library, piece: LibraryPiece) {
	return library.concerts
		.filter((concert) => concert.sheet && !isPastConcert(concert, library.today))
		.reverse()
		.sort((a, b) => Number(piece.playedAt.includes(b.id)) - Number(piece.playedAt.includes(a.id)))
		.map((concert) => ({ value: concert.sheet!.title, label: concert.label ? `${concert.title} · ${concert.label.long}` : concert.title }));
}

/** Shares a composer: "Mozart, Haydn" and "Haydn" do. */
const sameComposer = listsOverlap;

const summary = ({ id, title, catalogue, status, programs }: LibraryPiece) => ({ id, title, catalogue, status, programs });

export const actions: Actions = {
	/** Plans scans, as on "Fehlende Stimmen". */
	planScan: ({ locals, request }) => planScans(locals, request),
	createFolder: async ({ params, request, locals }) => {
		const name = formText(await request.formData(), 'name', 150);
		const id = await inDrive(() => createPieceFolder(locals, params.id, name), 'Creating a piece folder');
		if (typeof id !== 'string') return fail(id.status, { folderError: id.message, folderName: name });
		redirect(303, `/stuecke/${encodeURIComponent(id)}?ordner`);
	},

	placeholder: async ({ params, request, locals }) => {
		const data = await request.formData();
		const instrument = formText(data, 'instrument');
		if (!playableInstruments(config).includes(instrument)) return fail(400, { placeholderError: t.reports.unknownPart });
		const number = Number(formText(data, 'number'));
		const part = formatInstrument({ instrument, numbers: number >= 1 && number <= 8 ? [number] : [] });
		const name = await inDrive(() => addPlaceholder(locals, params.id, part), 'Creating a placeholder');
		if (typeof name !== 'string') return fail(name.status, { placeholderError: name.message });
		return { placeholderCreated: name };
	},

	addNote: async ({ params, request, locals }) => {
		requireRight(locals, 'programme.bearbeiten');
		const library = await getLibrary();
		const piece = library.piecesById.get(params.id);
		if (!piece?.sheet) error(404, t.messages.noPiece);
		const data = await request.formData();
		const input = { text: formText(data, 'text', 2000), section: formText(data, 'section', 100), concert: formText(data, 'concert', 300) };
		const options = sectionOptions(config);
		const checked = checkNote(input, {
			sections: [...options.sections, ...options.instruments],
			concerts: noteConcerts(library, piece).map((concert) => concert.value)
		});
		if ('problem' in checked) return fail(400, { noteError: t.pieceNotes.problems[checked.problem], noteValues: input });
		try {
			await ensureTab('pieceNotes');
			const table = await readTab('pieceNotes');
			await appendRecords('pieceNotes', table, [
				{
					piece: piece.sheet.title,
					section: checked.values.section,
					concert: checked.values.concert,
					note: checked.values.text,
					by: locals.access.user?.name ?? '',
					at: today(),
					id: newId()
				}
			]);
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { noteError: t.pieceNotes.notSetUp, noteValues: input });
			console.error('Saving a note on a piece failed:', cause);
			return fail(503, { noteError: t.pieceNotes.failed, noteValues: input });
		}
		return { noteSaved: true };
	},

	addAssignment: ({ params, request, locals }) => addAssignment(params.id, request, locals),

	deleteAssignment: ({ request, locals }) => deleteAssignment(request, locals),

	deleteNote: async ({ request, locals }) => {
		requireRight(locals, 'programme.bearbeiten');
		const id = formText(await request.formData(), 'id', 40);
		try {
			const table = await readTab('pieceNotes');
			const row = id ? table.rows.find((r) => r.values.id === id) : undefined;
			if (!row) return fail(409, { noteError: t.pieceNotes.gone });
			await deleteRows('pieceNotes', table, [row.row]);
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { noteError: t.pieceNotes.notSetUp });
			console.error('Deleting a note on a piece failed:', cause);
			return fail(503, { noteError: t.pieceNotes.failed });
		}
		return { noteDeleted: true };
	},
	again: async ({ params, locals }) => {
		const user = feedbackUser(locals);
		if (!isOn('wishes')) return fail(404, { againError: t.wishes.failed });
		if (!user) return fail(403, { againError: t.wishes.signInNeeded });
		const piece = (await getLibrary()).piecesById.get(params.id);
		if (!piece) error(404, t.messages.noPiece);
		try {
			return { againSaved: await playAgain(piece, user) };
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { againError: t.wishes.notSetUp });
			console.error('Saving "Wieder spielen" failed:', cause);
			return fail(503, { againError: t.wishes.failed });
		}
	},

	report: async ({ params, request, locals }) => {
		const user = feedbackUser(locals);
		if (!user) return fail(403, { reportError: t.reports.signInNeeded });
		// The same as from the practice viewer and "Meine Noten" (#306).
		const result = await reportFromForm(user, params.id, await request.formData());
		return 'reportError' in result ? fail(result.status, { reportError: result.reportError }) : result;
	}
};

/** A Drive change for the folder tools; what went wrong as a status and message for the form. */
async function inDrive(work: () => Promise<string>, what: string): Promise<string | { status: number; message: string }> {
	try {
		return await work();
	} catch (cause) {
		if (cause instanceof FolderError) return { status: cause.status, message: cause.message };
		if (isHttpError(cause)) throw cause;
		console.error(`${what} in Drive failed:`, cause);
		return { status: 503, message: t.pieceFolder.failed };
	}
}

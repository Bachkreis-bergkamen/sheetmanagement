import { fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { fileUrl } from '#lib/server/catalog.ts';
import { getLibrary } from '#lib/server/library.ts';
import { confirmPartHint, dismissPartHint, getPartHints } from '#lib/server/part-checks.ts';
import { driveWriteEnabled, getArchiveIndex } from '#lib/server/services.ts';
import { isGap, priorityRank, reportedGaps } from '#lib/repertoire/missing-parts.ts';
import { missingVoices, readInstrumentation, voiceText } from '#lib/music/instrumentation.ts';
import { playedParts } from '#lib/music/my-parts.ts';
import { getFeedback, getMissingPartsDone, getMusicConfig, getScanTasks } from '#lib/server/repertoire.ts';
import { planScans, scanners } from '#lib/server/scan-tasks.ts';
import { ensureColumns, readTab, refreshAfterWrite, SheetLayoutError, updateRecord, updateRecords } from '#lib/server/sheet-writes.ts';
import { findPieceRow } from '#lib/repertoire/piece-edit.ts';
import type { Part } from '#lib/music/types.ts';
import type { Actions, PageServerLoad } from './$types';

const RIGHT = 'stuecke.bearbeiten';

/** The score to read a piece's Besetzung from: the full score before a reduction. */
const scoreOf = (parts: Part[]) =>
	parts
		.filter((part) => part.kind === 'partitur' && part.mimeType === 'application/pdf' && part.status === 'ok')
		.sort((a, b) => Number(!a.instruments.includes('Partitur')) - Number(!b.instruments.includes('Partitur')))[0];

/**
 * Every gap in the archive in one list, generated from the file names (FEHLT, LEER,
 * UNVOLLSTÄNDIG) plus open problem reports. Replaces the hand-kept lists in Drive.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const canMark = locals.access.rights.has(RIGHT);
	const [library, feedback, done, tasks, people, music] = await Promise.all([
		getLibrary(),
		getFeedback(),
		getMissingPartsDone(),
		getScanTasks(),
		canMark ? scanners().catch(() => []) : [],
		getMusicConfig()
	]);
	const me = normalizeEmail(locals.access.user?.email ?? '');
	const nameOf = new Map(people.map((person) => [person.email, person.name]));
	const openReports = (feedback?.reports ?? []).filter((report) => report.status === 'open');
	// What the completeness check found (#93); the page works without it.
	const catalog = library.catalog;
	const check = catalog.ok
		? await getArchiveIndex()
				.then(({ value }) => getPartHints(catalog.catalog, value))
				.catch((cause) => (console.error('Reading the part check failed:', cause), undefined))
		: undefined;

	const pieces = library.pieces
		.map((piece) => {
			const pieceReports = openReports.filter((report) => report.pieceId === piece.id);
			const reportedFiles = new Set(pieceReports.map((report) => report.fileId));
			const gaps = (piece.detail?.parts ?? [])
				.filter(isGap)
				.map((part) => {
					// The planned scan: how urgent, and who does it.
					const task = tasks.get(part.id);
					return {
						id: part.id,
						label: part.label,
						status: part.status,
						url: fileUrl(part.id, part.mimeType),
						// Ticked here or in "Fehlende Stimmen"; stays listed until the file is renamed.
						done: done.has(part.id),
						reported: reportedFiles.has(part.id),
						priority: task?.priority,
						assignee: task?.assignee,
						assigneeName: task?.assignee ? nameOf.get(task.assignee) || task.assignee : undefined,
						mine: !!me && task?.assignee === me
					};
				})
				.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
			// Reports the file name doesn't show yet count with the status they stand for.
			const mimeTypes = new Map((piece.detail?.parts ?? []).map((part) => [part.id, part.mimeType]));
			const reports = reportedGaps(
				gaps.map((gap) => gap.id),
				pieceReports
			).map((report) => ({
				...report,
				url: report.fileId && mimeTypes.has(report.fileId) ? fileUrl(report.fileId, mimeTypes.get(report.fileId)!) : undefined
			}));
			const hints = (piece.detail?.parts ?? []).flatMap((part) => {
				const hint = check?.hints.get(part.id);
				return hint ? [{ ...hint, label: part.label, url: fileUrl(part.id, part.mimeType) }] : [];
			});
			// Instruments the Besetzung names without a part to play from (#249).
			const unscored = piece.detail?.parts.length
				? missingVoices(readInstrumentation(piece.sheet?.instrumentation, music), playedParts(piece.detail), music).map(voiceText)
				: [];
			// A piece is as urgent as its most urgent open gap.
			const rank = Math.min(priorityRank(undefined), ...gaps.filter((gap) => !gap.done).map((gap) => priorityRank(gap.priority)));
			return { id: piece.id, title: piece.title, composer: piece.composer, programs: piece.programs, gaps, reports, hints, unscored, rank };
		})
		.filter((piece) => piece.gaps.length || piece.reports.length || piece.hints.length || piece.unscored.length)
		.sort((a, b) => a.rank - b.rank);

	const count = (status: string) =>
		pieces.reduce(
			(sum, piece) =>
				sum + piece.gaps.filter((gap) => gap.status === status).length + piece.reports.filter((report) => report.status === status).length,
			0
		);
	return {
		ok: library.catalog.ok,
		pieces,
		programs: library.catalog.ok ? library.catalog.catalog.programs : [],
		counts: {
			missing: count('missing'),
			empty: count('empty'),
			incomplete: count('incomplete'),
			reports: pieces.reduce((sum, piece) => sum + piece.reports.length, 0),
			hints: pieces.reduce((sum, piece) => sum + piece.hints.length, 0),
			unscored: pieces.reduce((sum, piece) => sum + piece.unscored.length, 0)
		},
		check: check ? { checked: check.checked, total: check.total } : undefined,
		// Scores of pieces without a Besetzung yet, to read in the browser in one run (#249).
		scores: canMark
			? library.pieces.flatMap((piece) => {
					const score = piece.sheet && !piece.sheet.instrumentation && piece.detail ? scoreOf(piece.detail.parts) : undefined;
					return score ? [{ pieceId: piece.id, title: piece.title, fileId: score.id }] : [];
				})
			: [],
		canMark,
		scanners: people,
		driveWrite: driveWriteEnabled()
	};
};

/** A hint from the completeness check, confirmed (the file gets the status word) or dismissed. */
export const actions: Actions = {
	/** Ticks a gap off ("erledigt", e.g. ordered) or opens it again; the row comes from the archive sync. */
	markDone: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		const form = await request.formData();
		const id = String(form.get('id') ?? '').slice(0, 100);
		const done = form.get('done') === 'true';
		const table = await readTab('missingParts').catch((cause) => (cause instanceof SheetLayoutError ? null : Promise.reject(cause)));
		const row = table?.rows.find((r) => r.values.fileId === id);
		if (!table || !row) return fail(404, { message: t.gaps.markGone });
		await updateRecord('missingParts', table, row.row, { done });
		await refreshAfterWrite();
		return { saved: true };
	},
	confirmHint: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		const id = String((await request.formData()).get('id') ?? '').slice(0, 100);
		try {
			const done = await confirmPartHint(id);
			if (done === undefined) return fail(404, { message: t.gaps.hintGone });
			return done ? { saved: true } : fail(503, { message: t.gaps.hintDriveFailed });
		} catch (cause) {
			console.error('Confirming a part hint failed:', cause);
			return fail(503, { message: t.gaps.hintDriveFailed });
		}
	},
	/** Plans scans: a priority and who scans, for one gap or every gap of a piece. */
	planScan: ({ locals, request }) => planScans(locals, request),
	/** The Besetzung read from many scores at once; only where none is entered, so a hand-set one wins. */
	instrumentation: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		let entries: { id: string; text: string }[];
		try {
			entries = (JSON.parse(String((await request.formData()).get('entries') ?? '[]')) as { id: unknown; text: unknown }[])
				.filter((entry) => typeof entry.id === 'string' && typeof entry.text === 'string' && entry.text.trim())
				.map((entry) => ({ id: (entry.id as string).slice(0, 200), text: (entry.text as string).trim().slice(0, 1000) }))
				.slice(0, 500);
		} catch {
			return fail(400, { message: t.gaps.scoresBad });
		}
		const library = await getLibrary();
		try {
			const table = await ensureColumns('pieces', ['instrumentation']);
			const updates = entries.flatMap(({ id, text }) => {
				const sheet = library.piecesById.get(id)?.sheet;
				const row = sheet && findPieceRow(table, sheet);
				return row && !row.values.instrumentation?.trim() ? [{ row: row.row, values: { instrumentation: text } }] : [];
			});
			await updateRecords('pieces', table, updates);
			await refreshAfterWrite();
			return { instrumentationSaved: updates.length };
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message });
			console.error('Saving read Besetzungen failed:', cause);
			return fail(503, { message: t.messages.sheetFailed });
		}
	},
	dismissHint: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		await dismissPartHint(String((await request.formData()).get('id') ?? '').slice(0, 100));
		return { saved: true };
	}
};

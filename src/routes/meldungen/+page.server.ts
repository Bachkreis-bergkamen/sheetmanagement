import { fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { forScanning, hintKind, scanQueue, SUGGESTED_STATUS, type Report } from '#lib/feedback/feedback.ts';
import { t } from '#lib/i18n/index.ts';
import type { MarkableStatus } from '#lib/music/status-word.ts';
import { PRIORITIES } from '#lib/repertoire/priority.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { placeholderName } from '#lib/music/naming.ts';
import { fileWords } from '#lib/music/instrument-label.ts';
import { fileUrl, folderUrl } from '#lib/server/catalog.ts';
import {
	confirmMissingPart,
	formText,
	markReportedFile,
	sendFoundToScan,
	sendToScan,
	setReportStatus,
	useSuggestedRecording,
	type ScanJob
} from '#lib/server/feedback.ts';
import { getLibrary } from '#lib/server/library.ts';
import { dismissPartHint, getPartHints } from '#lib/server/part-checks.ts';
import { REPORT_RIGHT } from '#lib/server/report-notices.ts';
import { getFeedback } from '#lib/server/repertoire.ts';
import { scanners } from '#lib/server/scan-tasks.ts';
import { driveWriteEnabled, getArchiveIndex } from '#lib/server/services.ts';
import { SheetLayoutError } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Meldungen: what members report and what the page check finds, in one inbox. An
 * organiser has a quick look and hands it to the scanning team with a priority, or dismisses
 * it; the team works through "Zum Scannen", piece by piece, and ticks off what's rescanned.
 */

// Looking after the sheet music is what "stuecke.bearbeiten" is for.
const RIGHT = REPORT_RIGHT;
const STATUS_WORDS = Object.keys(config.naming.status) as MarkableStatus[];
const VIEWS = { neu: 'inbox', scannen: 'scan', erledigt: 'done' } as const;
type Library = Awaited<ReturnType<typeof getLibrary>>;

export const load: PageServerLoad = async ({ locals, url }) => {
	requireRight(locals, RIGHT);
	const view = VIEWS[url.searchParams.get('ansicht') as keyof typeof VIEWS] ?? 'inbox';
	const mineOnly = url.searchParams.has('meine');
	const [feedback, library, people] = await Promise.all([getFeedback(), getLibrary(), scanners().catch(() => [])]);
	const driveWrite = driveWriteEnabled();
	const base = { view, mineOnly, driveWrite, scanners: people, priorities: PRIORITIES };
	if (!feedback?.tables.reports) return { ...base, state: 'not-set-up' as const, inbox: [], found: [], scan: [], done: [], statusWords: [] };

	const me = normalizeEmail(locals.access.user?.email ?? '');
	const nameOf = new Map(people.map((person) => [person.email, person.name]));
	const file = fileOf(library);
	const shown = feedback.reports.map(({ driveComment, ...report }) => ({
		...report,
		inDrive: !!driveComment,
		url: file(report.pieceId, report.fileId)?.url,
		suggested: SUGGESTED_STATUS[report.kind],
		task: report.task || t.reports.taskFor[report.kind] || '',
		scannable: forScanning(report.kind),
		assigneeName: report.assignee ? nameOf.get(report.assignee) || report.assignee : undefined,
		mine: !!me && report.assignee === me,
		// A part reported as missing, not yet in Drive: the placeholder it would get.
		placeholder: report.kind === 'missing' && report.part && !report.fileId ? placeholderFor(library, report.pieceId, report.part) : undefined,
		// "Hörbeispiel falsch": the one there now, next to the suggestion.
		recording: report.kind === 'recording' ? recordingOf(library, report.pieceId) : undefined
	}));
	const newest = (a: Pick<Report, 'reportedAt' | 'row'>, b: Pick<Report, 'reportedAt' | 'row'>) => b.reportedAt.localeCompare(a.reportedAt) || b.row - a.row;
	const reported = new Set(shown.filter((report) => report.status === 'open' || report.status === 'scan').map((report) => report.fileId));

	return {
		...base,
		state: 'ready' as const,
		statusWords: STATUS_WORDS.map((status) => ({ status, word: config.naming.status[status] })),
		inbox: shown.filter((report) => report.status === 'open').sort(newest),
		// What the page check found that nobody reported yet.
		found: (await foundByCheck(library)).filter((hint) => !reported.has(hint.fileId)),
		scan: scanQueue(shown.filter((report) => report.status === 'scan')),
		done: shown
			.filter((report) => report.status === 'done' || report.status === 'dismissed')
			.sort(newest)
			.slice(0, 100)
	};
};

/** A reported file's link, from the archive; undefined when it isn't there (any more). */
function fileOf(library: Library) {
	return (pieceId: string, fileId: string) => {
		const part = fileId ? library.piecesById.get(pieceId)?.detail?.parts.find((p) => p.id === fileId) : undefined;
		return part && { url: fileUrl(part.id, part.mimeType), label: part.label };
	};
}

/** The page check's hints (#93) as possible reports; none when the check can't be read. */
async function foundByCheck(library: Library) {
	const catalog = library.catalog;
	if (!catalog.ok) return [];
	const check = await getArchiveIndex()
		.then(({ value }) => getPartHints(catalog.catalog, value))
		.catch((cause) => (console.error('Reading the part check failed:', cause), undefined));
	if (!check) return [];
	if (foundMemo?.library === library && foundMemo.hints === check.hints) return foundMemo.found;
	const found = foundHints(library, check.hints);
	foundMemo = { library, hints: check.hints, found };
	return found;
}

function foundHints(library: Library, hints: Awaited<ReturnType<typeof getPartHints>>['hints']) {
	return library.pieces.flatMap((piece) =>
		(piece.detail?.parts ?? []).flatMap((part) => {
			const hint = hints.get(part.id);
			if (!hint) return [];
			const kind = hintKind(hint.problem);
			return [
				{
					fileId: part.id,
					pieceId: piece.id,
					pieceName: piece.title,
					part: part.label,
					kind,
					url: fileUrl(part.id, part.mimeType),
					comment: hint.problem === 'empty' ? t.gaps.hint.empty : t.gaps.hint.incomplete(hint.pages, hint.usual),
					task: t.reports.taskFor[kind]
				}
			];
		})
	);
}

/** The hints per part, reused while the library and the checks stay the same (Error 1102). */
let foundMemo: { library: Library; hints: unknown; found: ReturnType<typeof foundHints> } | undefined;

/** A piece's Hörbeispiel as the sheet has it: the link, "keins", or empty; null without a row. */
function recordingOf(library: Library, pieceId: string): string | null {
	const sheet = library.piecesById.get(pieceId)?.sheet;
	if (!sheet) return null;
	return sheet.recording ?? (sheet.noRecording ? t.sheetValues.noRecording : '');
}

/** Name and folder of the placeholder for a missing part, per the naming convention. */
function placeholderFor(library: Library, pieceId: string, part: string) {
	const detail = library.piecesById.get(pieceId)?.detail;
	if (!detail) return undefined;
	const files = detail.parts.filter((p) => p.section === '').map(({ id, fileName, mimeType }) => ({ id, name: fileName, mimeType }));
	return {
		// The report names the part as the app shows it; the file uses the convention's words.
		name: placeholderName(files, detail.title, fileWords(part), config.naming, detail),
		folderId: detail.id,
		folderUrl: folderUrl(detail.id),
		// Someone made it already, e.g. by hand: then there's nothing to create.
		exists: detail.parts.some((p) => p.status === 'missing' && p.label === part)
	};
}

async function run(work: () => Promise<boolean | null | undefined>, done: Record<string, unknown> = {}) {
	try {
		const result = await work();
		if (result === undefined) return fail(404, { message: t.reports.gone });
		// Saved in the sheet; Drive refused (no editor access?) and the log has the details.
		return result === false ? { saved: true, warning: t.reports.driveFailed, ...done } : { saved: true, ...done };
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message });
		console.error('Changing a problem report failed:', cause);
		return fail(503, { message: t.reports.failed });
	}
}

/** The triage form: priority, who scans (only someone who may), what to do. */
async function readJob(data: FormData): Promise<ScanJob | string> {
	const priority = PRIORITIES.find((p) => p === data.get('priority'));
	const assignee = normalizeEmail(formText(data, 'assignee'));
	if (assignee && !(await scanners()).some((person) => person.email === assignee)) return t.gaps.notScanner;
	return { priority, assignee, task: formText(data, 'task', 300) };
}

function user(locals: App.Locals) {
	requireRight(locals, RIGHT);
	return locals.access.user ?? undefined;
}

async function change(locals: App.Locals, request: Request, status: 'open' | 'done' | 'dismissed') {
	const by = user(locals);
	const data = await request.formData();
	return run(() => setReportStatus(formText(data, 'id', 40), status, formText(data, 'note', 500), by));
}

export const actions: Actions = {
	/** Rescanned or otherwise sorted: done, and the member who reported it hears of it. */
	close: ({ locals, request }) => change(locals, request, 'done'),
	/** No problem after all: off the piece, without telling anyone. */
	dismiss: ({ locals, request }) => change(locals, request, 'dismissed'),
	/** Back to "Neu", e.g. from the scan list or from done. */
	reopen: ({ locals, request }) => change(locals, request, 'open'),

	/** Hands a report to the scanning team, or changes its job. */
	toScan: async ({ locals, request }) => {
		const by = user(locals);
		const data = await request.formData();
		const job = await readJob(data);
		if (typeof job === 'string') return fail(400, { message: job });
		if (!by) return fail(403, { message: t.reports.failed });
		return run(() => sendToScan(formText(data, 'id', 40), job, by), { sent: true });
	},

	/** A finding of the page check, agreed with: a report by the app, straight to the scanning team. */
	foundToScan: async ({ locals, request }) => {
		const by = user(locals);
		const data = await request.formData();
		const job = await readJob(data);
		if (typeof job === 'string') return fail(400, { message: job });
		if (!by) return fail(403, { message: t.reports.failed });
		// The hint as it stands now, not as the form says, so only real findings become reports.
		const fileId = formText(data, 'fileId', 100);
		const found = (await foundByCheck(await getLibrary())).find((hint) => hint.fileId === fileId);
		if (!found) return fail(404, { message: t.gaps.hintGone });
		const { pieceId, pieceName, part, kind, comment } = found;
		return run(() => sendFoundToScan({ pieceId, pieceName, part, fileId, kind, comment }, job, by).then((drive) => drive ?? true), { sent: true });
	},

	/** The finding is wrong (a short part can be right): not shown again for this version of the file. */
	dismissFound: async ({ locals, request }) => {
		user(locals);
		await dismissPartHint(formText(await request.formData(), 'fileId', 100));
		return { saved: true };
	},

	confirmMissing: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		const id = formText(data, 'id', 40);
		const report = (await getFeedback())?.reports.find((r) => r.id === id);
		if (!report || report.kind !== 'missing' || !report.part || report.fileId) return fail(404, { message: t.reports.gone });
		// Worked out here, not taken from the form, so only the convention's name is ever created.
		const placeholder = placeholderFor(await getLibrary(), report.pieceId, report.part);
		if (!placeholder) return fail(404, { message: t.reports.gone });
		try {
			const created = await confirmMissingPart(id, placeholder);
			if (created === undefined) return fail(404, { message: t.reports.gone });
			if (!created) return { saved: false, manual: { id, name: placeholder.name, folderUrl: placeholder.folderUrl } };
			return { saved: true };
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message });
			console.error('Confirming a missing part failed:', cause);
			return fail(503, { message: t.reports.failed });
		}
	},

	/** The suggested Hörbeispiel becomes the piece's, and the report is done. */
	useSuggestion: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		const id = formText(data, 'id', 40);
		const report = (await getFeedback())?.reports.find((r) => r.id === id);
		const sheet = report && (await getLibrary()).piecesById.get(report.pieceId)?.sheet;
		if (!report || report.kind !== 'recording' || !report.link || !sheet) return fail(404, { message: t.reports.gone });
		return run(() => useSuggestedRecording(id, sheet));
	},

	mark: async ({ locals, request }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		const status = formText(data, 'status') as MarkableStatus;
		if (!STATUS_WORDS.includes(status)) return fail(400, { message: t.reports.failed });
		return run(() => markReportedFile(formText(data, 'id', 40), status));
	}
};

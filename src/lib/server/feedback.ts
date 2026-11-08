import { normalizeEmail, type User } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { markedStatus, mayDeleteWish, readReportKind, newId, parseVotes, readWishKind, readWishStatus, toggleVote, type ReportKind, type ReportStatus, type WishKind, type WishStatus } from '#lib/feedback/feedback.ts';
import type { Priority } from '#lib/repertoire/priority.ts';
import { t } from '#lib/i18n/index.ts';
import { withoutStatusWord, withStatusWord, type MarkableStatus } from '#lib/music/status-word.ts';
import { cleanLink } from '#lib/links.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { findPieceRow } from '#lib/repertoire/piece-edit.ts';
import type { SheetPiece } from '#lib/repertoire/sheet.ts';
import { runInBackground } from './env.ts';
import { createComment, createGoogleDoc, getFile, renameFile, replyToComment } from './google/drive.ts';
import { driveWriteEnabled, getArchiveIndex, getGoogle } from './services.ts';
import { dismissPartHint } from './part-checks.ts';
import { announceDone, announceReport } from './report-notices.ts';
import { announceScans } from './scan-tasks.ts';
import { appendRecords, deleteRows, ensureColumns, readTab, refreshAfterWrite, updateRecord, updateRecords, withSheetLock } from './sheet-writes.ts';
import { announceAnswer, announceWish } from './wish-notices.ts';

/**
 * Writes for problem reports and wishes. Like the programme editor, every change starts
 * from a fresh read of the tab, and rows are found by their id, not their row number.
 * Values are written as typed (RAW), so a name or comment starting with "=" stays text.
 *
 * With DRIVE_WRITE=true, reports are mirrored into Drive: a comment on the reported file
 * (without the reporter's name), resolved when the report is done, and on request the
 * convention's status word in the file name. Drive failing never loses the report.
 */

/** Runs a Drive change; false (and a log line) if Drive refuses, e.g. without editor access. */
async function inDrive(what: string, work: () => Promise<unknown>): Promise<boolean> {
	try {
		await work();
		return true;
	} catch (error) {
		console.error(`${what} in Drive failed:`, error);
		return false;
	}
}

/** Re-reads the archive after a rename, so the new status shows up without waiting. */
function refreshArchive() {
	runInBackground(getArchiveIndex({ force: true }).catch((error) => console.error('Refreshing the archive failed:', error)));
}

/** Reporting and wishing need someone signed in: their +1 counts once and admins can ask back. */
export function feedbackUser(locals: App.Locals): User | null {
	return locals.auth === 'on' && locals.access.member && locals.access.rights.has('ansehen') ? locals.access.user : null;
}

/** "Anna Beispiel <anna@example.org>", shown to admins only. */
const who = (user: User) => (user.name && user.name !== user.email ? `${user.name} <${user.email}>` : user.email);
const today = () => eventDay({ start: new Date().toISOString(), allDay: false }, config.timeZone);

/** Whether Drive was updated too: null when there was nothing to do there. */
export type DriveResult = boolean | null;

export interface NewReport {
	pieceId: string;
	pieceName: string;
	part: string;
	fileId: string;
	kind: ReportKind;
	comment: string;
	link?: string;
}

/** A scan job: how urgent, who scans (an email, or empty), what to do. */
export interface ScanJob {
	priority?: Priority;
	assignee: string;
	task: string;
}

/** The job's cells; the priority as the sheet's word ("hoch"). */
const jobCells = (job: ScanJob) => ({
	status: t.feedbackValues.reportStatus.scan,
	priority: job.priority ? t.sheetValues.priority[job.priority] : '',
	assignee: job.assignee,
	task: job.task
});

/** "Bitte scannen" to the one who scans, when it's new to them and they didn't give it to themselves. */
function announceJob(job: ScanJob, before: string, by: string, piece: string, part: string) {
	const assignee = normalizeEmail(job.assignee);
	if (!assignee || assignee === normalizeEmail(before) || assignee === normalizeEmail(by)) return;
	announceScans(assignee, [{ piece, part: part || t.reports.wholePiece }], job.priority, '/meldungen?ansicht=scannen&meine');
}

/** A member's report: saved as offen, and whoever looks after the music hears of it. */
export async function addReport(user: User, report: NewReport): Promise<DriveResult> {
	const { id, drive } = await appendReport(report, who(user));
	announceReport({ id, ...report }, user.email);
	return drive;
}

/**
 * A finding of the page check (#93) an organiser agrees with: saved as a report by the app,
 * straight to the scanning team. The hint isn't shown again for this version of the file;
 * a rescan is a new version and is checked again.
 */
export async function sendFoundToScan(report: NewReport, job: ScanJob, by: User): Promise<DriveResult> {
	const { drive } = await appendReport(report, t.reports.byCheck, job);
	if (report.fileId) await dismissPartHint(report.fileId);
	announceJob(job, '', by.email, report.pieceName, report.part);
	return drive;
}

async function appendReport(report: NewReport, reportedBy: string, job?: ScanJob): Promise<{ id: string; drive: DriveResult }> {
	const table = job ? await ensureColumns('reports', ['priority', 'assignee', 'task']) : await readTab('reports');
	const id = newId();
	let { comment, link = '' } = report;
	// An older tab without "Vorschlag" keeps the suggested link in the comment.
	if (link && table.missing.includes('link')) {
		comment = [comment, link].filter(Boolean).join(' ');
		link = '';
	}
	let driveComment = '';
	let drive: DriveResult = null;
	if (driveWriteEnabled() && report.fileId) {
		const content = t.reports.driveComment(t.feedbackValues.reportKind[report.kind], report.comment);
		drive = await inDrive('Commenting on a reported file', async () => {
			driveComment = await createComment(getGoogle().client, report.fileId, content);
		});
	}
	// An older tab without the column just doesn't remember the comment.
	if (table.missing.includes('driveComment')) driveComment = '';
	await appendRecords('reports', table, [
		{
			piece: report.pieceName,
			pieceId: report.pieceId,
			part: report.part,
			fileId: report.fileId,
			kind: t.feedbackValues.reportKind[report.kind],
			comment,
			link,
			status: t.feedbackValues.reportStatus.open,
			...(job ? jobCells(job) : {}),
			reportedBy,
			reportedAt: today(),
			driveComment,
			id
		}
	]);
	await refreshAfterWrite();
	return { id, drive };
}

/**
 * Hands a report to the scanning team, or changes its job: priority, who scans, what to do.
 * Whoever gets it hears of it. Undefined when the report is gone.
 */
export async function sendToScan(id: string, job: ScanJob, by: User): Promise<true | undefined> {
	const table = await ensureColumns('reports', ['priority', 'assignee', 'task']);
	const row = table.rows.find((r) => r.values.id === id);
	if (!row) return undefined;
	await updateRecord('reports', table, row.row, jobCells(job));
	await refreshAfterWrite();
	announceJob(job, row.values.assignee ?? '', by.email, row.values.piece, row.values.part);
	return true;
}

/**
 * Closes (erledigt, verworfen) or reopens a report. In Drive, the comment follows, and closing
 * takes the status word the app added out of the file name again. A member hears when what
 * they reported is done. Undefined when the report is gone.
 */
export async function setReportStatus(id: string, status: ReportStatus, note: string, by?: User): Promise<DriveResult | undefined> {
	const table = await readTab('reports');
	const row = table.rows.find((r) => r.values.id === id);
	if (!row) return undefined;
	const { fileId, driveComment, marked: markedWord } = row.values;
	const closing = status === 'done' || status === 'dismissed';
	const marked = markedStatus(markedWord);
	const changes: { status: string; note: string; marked?: string } = { status: t.feedbackValues.reportStatus[status], note };

	let drive: DriveResult = null;
	if (driveWriteEnabled() && fileId) {
		const { client } = getGoogle();
		const steps: Promise<boolean>[] = [];
		if (driveComment) {
			const action = closing ? 'resolve' : 'reopen';
			const content = note || (closing ? t.reports.driveResolved : t.reports.driveReopened);
			steps.push(inDrive('Updating a report comment', () => replyToComment(client, fileId, driveComment, action, content)));
		}
		if (closing && marked) {
			steps.push(
				inDrive('Removing a status word', async () => {
					const file = await getFile(client, fileId);
					const name = withoutStatusWord(file.name, marked, config.naming);
					if (name !== file.name) await renameFile(client, fileId, name);
					changes.marked = '';
				})
			);
		}
		if (steps.length) drive = (await Promise.all(steps)).every(Boolean);
		if (changes.marked === '') refreshArchive();
	}
	await updateRecord('reports', table, row.row, changes);
	await refreshAfterWrite();
	if (status === 'done' && by) {
		const v = row.values;
		announceDone({ id, pieceId: v.pieceId, pieceName: v.piece, part: v.part, kind: readReportKind(v.kind), reportedBy: v.reportedBy }, by.email);
	}
	return drive;
}

/** Puts the convention's status word in the reported file's name. Undefined when the report is gone. */
export async function markReportedFile(id: string, status: MarkableStatus): Promise<boolean | undefined> {
	const table = await readTab('reports');
	const row = table.rows.find((r) => r.values.id === id);
	if (!row) return undefined;
	const { fileId } = row.values;
	if (!fileId || !driveWriteEnabled()) return false;
	const { client } = getGoogle();
	const ok = await inDrive('Marking a reported file', async () => {
		const file = await getFile(client, fileId);
		const name = withStatusWord(file.name, status, config.naming);
		if (name !== file.name) await renameFile(client, fileId, name);
	});
	if (!ok) return false;
	await updateRecord('reports', table, row.row, { marked: config.naming.status[status] });
	refreshArchive();
	await refreshAfterWrite();
	return true;
}

/** Writes a piece's Hörbeispiel ("keins" for none) into its row in "Stücke"; false when the row is gone. */
export async function setRecording(piece: SheetPiece, value: string, { refresh = true } = {}): Promise<boolean> {
	const table = await readTab('pieces');
	const row = findPieceRow(table, piece);
	if (!row) return false;
	await updateRecord('pieces', table, row.row, { recording: value });
	if (refresh) await refreshAfterWrite();
	return true;
}

/**
 * "Vorschlag übernehmen" on a reported Hörbeispiel: the suggested link becomes the piece's
 * recording and the report is closed. Undefined when the report or the piece's row is gone.
 */
export async function useSuggestedRecording(id: string, piece: SheetPiece): Promise<boolean | undefined> {
	const table = await readTab('reports');
	const row = table.rows.find((r) => r.values.id === id);
	const link = cleanLink(row?.values.link ?? '');
	if (!row || !link) return undefined;
	if (!(await setRecording(piece, link, { refresh: false }))) return undefined;
	await updateRecord('reports', table, row.row, { status: t.feedbackValues.reportStatus.done, note: t.reports.suggestionUsed });
	await refreshAfterWrite();
	return true;
}

/**
 * After someone with the right confirmed a reported missing part: creates the convention's
 * placeholder (a Google Doc "<Kurztitel> - <Stimme> - FEHLT") in the piece folder and
 * closes the report. False when Drive refused (or DRIVE_WRITE is off): nothing changed,
 * and the placeholder can be made by hand. Undefined when the report is gone.
 */
export async function confirmMissingPart(id: string, placeholder: { name: string; folderId: string }): Promise<boolean | undefined> {
	const table = await readTab('reports');
	const row = table.rows.find((r) => r.values.id === id);
	if (!row) return undefined;
	if (!driveWriteEnabled()) return false;
	const created = await inDrive('Creating a missing-part placeholder', () => createGoogleDoc(getGoogle().client, placeholder.name, placeholder.folderId));
	if (!created) return false;
	await updateRecord('reports', table, row.row, {
		status: t.feedbackValues.reportStatus.done,
		note: t.reports.placeholderCreated(placeholder.name)
	});
	refreshArchive();
	await refreshAfterWrite();
	return true;
}

/** An anonymous wish keeps no name or email in the sheet; its +1s still count per person. */
export async function addWish(
	user: User,
	wish: { kind: WishKind; title: string; composer: string; link: string; description: string; concert?: string; pieceId?: string },
	{ anonymous = false, vote = false } = {}
): Promise<void> {
	const table = await readTab('wishes');
	await appendRecords('wishes', table, [
		{
			concert: wish.concert ?? '',
			pieceId: wish.pieceId ?? '',
			votes: vote ? normalizeEmail(user.email) : '',
			kind: t.feedbackValues.wishKind[wish.kind],
			title: wish.title,
			composer: wish.composer,
			link: wish.link,
			description: wish.description,
			status: t.feedbackValues.wishStatus.open,
			submittedBy: anonymous ? '' : who(user),
			submittedAt: today(),
			id: newId()
		}
	]);
	await refreshAfterWrite();
	announceWish(wish, user);
}

/**
 * "Wieder spielen" on a piece page: the +1 on the piece's open or planned wish, or a new
 * wish with the user's +1 when there is none. Returns whether the user now wants it.
 */
export function playAgain(piece: { id: string; title: string; composer?: string }, user: User): Promise<boolean> {
	// Read and write in one turn, so two +1 in the same second don't make two wishes.
	return withSheetLock(async () => {
		const table = await readTab('wishes');
		const open = [t.feedbackValues.wishStatus.open, t.feedbackValues.wishStatus.planned].map((label) => label.toLowerCase());
		const row = table.rows.find((r) => r.values.pieceId === piece.id && open.includes(r.values.status.trim().toLowerCase()));
		if (!row) {
			await addWish(user, { kind: 'piece', title: piece.title, composer: piece.composer ?? '', link: '', description: '', pieceId: piece.id }, { vote: true });
			return true;
		}
		const votes = toggleVote(parseVotes(row.values.votes), user.email);
		await updateRecord('wishes', table, row.row, { votes: votes.join(', ') });
		await refreshAfterWrite();
		return votes.includes(normalizeEmail(user.email));
	});
}

/** Taking suggestions into a programme: their wishes become "geplant". Already closed ones stay. */
export async function planWishes(ids: string[]): Promise<void> {
	if (!ids.length) return;
	const table = await readTab('wishes');
	const open = t.feedbackValues.wishStatus.open.toLowerCase();
	const updates = table.rows
		.filter((r) => ids.includes(r.values.id) && (!r.values.status.trim() || r.values.status.trim().toLowerCase() === open))
		.map((r) => ({ row: r.row, values: { status: t.feedbackValues.wishStatus.planned } }));
	await updateRecords('wishes', table, updates);
}

/** Gives or takes back the user's +1. False when the wish no longer exists. */
export async function voteOnWish(id: string, user: User): Promise<boolean> {
	// Read and write in one turn, so two +1 in the same second both count.
	const found = await withSheetLock(async () => {
		const table = await readTab('wishes');
		const row = table.rows.find((r) => r.values.id === id);
		if (!row) return false;
		const votes = toggleVote(parseVotes(row.values.votes), user.email);
		await updateRecord('wishes', table, row.row, { votes: votes.join(', ') });
		return true;
	});
	if (found) await refreshAfterWrite();
	return found;
}

/** Sets a wish's status and answer; whoever follows the wish hears of a change (see wish-notices). */
export async function setWishStatus(id: string, status: WishStatus, answer: string, by: string): Promise<boolean> {
	const table = await readTab('wishes');
	const row = table.rows.find((r) => r.values.id === id);
	if (!row) return false;
	const label = t.feedbackValues.wishStatus[status];
	await updateRecord('wishes', table, row.row, { status: label, answer });
	await refreshAfterWrite();
	const { values: v } = row;
	if (readWishStatus(v.status) !== status || v.answer.trim() !== answer.trim()) {
		announceAnswer({ id, kind: readWishKind(v.kind), title: v.title, submittedBy: v.submittedBy, votes: parseVotes(v.votes) }, label, answer, by);
	}
	return true;
}

/** Deletes a wish's row if the user may (see mayDeleteWish). False when it's gone, "forbidden" otherwise. */
export async function deleteWish(id: string, user: User, admin: boolean): Promise<boolean | 'forbidden'> {
	const table = await readTab('wishes');
	const row = table.rows.find((r) => r.values.id === id);
	if (!row) return false;
	const wish = { submittedBy: row.values.submittedBy, status: readWishStatus(row.values.status) };
	if (!mayDeleteWish(wish, user.email, admin)) return 'forbidden';
	await deleteRows('wishes', table, [row.row]);
	await refreshAfterWrite();
	return true;
}

/** A form field, trimmed and cut to a sane length. */
export const formText = (data: FormData, name: string, max = 200) => String(data.get(name) ?? '').trim().slice(0, max);

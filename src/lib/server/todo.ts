import { config } from '#lib/config/index.ts';
import { reportSubject } from '#lib/feedback/feedback.ts';
import { t } from '#lib/i18n/index.ts';
import { urgentLoans } from '#lib/loans/loans.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { normalizeEmail } from '#lib/access/access.ts';
import { getAccessList, getAttendance, getFeedback, getLoans, getScanTasks } from './repertoire.ts';
import { features } from './env.ts';
import { unansweredPolls } from './polls.ts';
import { unreadKummer } from './kummer.ts';
import { getSchedule } from './schedule.ts';

/** Rehearsals this many days back still ask for their attendance to be taken. */
const ATTENDANCE_DAYS = 14;

export interface OpenWork {
	reports: number;
	wishes: number;
	requests: number;
	/** Rented music due within two weeks or overdue (#119). */
	loans: number;
	attendance: number;
	/** The oldest rehearsal without attendance. */
	attendanceUrl?: string;
	/** Date polls you haven't answered yet (#95); the only line here that isn't about a right. */
	polls: number;
	pollsUrl?: string;
	/** Parts you were asked to scan: gaps in "Fehlende Stimmen" and reports with the scanning team … */
	scans: number;
	/** … of which gaps in "Fehlende Stimmen". */
	gapScans: number;
	/** The Kummerkasten: answers to what you wrote, and for the Leitung new messages for them. */
	kummerAnswers: number;
	kummerInbox: number;
}

/**
 * What's waiting for the people who look after things, only counted for those who may act on
 * it: "Wartet auf dich" on the start page and the counts on the workspace tabs (#139). All of
 * it comes from the cached sheet and calendar, so it costs no extra Google request.
 */
export async function openWork(locals: App.Locals): Promise<OpenWork | null> {
	const open = await gather(locals);
	if (!open) return null;
	return {
		reports: open.reports.length,
		wishes: open.wishes.length,
		requests: open.requests.length,
		loans: open.loans.length,
		attendance: open.untaken.length,
		attendanceUrl: open.untaken[0] ? attendanceUrl(open.untaken[0].id) : undefined,
		polls: open.polls.length,
		pollsUrl: open.polls.length === 1 ? `/termine/${open.polls[0].id}` : '/termine',
		scans: open.gapScans + open.reportScans,
		gapScans: open.gapScans,
		kummerAnswers: open.kummer.answers,
		kummerInbox: open.kummer.inbox
	};
}

/** One thing waiting for someone, on the "Zu erledigen" list (#185). */
export interface OpenItem {
	kind: 'report' | 'wish' | 'request' | 'loan' | 'attendance' | 'poll' | 'scans' | 'kummerAnswers' | 'kummerInbox';
	/** What it is about: the piece, the wish, the person, the rehearsal. */
	title: string;
	/** What to do or what's wrong, short. */
	detail?: string;
	/** "2026-11-19": when it was reported or asked, when it's due. */
	date?: string;
	/** Where it's done. */
	href: string;
	/** For the rows that stand for several things, e.g. parts to scan. */
	count?: number;
}

/**
 * Everything waiting for this person, one row each where the sheet names it (reports, wishes,
 * access requests, rented music, rehearsals without attendance, date polls), and one row for
 * the parts to scan and the Kummerkasten. The same reads and the same rights as openWork.
 */
export async function openItems(locals: App.Locals): Promise<OpenItem[]> {
	const open = await gather(locals);
	if (!open) return [];
	const day = (iso: string) => iso.slice(0, 10) || undefined;
	return [
		...open.reports.map((report) => ({
			kind: 'report' as const,
			title: report.pieceName || t.reports.toPiece,
			detail: reportSubject(report),
			date: day(report.reportedAt),
			href: '/meldungen'
		})),
		...open.requests.map((request) => ({ kind: 'request' as const, title: request.name || request.email, detail: request.email, date: day(request.requestedAt), href: '/admin' })),
		...open.wishes.map((wish) => ({ kind: 'wish' as const, title: wish.title, detail: wish.composer || undefined, date: day(wish.submittedAt), href: '/wuensche' })),
		...open.loans.map((loan) => ({ kind: 'loan' as const, title: loan.pieceName, detail: loan.from || undefined, date: loan.dueAt, href: '/leihmaterial' })),
		...open.untaken.map((event) => ({ kind: 'attendance' as const, title: event.displayTitle, date: day(event.start), href: attendanceUrl(event.id) })),
		...open.polls.map((poll) => ({ kind: 'poll' as const, title: poll.title, date: poll.deadline, href: `/termine/${poll.id}` })),
		...(open.gapScans ? [{ kind: 'scans' as const, title: t.home.todo.scans(open.gapScans), count: open.gapScans, href: '/fehlende-stimmen?meine' }] : []),
		...(open.reportScans ? [{ kind: 'scans' as const, title: t.home.todo.scans(open.reportScans), count: open.reportScans, href: '/meldungen?ansicht=scannen&meine' }] : []),
		...(open.kummer.answers ? [{ kind: 'kummerAnswers' as const, title: t.kummer.todoAnswers(open.kummer.answers), count: open.kummer.answers, href: '/kummerkasten?ansicht=meine' }] : []),
		...(open.kummer.inbox ? [{ kind: 'kummerInbox' as const, title: t.kummer.todoInbox(open.kummer.inbox), count: open.kummer.inbox, href: '/kummerkasten?ansicht=eingang' }] : [])
	];
}

const attendanceUrl = (eventId: string) => `/kalender/${encodeURIComponent(eventId)}/anwesenheit`;

/** What's open, read once for the counts and the list; only what this person may act on. */
async function gather(locals: App.Locals) {
	const rights = locals.access.rights;
	const on = features();
	const reports = rights.has('stuecke.bearbeiten');
	const admin = rights.has('mitglieder.verwalten') && locals.auth === 'on';
	const attendance = on.attendance && rights.has('anwesenheit.erfassen') && locals.auth === 'on';
	const today = eventDay({ start: new Date().toISOString(), allDay: false }, config.timeZone);
	const polls = locals.auth === 'on' ? await unansweredPolls(locals, today).catch(() => []) : [];
	const kummer = await unreadKummer(locals).catch(() => ({ answers: 0, inbox: 0 }));
	if (!reports && !admin && !attendance && !polls.length && !kummer.answers && !kummer.inbox) return null;
	const [feedback, access, loans, taken, schedule, scans] = await Promise.all([
		getFeedback(),
		admin ? getAccessList() : null,
		reports && on.loans ? getLoans() : null,
		attendance ? getAttendance() : null,
		attendance ? getSchedule() : null,
		reports ? getScanTasks() : null
	]).catch(() => [null, null, null, null, null, null] as const);
	const me = normalizeEmail(locals.access.user?.email ?? '');
	// Recent rehearsals nobody has taken attendance for yet (#120), oldest first.
	const untaken =
		taken && schedule?.ok
			? schedule.events.filter(
					(event) =>
						(event.type === 'probe' || event.type === 'generalprobe') &&
						event.past &&
						event.daysUntil >= -ATTENDANCE_DAYS &&
						!taken.byEvent.get(event.id)?.size
				)
			: [];
	return {
		reports: reports ? (feedback?.reports.filter((report) => report.status === 'open') ?? []) : [],
		wishes: admin && on.wishes ? (feedback?.wishes.filter((wish) => wish.status === 'open') ?? []) : [],
		requests: admin ? (access?.requests ?? []) : [],
		loans: loans ? urgentLoans(loans.loans, today) : [],
		untaken,
		polls,
		// Parts to scan: gaps planned in "Fehlende Stimmen", and reports handed to the scanning team.
		gapScans: me && scans ? [...scans.values()].filter((task) => task.assignee === me && !task.done).length : 0,
		reportScans: me && reports ? (feedback?.reports.filter((report) => report.status === 'scan' && report.assignee === me).length ?? 0) : 0,
		kummer
	};
}

/** The counts by page, for tabs and menus: only pages with something open. */
export function countsByPage(work: OpenWork | null): Record<string, number> {
	if (!work) return {};
	const counts: Record<string, number> = { '/meldungen': work.reports + work.scans - work.gapScans, '/wuensche': work.wishes, '/admin': work.requests, '/leihmaterial': work.loans, '/fehlende-stimmen': work.gapScans, '/kummerkasten': work.kummerAnswers + work.kummerInbox };
	return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

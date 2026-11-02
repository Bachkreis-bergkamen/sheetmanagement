import { config } from '#lib/config/index.ts';
import { urgentLoans } from '#lib/loans/loans.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { normalizeEmail } from '#lib/access/access.ts';
import { getAccessList, getAttendance, getFeedback, getLoans, getScanTasks } from './repertoire.ts';
import { features } from './env.ts';
import { unansweredPolls } from './polls.ts';
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
	/** Gaps the Notenwart was asked to scan. */
	scans: number;
}

/**
 * What's waiting for the people who look after things, only counted for those who may act on
 * it: "Wartet auf dich" on the start page and the counts on the workspace tabs (#139). All of
 * it comes from the cached sheet and calendar, so it costs no extra Google request.
 */
export async function openWork(locals: App.Locals): Promise<OpenWork | null> {
	const rights = locals.access.rights;
	const on = features();
	const reports = rights.has('stuecke.bearbeiten');
	const admin = rights.has('mitglieder.verwalten') && locals.auth === 'on';
	const attendance = on.attendance && rights.has('anwesenheit.erfassen') && locals.auth === 'on';
	const today = eventDay({ start: new Date().toISOString(), allDay: false }, config.timeZone);
	const polls = locals.auth === 'on' ? await unansweredPolls(locals, today).catch(() => []) : [];
	if (!reports && !admin && !attendance && !polls.length) return null;
	const [feedback, access, loans, taken, schedule, scans] = await Promise.all([
		getFeedback(),
		admin ? getAccessList() : null,
		reports && on.loans ? getLoans() : null,
		attendance ? getAttendance() : null,
		attendance ? getSchedule() : null,
		reports ? getScanTasks() : null
	]).catch(() => [null, null, null, null, null, null] as const);
	const me = normalizeEmail(locals.access.user?.email ?? '');
	// Recent rehearsals nobody has taken attendance for yet (#120); the oldest is the link.
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
		reports: reports ? (feedback?.reports.filter((report) => report.status === 'open').length ?? 0) : 0,
		wishes: admin && on.wishes ? (feedback?.wishes.filter((wish) => wish.status === 'open').length ?? 0) : 0,
		requests: admin ? (access?.requests.length ?? 0) : 0,
		loans: loans ? urgentLoans(loans.loans, today).length : 0,
		attendance: untaken.length,
		attendanceUrl: untaken[0] ? `/kalender/${encodeURIComponent(untaken[0].id)}/anwesenheit` : undefined,
		polls: polls.length,
		pollsUrl: polls.length === 1 ? `/termine/${polls[0].id}` : '/termine',
		scans: me && scans ? [...scans.values()].filter((task) => task.assignee === me && !task.done).length : 0
	};
}

/** The counts by page, for tabs and menus: only pages with something open. */
export function countsByPage(work: OpenWork | null): Record<string, number> {
	if (!work) return {};
	const counts: Record<string, number> = { '/meldungen': work.reports, '/wuensche': work.wishes, '/admin': work.requests, '/leihmaterial': work.loans, '/fehlende-stimmen': work.scans };
	return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

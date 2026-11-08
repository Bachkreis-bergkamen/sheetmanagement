import { normalizeEmail } from '#lib/access/access.ts';
import { reportSubject, submitterEmail, type ReportKind } from '#lib/feedback/feedback.ts';
import { t } from '#lib/i18n/index.ts';
import { peopleWithRight } from '#lib/reminders/reminders.ts';
import { authConfig } from './auth/index.ts';
import { runInBackground } from './env.ts';
import { notify, pushReady } from './push/index.ts';
import { getAccessList } from './repertoire.ts';

/**
 * Notifications about problem reports, on the devices people allowed them on: whoever looks
 * after the music hears of a new report, and the member who reported it hears when it's done.
 * Sent after the response, so saving never waits for a push service; failing only logs.
 */

/** Who looks after reports, as on /meldungen. */
export const REPORT_RIGHT = 'stuecke.bearbeiten';

function send(what: string, work: () => Promise<unknown>) {
	if (!pushReady()) return;
	runInBackground(work().catch((error) => console.error(`${what} failed:`, error)));
}

/** "Neue Meldung – Avengers: Trompete 1 – Seiten fehlen" to the organisers, not the one who reported it. */
export function announceReport(report: { id: string; pieceName: string; part: string; kind: ReportKind }, by: string) {
	send('Announcing a new report', async () => {
		const auth = authConfig();
		const me = normalizeEmail(by);
		const people = peopleWithRight(await getAccessList(), auth.mode === 'on' ? auth.bootstrapAdmins : [], REPORT_RIGHT).filter((email) => email !== me);
		await notify(people, {
			title: t.reports.push.newTitle,
			body: t.reports.push.body(report.pieceName, reportSubject(report)).slice(0, 200),
			url: '/meldungen',
			tag: 'report-new'
		});
	});
}

/** "Deine Meldung ist erledigt – Avengers: Trompete 1 – Seiten fehlen" to the member who reported it. */
export function announceDone(report: { id: string; pieceId: string; pieceName: string; part: string; kind: ReportKind; reportedBy: string }, by: string) {
	const reporter = submitterEmail(report.reportedBy);
	if (!reporter || reporter === normalizeEmail(by)) return;
	send('Announcing a done report', () =>
		notify([reporter], {
			title: t.reports.push.doneTitle,
			body: t.reports.push.body(report.pieceName, reportSubject(report)).slice(0, 200),
			url: `/stuecke/${encodeURIComponent(report.pieceId)}`,
			tag: `report-${report.id}`
		})
	);
}

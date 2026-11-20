import { config } from '#lib/config/index.ts';
import { dateFormat } from '#lib/events/format.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import * as t from '#lib/i18n/texts.ts';
import { loanReminders, peopleWithRight, signupReminders, type Reminder, type ReminderKind } from '#lib/reminders/reminders.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { eventOrchestra } from '#lib/repertoire/orchestras.ts';
import { ANSWERS } from '#lib/signups/signups.ts';
import { authConfig } from '../auth/index.ts';
import { answerToken } from '../auth/mail-links.ts';
import { getStore, reminderKey } from '../db/index.ts';
import { features } from '../env.ts';
import { getLibrary } from '../library.ts';
import type { Notice } from '../push/index.ts';
import { getAccessList, getLoans, getSignups } from '../repertoire.ts';
import { channels, channelsSetUp, deliver, reachable } from './deliver.ts';
import type { JobResult } from './index.ts';

/**
 * Reminders on members' devices or by email (#157, #144, #123): a rehearsal or concert in the
 * next days that someone hasn't answered, and rented music that is due or overdue. Each
 * reminder goes out once (logged in the store), whichever way reaches the person (see
 * deliver.ts); a few per run, the rest on the next one, so a run stays small. Nobody is woken
 * up: nothing is sent at night.
 */

/** Messages per run; the job runs every half hour. */
const PER_RUN = 20;
/** Sent between these hours in the orchestra's time zone. */
const QUIET_UNTIL = 8;
const QUIET_FROM = 21;
/** The log is only needed while a reminder could repeat. */
const KEEP_DAYS = 365;

const hourFormat = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: config.timeZone });
const eventDate = dateFormat(config.locale, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: config.timeZone });
const allDayDate = dateFormat(config.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function isQuietTime(now: number): boolean {
	const hour = Number(hourFormat.format(now));
	return hour < QUIET_UNTIL || hour >= QUIET_FROM;
}

/** A sign-up reminder by email links to one-click answers, valid until a day after the start. */
type Pending = Reminder<unknown> & { notice: Notice; answers?: { eventId: string; until: number } };

export async function sendReminders(now = Date.now()): Promise<JobResult> {
	const ways = await channels();
	if (!channelsSetUp(ways)) return { ok: true, summary: t.reminders.pushOff };
	if (isQuietTime(now)) return { ok: true, summary: t.reminders.quiet };
	if (!ways.devices.length && !ways.mail) return { ok: true, summary: t.reminders.noDevices };
	const store = getStore();

	const on = features();
	const today = eventDay({ start: new Date(now).toISOString(), allDay: false }, config.timeZone);
	const [library, signups, loans, access] = await Promise.all([
		on.signups ? getLibrary(now) : null,
		on.signups ? getSignups() : null,
		on.loans ? getLoans() : null,
		getAccessList()
	]);
	if (on.signups && library && !library.schedule.ok) return { ok: false, summary: t.reminders.noCalendar };

	const pending: Pending[] = [];
	if (library?.schedule.ok && signups && access) {
		const forEvent = (event: ShownEvent) => eventOrchestra(event, (id) => library.concertsById.get(id)?.orchestra);
		for (const reminder of signupReminders(library.schedule.events, signups.byEvent, access.members, { orchestraOf: forEvent, today })) {
			const event = reminder.about;
			const when = event.allDay ? allDayDate.format(new Date(event.start)) : eventDate.format(new Date(event.start));
			pending.push({
				...reminder,
				notice: { title: t.reminders.signupTitle(event.displayTitle), body: t.reminders.signupBody(when), url: `/kalender/${encodeURIComponent(event.id)}`, tag: `signup-${event.id}` },
				answers: { eventId: event.id, until: Date.parse(event.start) + 86_400_000 }
			});
		}
	}
	const auth = authConfig();
	if (loans) {
		const people = peopleWithRight(access, auth.mode === 'on' ? auth.bootstrapAdmins : [], 'stuecke.bearbeiten');
		for (const reminder of loanReminders(loans.loans, people, today)) {
			const loan = reminder.about;
			const due = loan.dueAt ? allDayDate.format(new Date(`${loan.dueAt}T00:00:00Z`)) : loan.dueText;
			const overdue = reminder.kind === 'loan-overdue';
			pending.push({
				...reminder,
				notice: {
					title: overdue ? t.reminders.loanOverdueTitle(loan.pieceName) : t.reminders.loanDueTitle(loan.pieceName),
					body: t.reminders.loanBody(loan.from, due),
					url: '/leihmaterial',
					tag: `loan-${reminder.subject}`
				}
			});
		}
	}

	// Only people who can be reached, and only what hasn't gone out yet.
	const candidates = pending.filter((reminder) => reachable(reminder.recipient, ways));
	const sent = new Map<ReminderKind, Set<string>>();
	for (const kind of new Set(candidates.map((reminder) => reminder.kind))) {
		const subjects = [...new Set(candidates.filter((reminder) => reminder.kind === kind).map((reminder) => reminder.subject))];
		sent.set(kind, await store.sentReminders(kind, subjects));
	}
	const due = candidates.filter((reminder) => !sent.get(reminder.kind)?.has(reminderKey(reminder.subject, reminder.recipient)));

	let delivered = 0;
	let mailed = 0;
	const names = new Map((access?.members ?? []).map((member) => [member.email, member.name]));
	const batch = due.slice(0, PER_RUN);
	for (const reminder of batch) {
		const lines =
			reminder.answers && ways.mail && auth.mode === 'on'
				? [t.email.answerLinks, ...(await answerLinks(reminder.recipient, reminder.answers, ways.mail.origin, auth.sessionSecret))]
				: [];
		const way = await deliver(reminder.recipient, reminder.notice, ways, { name: names.get(reminder.recipient), lines });
		// Not reached (push service or mail down): it stays due and is tried on the next run.
		if (!way) continue;
		await store.logReminder(reminder.kind, reminder.subject, reminder.recipient);
		delivered++;
		if (way === 'mail') mailed++;
	}
	await store.pruneReminders(KEEP_DAYS);
	if (!due.length) return { ok: true, summary: t.reminders.nothing };
	const missed = batch.length - delivered;
	return {
		// Nothing got through at all: the push services, the keys or the mail account are worth a look.
		ok: delivered > 0 || !missed,
		summary:
			t.reminders.sent(delivered, due.length - batch.length) +
			(mailed ? ` ${t.reminders.byMail(mailed)}` : '') +
			(missed ? ` ${t.reminders.notReached(missed)}` : '')
	};
}

/** "Ich komme: https://…/antwort/…?a=yes", one line per answer. */
async function answerLinks(email: string, about: { eventId: string; until: number }, origin: string, secret: string): Promise<string[]> {
	const token = await answerToken(email, about.eventId, about.until, secret);
	return ANSWERS.map((answer) => `${t.signups.answers[answer]}: ${origin}/antwort/${token}?a=${answer}`);
}

import { countingMembers, resolveAccess, type AccessList, type Member, type Right } from '#lib/access/access.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import { loanState, type Loan } from '#lib/loans/loans.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import type { Signup } from '#lib/signups/signups.ts';

/**
 * Who should be reminded of what (#157, #144). Plain functions over the sheet and the
 * calendar; the reminders job sends them and logs each one, so nobody gets one twice.
 */

/** A rehearsal or concert this many days ahead (or less) reminds those who haven't answered. */
export const SIGNUP_REMINDER_DAYS = 3;

export type ReminderKind = 'signup' | 'loan-due' | 'loan-overdue' | 'duty' | 'duty-nudge';

export interface Reminder<T> {
	kind: ReminderKind;
	/** What it's about, stable across runs: the event id, or the loan's piece and date. */
	subject: string;
	recipient: string;
	about: T;
}

/**
 * One reminder per member and event for rehearsals and concerts in the next few days that
 * they haven't answered: active members of the event's orchestra with an instrument, the
 * same people the sign-up overview counts as open. Unconfirmed "(?)" dates don't remind.
 */
export function signupReminders(
	events: ShownEvent[],
	signups: Map<string, Signup[]>,
	members: Member[],
	{ orchestraOf, today }: { orchestraOf: (event: ShownEvent) => string | undefined; today: string }
): Reminder<ShownEvent>[] {
	return events
		.filter((event) => event.type !== 'sonstiges' && !event.past && !event.tentative && event.daysUntil >= 0 && event.daysUntil <= SIGNUP_REMINDER_DAYS)
		.flatMap((event) => {
			const answered = new Set((signups.get(event.id) ?? []).map((signup) => signup.email));
			return countingMembers(members, orchestraOf(event), today)
				.filter((member) => member.instrument && !answered.has(member.email))
				.map((member) => ({ kind: 'signup' as const, subject: event.id, recipient: member.email, about: event }));
		});
}

/** A loan is the same loan while its piece and return date stay; a new date reminds again. */
export const loanSubject = (loan: Pick<Loan, 'pieceName' | 'dueAt'>) => `${normalize(loan.pieceName)}|${loan.dueAt}`;

/** Once when a loan is due within two weeks, once more when it's overdue; to everyone who looks after the music. */
export function loanReminders(loans: Loan[], recipients: string[], today: string): Reminder<Loan>[] {
	return loans.flatMap((loan) => {
		const state = loanState(loan, today);
		if (state !== 'due-soon' && state !== 'overdue') return [];
		const kind = state === 'overdue' ? ('loan-overdue' as const) : ('loan-due' as const);
		return recipients.map((recipient) => ({ kind, subject: loanSubject(loan), recipient, about: loan }));
	});
}

/** Everyone with a right: bootstrap admins, and members who have it through their groups or by name. */
export function peopleWithRight(list: AccessList | null, bootstrapAdmins: string[], right: Right): string[] {
	const people = new Set(bootstrapAdmins.map((email) => email.trim().toLowerCase()).filter(Boolean));
	for (const member of list?.members ?? []) {
		if (resolveAccess({ email: member.email, name: member.name }, list, []).rights.has(right)) people.add(member.email);
	}
	return [...people];
}

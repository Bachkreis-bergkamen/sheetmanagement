import type { Texts } from '../types.ts';

/** What the reminder and check jobs send and report (#157, #144, #159). */
export const reminders: Texts['reminders'] = {
	pushOff: 'Neither notifications nor email are set up.',
	quiet: 'Night time, nothing sent.',
	noDevices: 'Nobody has allowed notifications yet, and no email account is connected.',
	noCalendar: "The calendar couldn't be loaded.",
	nothing: 'Nothing to remind.',
	byMail: (n: number) => `${n} of them by email.`,
	notReached: (n: number) => `${n} not delivered, trying again next time.`,
	sent: (n: number, left: number) => `${n === 1 ? '1 reminder' : `${n} reminders`} sent${left ? `, ${left} next time` : ''}.`,
	signupTitle: (event: string) => `${event}: are you coming?`,
	signupBody: (when: string) => `${when}. You haven't answered yet.`,
	loanDueTitle: (piece: string) => `Return ${piece} soon`,
	loanOverdueTitle: (piece: string) => `${piece} is overdue`,
	loanBody: (from: string, due: string) => `Rented music${from ? ` from ${from}` : ''}, due back by ${due}.`,
	checkOk: 'Archive, calendar and sheet reachable.',
	checkFailed: (names: string) => `Not reachable: ${names}.`,
	checkFailedTitle: 'Connection to Google broken',
	checkFailedBody: (what: string) => `Not reachable: ${what}. More on the status page.`,
	checkOkTitle: 'Connection to Google working again',
	checkOkBody: 'Archive, calendar and sheet are reachable again.',
	adminsTold: (n: number) => (n === 1 ? '1 admin notified.' : `${n} admins notified.`),
	errorsNone: 'No new errors.',
	errorsNew: (n: number) => (n === 1 ? '1 new kind of error.' : `${n} new kinds of errors.`),
	errorsTitle: (n: number) => (n === 1 ? 'A new error in the app' : `${n} new errors in the app`),
	errorsBody: (place: string, message: string, more: number) => `${place}: ${message}${more ? ` and ${more} more` : ''}. More on the status page.`
};

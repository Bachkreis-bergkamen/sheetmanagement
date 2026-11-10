/** The store's types (#161); see index.ts. */

import type { ErrorGroup, ErrorReport } from '#lib/errors/errors.ts';
import type { TabKey } from '#lib/repertoire/sheet.ts';
import type { PreparedImport } from './schema.ts';
import type { Stroke } from '#lib/practice/marks.ts';
import type { PracticeDay } from '#lib/practice/practice.ts';
import type { TourOutcome } from '#lib/tour/tour.ts';
import type { Ticket, TicketOrder, TicketSale } from '#lib/tickets/tickets.ts';

/** Email and password sign-in: only the hash, and the stamp that changes with each new password. */
export interface Account {
	email: string;
	passwordHash: string;
	stamp: string;
}

export interface PushDevice {
	/** The push service's address for this device; also its id. */
	endpoint: string;
	email: string;
	/** The device's public key and secret for encrypting messages (base64url). */
	p256dh: string;
	auth: string;
	/** When the device was signed up, "2026-10-23 08:30:00" (UTC); for the member's data export. */
	createdAt?: string;
}

export interface SentReminder {
	kind: string;
	subject: string;
	/** "2026-10-23 08:30:00" (UTC). */
	sentAt: string;
}

export type { TourOutcome } from '#lib/tour/tour.ts';
export type { PracticeDay } from '#lib/practice/practice.ts';
export type { Stroke } from '#lib/practice/marks.ts';
export type { ErrorGroup, ErrorReport } from '#lib/errors/errors.ts';

/** One page's marks in a part. */
export interface PageMarks {
	file: string;
	page: number;
	strokes: Stroke[];
}

/** A member's marks in a part, offered to the others who play it: a copy of their pages then. */
export interface MarkShare {
	id: string;
	sender: string;
	file: string;
	/** By page. */
	pages: Record<number, Stroke[]>;
	/** When it was offered, like SQLite's datetime('now'). */
	at: string;
}

/** How a member answered an offer: took all of it, some marks by hand, or none. */
export type ShareAnswer = 'all' | 'some' | 'declined';

/** What the completeness check found for one file in the archive (#93). */
export interface PartCheck {
	fileId: string;
	/** Drive's modifiedTime when it was checked; a newer one is checked again. */
	modified: string;
	/** Its pages; null when it isn't a readable PDF. */
	pages: number | null;
	/** Too big to check within the CPU limit. */
	skipped: boolean;
	/** An organiser said the hint is wrong. */
	dismissed: boolean;
}

/**
 * One row of a tab of the orchestra's data (#186): its cells by column key, empty ones left
 * out, a link as the text it points to (see schema.ts).
 */
export interface DataRow {
	id: number;
	/** Counts the row's changes: a save names the one it read and fails if the row changed since. */
	rev: number;
	cells: Record<string, string>;
}

/** Where the data people maintain lives, and a number that changes with every change to it. */
export interface DataState {
	source: 'sheet' | 'd1';
	version: number;
}

export interface Store {
	kind: 'd1' | 'memory';
	/** The newest migration applied, e.g. "0001_reminders.sql"; null before the first. */
	schemaVersion(): Promise<string | null>;
	/** Applies the migrations not applied yet; returns their names. */
	migrate(): Promise<string[]>;

	savePush(device: PushDevice): Promise<void>;
	deletePush(endpoint: string): Promise<void>;
	/** A member's devices. */
	pushOf(email: string): Promise<PushDevice[]>;
	allPush(): Promise<PushDevice[]>;

	/** Which of these reminders already went out, as `${subject}\n${recipient}`. */
	sentReminders(kind: string, subjects: string[]): Promise<Set<string>>;
	logReminder(kind: string, subject: string, recipient: string): Promise<void>;
	/** The reminders one person got, oldest first; for their data export (#158). */
	remindersOf(recipient: string): Promise<SentReminder[]>;
	/** Forgets the reminders one person got; for "Mitglied löschen" (#158). */
	deleteRemindersOf(recipient: string): Promise<void>;
	/** Forgets reminders older than this many days. */
	pruneReminders(days: number): Promise<void>;

	/** Members who turned email reminders off (#123). */
	mailOptOuts(): Promise<Set<string>>;
	setMailOptOut(email: string, off: boolean): Promise<void>;

	/** The password account for an email, if one was made. */
	accountOf(email: string): Promise<Account | null>;
	/** Sets an account's password, making the account if needed. */
	saveAccount(account: Account): Promise<void>;
	/** Forgets an account; for "Mitglied löschen". */
	deleteAccount(email: string): Promise<void>;

	/** Counts one opening of a page (#185): its route pattern, on a day, by role. Nothing about who. */
	countPage(day: string, route: string, role: PageRole): Promise<void>;
	/** The openings since a day ("2026-10-09"), summed per route and role, most opened first. */
	pageCounts(since: string): Promise<PageCount[]>;
	/** Forgets the counts from before a day. */
	prunePageCounts(before: string): Promise<void>;

	/** Whether a member finished or skipped the tour; null while they haven't seen it. */
	tourOf(email: string): Promise<TourOutcome | null>;
	/** Remembers how the tour ended; null forgets it, so it's offered again. */
	setTour(email: string, outcome: TourOutcome | null): Promise<void>;

	/** Whether a member turned practice time on; off for everyone else. Only for the member themself. */
	practiceOn(email: string): Promise<boolean>;
	setPracticeOn(email: string, on: boolean): Promise<void>;
	/** Adds seconds to a member's day, up to `cap` for that day. */
	addPractice(email: string, day: string, seconds: number, cap: number): Promise<void>;
	/** A member's own days, oldest first. Never all members': there is no such method on purpose. */
	practiceOf(email: string): Promise<PracticeDay[]>;
	/** Forgets all of a member's practice time. */
	deletePractice(email: string): Promise<void>;

	/** A member's own marks in one part, or in all parts without `file`; by page. */
	marksOf(email: string, file?: string): Promise<PageMarks[]>;
	/** Replaces one page's marks; no strokes forget the page. */
	saveMarks(email: string, file: string, page: number, strokes: Stroke[]): Promise<void>;
	/** Forgets all of a member's marks, with their offers and their answers to others' offers. */
	deleteMarks(email: string): Promise<void>;

	/** Offers the member's marks in a part to their section; replaces an earlier offer of that part. */
	shareMarks(sender: string, file: string, pages: Record<number, Stroke[]>): Promise<MarkShare>;
	/** Takes the member's offer in a part back. */
	unshareMarks(sender: string, file: string): Promise<void>;
	/** One offer, answered or not. */
	shareById(id: string): Promise<MarkShare | null>;
	/** The member's own offer in a part, if they made one. */
	shareOf(sender: string, file: string): Promise<MarkShare | null>;
	/** Others' offers in a part that the member hasn't answered yet, newest first. */
	sharesFor(email: string, file: string): Promise<MarkShare[]>;
	answerShare(id: string, email: string, answer: ShareAnswer): Promise<void>;

	/** Everything the completeness check found (#93). */
	partChecks(): Promise<PartCheck[]>;
	/** Saves a check; a dismissed hint stays dismissed while the file is the same version. */
	savePartCheck(check: Omit<PartCheck, 'dismissed'>): Promise<void>;
	dismissPartCheck(fileId: string): Promise<void>;
	/** Forgets every check, so the archive is read again from the start; for the demo's reset. */
	clearPartChecks(): Promise<void>;

	/** Counts one more error of its kind (#191); a new kind starts unnotified. */
	logError(report: ErrorReport): Promise<void>;
	/** The kinds of errors seen within this many days, the latest first. */
	errorLog(days: number): Promise<ErrorGroup[]>;
	/** Remembers that the admins were told about these kinds. */
	markErrorsNotified(fingerprints: string[]): Promise<void>;
	/** Forgets kinds not seen for this many days; 0 forgets all ("erledigt" on /status). */
	pruneErrors(days: number): Promise<void>;

	/** Where the orchestra's data lives (#186); the sheet until an import. */
	dataState(): Promise<DataState>;
	/** Switches where the data is read from and written to, without changing it. */
	setDataSource(source: DataState['source']): Promise<void>;
	/** The tabs that exist with their rows in order; only `tabs` if given. */
	readData(tabs?: TabKey[]): Promise<Partial<Record<TabKey, DataRow[]>>>;
	/** Adds an empty tab; nothing if it exists. */
	addDataTab(tab: TabKey): Promise<void>;
	/** Adds rows; DataCheckError when one breaks a link or check (schema.ts), and then none is added. */
	appendData(tab: TabKey, rows: Record<string, string>[]): Promise<void>;
	/** Replaces the cells of these rows; DataConflictError, and nothing saved, if one changed since its `rev`. */
	updateData(tab: TabKey, rows: DataRow[]): Promise<void>;
	/** Deletes rows as read; DataConflictError if one changed since, DataCheckError if something still links to one. */
	deleteData(tab: TabKey, rows: Pick<DataRow, 'id' | 'rev'>[]): Promise<void>;
	/** Replaces all rows of a tab, e.g. a generated one. */
	replaceData(tab: TabKey, rows: Record<string, string>[]): Promise<void>;
	/** Replaces all tabs and rows at once and makes D1 the source; for the import from the sheet. */
	importData(prepared: PreparedImport, tabs: TabKey[]): Promise<void>;

	/** The ticket sale of a concert (docs/tickets-plan.md); null if it never had one. */
	ticketSale(concertId: string): Promise<TicketSale | null>;
	/** Every concert's sale, open or not. */
	ticketSales(): Promise<TicketSale[]>;
	saveTicketSale(sale: TicketSale): Promise<void>;
	/**
	 * Places an order with its tickets, only if they still fit under `capacity` together with
	 * every ticket of the concert's orders that aren't cancelled; false, and nothing kept, if not.
	 * Two orders at once can't both take the last seats. Freikarten (channel 'free') don't count,
	 * and a null capacity places the order without a check.
	 */
	placeTicketOrder(order: TicketOrder, tickets: Ticket[], capacity: number | null): Promise<boolean>;
	/** One order with its tickets. */
	ticketOrder(id: string): Promise<{ order: TicketOrder; tickets: Ticket[] } | null>;
	/** Every order of a concert, cancelled ones too, oldest first, with all their tickets. */
	ticketOrders(concertId: string): Promise<{ orders: TicketOrder[]; tickets: Ticket[] }>;
	setTicketOrderStatus(id: string, status: TicketOrder['status']): Promise<void>;
	/** Check-ins from the door; a ticket keeps the first one, so a second phone can't overwrite it. */
	checkInTickets(concertId: string, entries: { code: string; at: string; by: string }[]): Promise<void>;
	/** Forgets a concert's orders, tickets and check-ins, and its sale; some weeks after the concert. */
	deleteTicketsOf(concertId: string): Promise<void>;

	/**
	 * Counts one more use of `key` in a window of this many minutes and returns the count so
	 * far, this one included; a window older than that starts again at 1. For rate limits.
	 */
	hit(key: string, windowMinutes: number): Promise<number>;

	getState(key: string): Promise<string | null>;
	setState(key: string, value: string): Promise<void>;
}

export const reminderKey = (subject: string, recipient: string) => `${subject}\n${recipient}`;

/** Who opened a page, as a role only: members, organisers, or visitors while sign-in is off. */
export type PageRole = 'mitglied' | 'verwaltung' | 'gast';

export interface PageCount {
	route: string;
	role: PageRole;
	views: number;
}

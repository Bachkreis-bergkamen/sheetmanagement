/**
 * The Kummerkasten: members write to the Leitung, anonymously unless they choose to give their
 * name, and the Leitung answers privately in the same thread. Who may read it is a right
 * ("kummerkasten.lesen"); a message goes to all of them or only to the ones the writer picks
 * (a conductor, the Orga). The writer is known to the app only as a keyed hash of their
 * address, so they find their threads again, while nobody reading them, nor anyone with the
 * Google sheet, learns who wrote. Kept in the app's database, never in the sheet.
 */

export interface KummerThread {
	id: string;
	subject: string;
	/** Addresses of the Leitung it is for; empty: everyone with the right. */
	recipients: string[];
	/** Only when the writer chose to give it. */
	authorName?: string;
	createdAt: string;
	/** The latest message from the writer and from the Leitung, for "unread". */
	lastAuthorAt: string;
	lastLeitungAt?: string;
	closedAt?: string;
}

export interface KummerMessage {
	id: string;
	fromAuthor: boolean;
	/** The Leitung person who answered; never set for the writer's messages. */
	senderEmail?: string;
	senderName?: string;
	body: string;
	createdAt: string;
}

export interface NewKummer {
	subject: string;
	body: string;
	recipients: string[];
	authorName?: string;
}

export type KummerProblem = 'subject' | 'body' | 'too-long' | 'recipient';

export const SUBJECT_MAX = 120;
export const BODY_MAX = 5000;

const clean = (text: string) => text.trim().replace(/\s+/g, ' ');

/** The form → a new thread, or what's wrong with it. `leitung` are the addresses that may be picked. */
export function kummerFromForm(form: FormData, { leitung, name }: { leitung: string[]; name: string }): { kummer: NewKummer } | { problem: KummerProblem } {
	const subject = clean(String(form.get('subject') ?? ''));
	const body = String(form.get('body') ?? '').trim();
	if (!subject) return { problem: 'subject' };
	if (!body) return { problem: 'body' };
	if (subject.length > SUBJECT_MAX || body.length > BODY_MAX) return { problem: 'too-long' };
	const picked = [...new Set(form.getAll('to').map((value) => String(value).trim().toLowerCase()))].filter(Boolean);
	if (!picked.every((email) => leitung.includes(email))) return { problem: 'recipient' };
	// Everyone ticked is the whole Leitung: the same as none, and it stays so when someone joins.
	const recipients = picked.length === leitung.length ? [] : picked;
	const signed = form.get('signed') === 'on' && clean(name);
	return { kummer: { subject, body, recipients, ...(signed ? { authorName: signed } : {}) } };
}

/** A reply's text, or what's wrong with it. */
export function replyFromForm(form: FormData): { body: string } | { problem: KummerProblem } {
	const body = String(form.get('body') ?? '').trim();
	if (!body) return { problem: 'body' };
	if (body.length > BODY_MAX) return { problem: 'too-long' };
	return { body };
}

/** Whether someone of the Leitung may read a thread: it's for all of them, or for them. */
export const isFor = (thread: Pick<KummerThread, 'recipients'>, email: string) => !thread.recipients.length || thread.recipients.includes(email.toLowerCase());

/** New for the writer: an answer since they last looked. */
export const unreadForAuthor = (thread: Pick<KummerThread, 'lastLeitungAt'>, readAt: string | undefined) =>
	!!thread.lastLeitungAt && (!readAt || thread.lastLeitungAt > readAt);

/** New for one of the Leitung: something from the writer since they last looked. */
export const unreadForLeitung = (thread: Pick<KummerThread, 'lastAuthorAt'>, readAt: string | undefined) => !readAt || thread.lastAuthorAt > readAt;

/**
 * When the writer wrote, as the Leitung sees it: the day only. The minute could tell who it was
 * ("right after Tuesday's rehearsal, from the car park").
 */
export const authorDay = (iso: string) => iso.slice(0, 10);

import { normalize } from '#lib/repertoire/sheet.ts';

/**
 * Notices to the parents of young players, shown in their area (/eltern): written by those with
 * "eltern.informieren", for all parents, for the parents of some orchestras' players, or for the
 * parents of those taking part in one date (#299).
 */

export interface ParentNotice {
	id: string;
	title: string;
	body: string;
	/** Short orchestra names; empty: for all parents. */
	orchestras: string[];
	/** One date: then only for the parents of children taking part in it, whatever `orchestras` says. */
	event: NoticeEvent | null;
	byName: string;
	createdAt: string;
}

/** The date a notice is about, with its label as it was when written: the date may change or go. */
export interface NoticeEvent {
	id: string;
	label: string;
}

export interface NewParentNotice {
	title: string;
	body: string;
	orchestras: string[];
	event: NoticeEvent | null;
	byEmail: string;
	byName: string;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 5000;

/**
 * Whether a notice is for a parent with these children: those in its orchestras (none set: all of
 * them), or, for a notice about one date, those taking part in it as `takesPart` says.
 */
export function noticeFor<C extends { orchestras: string[] }>(
	notice: Pick<ParentNotice, 'orchestras'> & { event?: NoticeEvent | null },
	children: C[],
	takesPart: (child: C, event: string) => boolean = () => false
): boolean {
	if (notice.event) return children.some((child) => takesPart(child, notice.event!.id));
	if (!notice.orchestras.length) return true;
	// A child without orchestras plays in all of them.
	return children.some(({ orchestras: own }) => !own.length || own.some((name) => notice.orchestras.some((wanted) => normalize(wanted) === normalize(name))));
}

/**
 * The form → a new notice, or what's wrong with it. `orchestras` are the configured ones, in order;
 * `dates` those a notice may be about.
 */
export function noticeFromForm(
	form: FormData,
	{ orchestras, dates = [], byEmail, byName }: { orchestras: string[]; dates?: NoticeEvent[]; byEmail: string; byName: string }
): { notice: NewParentNotice } | { problem: 'title' | 'body' | 'too-long' | 'event' } {
	const title = String(form.get('title') ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const body = String(form.get('body') ?? '').trim();
	if (!title) return { problem: 'title' };
	if (!body) return { problem: 'body' };
	if (title.length > TITLE_MAX || body.length > BODY_MAX) return { problem: 'too-long' };
	const eventId = String(form.get('event') ?? '').trim();
	const event = eventId ? dates.find((date) => date.id === eventId) : null;
	// A date that went from the calendar while the form was open.
	if (event === undefined) return { problem: 'event' };
	// About one date: its players' parents, so the orchestras don't matter.
	if (event) return { notice: { title, body, orchestras: [], event, byEmail, byName } };
	const ticked = new Set(form.getAll('orchestra').map(String));
	const chosen = orchestras.filter((name) => ticked.has(name));
	// Every orchestra ticked is the same as none: it stays for all when one is added.
	return { notice: { title, body, orchestras: chosen.length === orchestras.length ? [] : chosen, event: null, byEmail, byName } };
}


import { normalize } from '#lib/repertoire/sheet.ts';

/**
 * Notices to the parents of young players, shown in their area (/eltern): written by those with
 * "eltern.informieren", for all parents or for the parents of some orchestras' players.
 */

export interface ParentNotice {
	id: string;
	title: string;
	body: string;
	/** Short orchestra names; empty: for all parents. */
	orchestras: string[];
	byName: string;
	createdAt: string;
}

export interface NewParentNotice {
	title: string;
	body: string;
	orchestras: string[];
	byEmail: string;
	byName: string;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 5000;

/** Whether a notice is for a parent whose children play in these orchestras (none set: all of them). */
export function noticeFor(notice: Pick<ParentNotice, 'orchestras'>, childOrchestras: string[][]): boolean {
	if (!notice.orchestras.length) return true;
	// A child without orchestras plays in all of them.
	return childOrchestras.some((own) => !own.length || own.some((name) => notice.orchestras.some((wanted) => normalize(wanted) === normalize(name))));
}

/** The form → a new notice, or what's wrong with it. `orchestras` are the configured ones, in order. */
export function noticeFromForm(
	form: FormData,
	{ orchestras, byEmail, byName }: { orchestras: string[]; byEmail: string; byName: string }
): { notice: NewParentNotice } | { problem: 'title' | 'body' | 'too-long' } {
	const title = String(form.get('title') ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const body = String(form.get('body') ?? '').trim();
	if (!title) return { problem: 'title' };
	if (!body) return { problem: 'body' };
	if (title.length > TITLE_MAX || body.length > BODY_MAX) return { problem: 'too-long' };
	const ticked = new Set(form.getAll('orchestra').map(String));
	const chosen = orchestras.filter((name) => ticked.has(name));
	// Every orchestra ticked is the same as none: it stays for all when one is added.
	return { notice: { title, body, orchestras: chosen.length === orchestras.length ? [] : chosen, byEmail, byName } };
}


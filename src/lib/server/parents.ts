import { error } from '@sveltejs/kit';
import { normalizeEmail, playsIn, type Member } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import type { NoticeEvent } from '#lib/parents/notices.ts';
import { isOn } from './env.ts';
import { getLibrary, orchestraOf } from './library.ts';
import { getAccessList, getSignups } from './repertoire.ts';

/**
 * The parents' area (/eltern): a parent account (status "eltern") sees only it; a member with
 * children in the orchestra sees it besides the rest. Children are members named in the
 * parent's "Kinder" cell.
 */

export interface ParentContext {
	email: string;
	name: string;
	children: Member[];
}

/** The signed-in parent and their children; a 404 for anyone who isn't one. */
export async function parentContext(locals: App.Locals): Promise<ParentContext> {
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.parent) error(404, t.error.notFound);
	const email = normalizeEmail(user.email);
	const list = await getAccessList().catch(() => null);
	if (!list) error(503, t.error.unavailable);
	const own = list.membersByEmail.get(email);
	const children = locals.access.parent.children.map((child) => list.membersByEmail.get(child)).filter((child): child is Member => !!child);
	return { email, name: own?.name ?? user.name, children };
}

/** "Mia und Jonas" for the Leitung, so they know whose parent writes. */
export const childNames = (children: Pick<Member, 'name'>[]) => {
	const names = children.map((child) => child.name);
	return names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t.parents.and} ${names[names.length - 1]}` : (names[0] ?? '');
};

/** How far ahead a notice can be about a date (#299): the season's next months. */
const NOTICE_DAYS_AHEAD = 120;

/**
 * Who takes part in a date, for notices about it (#299): children who play in its orchestra and
 * weren't excused (answered "no"). Without the sign-ups, everyone who plays in it.
 */
export async function takingPart(): Promise<{ takesPart: (child: Pick<Member, 'email' | 'orchestras'>, event: string) => boolean; dates: NoticeEvent[] }> {
	const [library, signups] = await Promise.all([getLibrary(), isOn('signups') ? getSignups().catch(() => null) : null]);
	const schedule = library.schedule.ok ? library.schedule : null;
	return {
		takesPart: (child, id) => {
			const event = schedule?.byId.get(id);
			if (!event || !playsIn(child, orchestraOf(library, event))) return false;
			return signups?.byEvent.get(id)?.find((signup) => signup.email === child.email)?.answer !== 'no';
		},
		dates: (schedule?.events ?? [])
			.filter((event) => !event.past && event.daysUntil <= NOTICE_DAYS_AHEAD)
			.map((event) => ({ id: event.id, label: `${event.displayTitle} · ${event.date.long}` }))
	};
}

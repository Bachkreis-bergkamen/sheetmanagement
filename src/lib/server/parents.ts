import { error } from '@sveltejs/kit';
import { normalizeEmail, type Member } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { getAccessList } from './repertoire.ts';

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

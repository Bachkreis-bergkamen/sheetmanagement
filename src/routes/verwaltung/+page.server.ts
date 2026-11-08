import { redirect } from '@sveltejs/kit';
import { navGroups, organiserGroups } from '#lib/nav.ts';
import { features } from '#lib/server/env.ts';
import { countsByPage, openWork } from '#lib/server/todo.ts';
import type { PageServerLoad } from './$types';

/**
 * The organisers' area (#185): every page of organiser work this person may open, by group,
 * with the open work on each. Members have no such pages and land on the start page.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const groups = organiserGroups(navGroups({ auth: locals.auth, rights: locals.access.rights, features: features() }));
	if (!groups.length) redirect(303, '/');
	return { counts: countsByPage(await openWork(locals).catch(() => null)) };
};

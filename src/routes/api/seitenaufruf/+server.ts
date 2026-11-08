import { getStore, type PageRole } from '#lib/server/db/index.ts';
import { features } from '#lib/server/env.ts';
import { today } from '#lib/server/members.ts';
import { navGroups, organiserGroups } from '#lib/nav.ts';
import { isPageRoute } from '#lib/page-counts.ts';
import type { RequestHandler } from './$types';

/**
 * One opening of a page (#185), sent by the layout after each navigation: the route pattern
 * only. Counted per day and role (members, organisers, visitors while sign-in is off), never
 * per person, for the page audit on the status page. Answers 204 whatever happens: a count
 * must never cost the member anything.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const route = await request.text().catch(() => '');
	if (!isPageRoute(route) || (locals.auth === 'on' && !locals.access.member)) return new Response(null, { status: 204 });
	const organiser = organiserGroups(navGroups({ auth: locals.auth, rights: locals.access.rights, features: features() })).length > 0;
	const role: PageRole = locals.auth === 'off' ? 'gast' : organiser ? 'verwaltung' : 'mitglied';
	await getStore()
		.countPage(today(), route, role)
		.catch((error) => console.error('Counting a page failed:', error));
	return new Response(null, { status: 204 });
};

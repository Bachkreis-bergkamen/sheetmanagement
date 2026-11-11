import { error, redirect } from '@sveltejs/kit';
import { normalizeEmail, parentMayOpen } from '#lib/access/access.ts';
import { shownLogo } from '#lib/branding.ts';
import { config, instrumentOverrides } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { DEMO_ROLE_COOKIE, isPublicPath } from '#lib/server/auth/index.ts';
import { features, isDemo, isRelease, orchestra } from '#lib/server/env.ts';
import { countsByPage, openWork } from '#lib/server/todo.ts';
import { navGroups, workspaceOf } from '#lib/nav.ts';
import { parseInstruments } from '#lib/music/my-parts.ts';
import { visiblePolls } from '#lib/server/polls.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import { getStore } from '#lib/server/db/index.ts';
import { today } from '#lib/server/members.ts';
import { SEASONS, seasonOf, type Season } from '#lib/seasons.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	const { access, auth } = locals;
	if (auth === 'on' && !isPublicPath(url.pathname)) {
		if (!access.user) redirect(303, `/anmelden?weiter=${encodeURIComponent(url.pathname + url.search)}`);
		if (access.unavailable) error(503, t.error.unavailable);
		if (!access.member) redirect(303, '/zugang');
		// A parent account has its own area and nothing else.
		if (access.parent?.only && !parentMayOpen(url.pathname)) redirect(303, '/eltern');
	}

	const on = features();
	// Open work on the workspace tabs (#139), only on a workspace's pages and for those who see it.
	// The menu goes by all rights, also on a date where a role limited to other orchestras holds none (#305).
	const held = access.everywhere ?? access.rights;
	const rights = [...held];
	// A parent: only their area ("only"), or a member who also has children there ("also").
	const parent = access.parent ? (access.parent.only ? ('only' as const) : ('also' as const)) : undefined;
	const polls = parent !== 'only' && (held.has('termine.planen') || (await visiblePolls(locals).catch(() => [])).length > 0);
	const counts = workspaceOf(navGroups({ auth, rights, features: on, polls, parent }), url.pathname) ? countsByPage(await openWork(locals)) : {};

	// The first instrument from "Mitglieder" is the avatar's picture (#136).
	const member = access.user ? (await getAccessList().catch(() => null))?.membersByEmail.get(normalizeEmail(access.user.email)) : undefined;
	const instrument = member?.instrument ? parseInstruments(member.instrument, config)[0]?.instrument : undefined;

	const { name, shortName, logo, links, colours, style, look } = orchestra();
	// The tour for new members, until they finish or skip it; not on sign-in or legal pages.
	const tour = isPublicPath(url.pathname) || parent === 'only' ? ('seen' as const) : await tourState(access.user?.email);
	return {
		orchestraName: name,
		orchestraShortName: shortName,
		// Sharp on the page: the built-in PNG's SVG twin.
		logo: shownLogo(logo),
		links,
		brand: { colour: colours.brand, style, look },
		features: on,
		// The drawing for the season in a few quiet corners (#202), unless the orchestra turned it off.
		// The demo shows any season with ?jahreszeit=winter.
		season: on.seasons ? (isDemo() && SEASONS.includes(url.searchParams.get('jahreszeit') as Season) ? (url.searchParams.get('jahreszeit') as Season) : seasonOf(today())) : null,
		instruments: instrumentOverrides(),
		auth,
		user: access.user ? { ...access.user, instrument } : null,
		rights,
		parent,
		polls,
		counts,
		tour,
		// The live app is still a preview: a "Beta" badge in the header until RELEASE is set.
		beta: !isDemo() && !isRelease(),
		demo: isDemo() ? { role: demoRole(cookies.get(DEMO_ROLE_COOKIE)) } : null
	};
};

/** The demo user the banner shows as chosen. */
const demoRole = (value: string | undefined): 'verwaltung' | 'mitglied' | 'eltern' => (value === 'mitglied' || value === 'eltern' ? value : 'verwaltung');

/**
 * Whether to offer the tour: from D1 for someone signed in; "local" leaves it to the browser,
 * for visitors while sign-in is off and when the database doesn't answer.
 */
async function tourState(email: string | undefined): Promise<'offer' | 'seen' | 'local'> {
	if (!email) return 'local';
	try {
		return (await getStore().tourOf(normalizeEmail(email))) ? 'seen' : 'offer';
	} catch (error) {
		console.error('Reading the tour state failed:', error);
		return 'local';
	}
}

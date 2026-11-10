import { error, redirect } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
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
	}

	const on = features();
	// Open work on the workspace tabs (#139), only on a workspace's pages and for those who see it.
	const rights = [...access.rights];
	const polls = access.rights.has('termine.planen') || (await visiblePolls(locals).catch(() => [])).length > 0;
	const counts = workspaceOf(navGroups({ auth, rights, features: on, polls }), url.pathname) ? countsByPage(await openWork(locals)) : {};

	// The first instrument from "Mitglieder" is the avatar's picture (#136).
	const member = access.user ? (await getAccessList().catch(() => null))?.membersByEmail.get(normalizeEmail(access.user.email)) : undefined;
	const instrument = member?.instrument ? parseInstruments(member.instrument, config)[0]?.instrument : undefined;

	const { name, shortName, logo, links, colours, style, look } = orchestra();
	// The tour for new members, until they finish or skip it; not on sign-in or legal pages.
	const tour = isPublicPath(url.pathname) ? ('seen' as const) : await tourState(access.user?.email);
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
		polls,
		counts,
		tour,
		// The live app is still a preview: a "Beta" badge in the header until RELEASE is set.
		beta: !isDemo() && !isRelease(),
		demo: isDemo() ? { role: cookies.get(DEMO_ROLE_COOKIE) === 'mitglied' ? ('mitglied' as const) : ('verwaltung' as const) } : null
	};
};

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

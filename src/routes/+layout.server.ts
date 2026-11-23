import { error, redirect, type Cookies } from '@sveltejs/kit';
import { normalizeEmail, parentMayOpen } from '#lib/access/access.ts';
import { shownLogo } from '#lib/branding.ts';
import { config, instrumentOverrides } from '#lib/config/index.ts';
import * as t from '#lib/i18n/texts.ts';
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
	// The reads below don't wait for each other (#349): they run side by side on every navigation.
	const pollsRead = Promise.resolve(parent !== 'only' && on.polls && (held.has('termine.planen') || visiblePolls(locals).then((list) => list.length > 0, () => false)));
	// The counts need the menu, and the menu needs to know whether there are polls.
	const countsRead = pollsRead.then(async (polls) => (workspaceOf(navGroups({ auth, rights, features: on, polls, parent }), url.pathname) ? countsByPage(await openWork(locals)) : {}));
	// The first instrument from "Mitglieder" is the avatar's picture (#136).
	const memberRead = access.user ? getAccessList().then((list) => list?.membersByEmail.get(normalizeEmail(access.user!.email)), () => undefined) : undefined;
	// The tour for new members, until they finish or skip it; not on sign-in or legal pages.
	const tourRead = isPublicPath(url.pathname) || parent === 'only' ? ('seen' as const) : tourState(access.user?.email, cookies);
	const [polls, counts, member, tour] = await Promise.all([pollsRead, countsRead, memberRead, tourRead]);
	const instrument = member?.instrument ? parseInstruments(member.instrument, config)[0]?.instrument : undefined;

	const { name, shortName, logo, links, colours, style, look } = orchestra();
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

/** Remembers in the browser that this account has seen the tour, so the database isn't asked again. */
const TOUR_COOKIE = 'tour_seen';
const TOUR_COOKIE_DAYS = 30;

/** The account as the cookie names it: not the address itself, and another account on the device doesn't match. */
async function tourMark(email: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
	return [...new Uint8Array(digest).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Whether to offer the tour: from D1 for someone signed in; "local" leaves it to the browser,
 * for visitors while sign-in is off and when the database doesn't answer. Once seen it never
 * changes, so a cookie answers from then on instead of a read on every navigation (#349). Not in
 * the demo, whose users become new again with every reset.
 */
async function tourState(email: string | undefined, cookies: Cookies): Promise<'offer' | 'seen' | 'local'> {
	if (!email) return 'local';
	try {
		const account = normalizeEmail(email);
		const mark = isDemo() ? null : await tourMark(account);
		if (mark && cookies.get(TOUR_COOKIE) === mark) return 'seen';
		if (!(await getStore().tourOf(account))) return 'offer';
		if (mark) cookies.set(TOUR_COOKIE, mark, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: TOUR_COOKIE_DAYS * 86_400 });
		return 'seen';
	} catch (error) {
		console.error('Reading the tour state failed:', error);
		return 'local';
	}
}

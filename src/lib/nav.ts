import type { Right } from '#lib/access/access.ts';
import type { IconName } from '#lib/components/Icon.svelte';
import { ALL_ON, type Features } from '#lib/features.ts';
import { t } from '#lib/i18n/index.ts';

/**
 * The app's pages grouped by who uses them: what every member plays and joins in, then the
 * work some people do for everyone (looking after the sheet music, running the app). Members
 * get four places in the header and the tab bar (Übersicht, Meine Noten, Kalender, Profil)
 * and the rest under "Mehr". The organisers' work is one area of its own, "Verwaltung", in
 * the profile's place (#185): its pages aren't mixed into the members' menu.
 */

export interface NavItem {
	href: string;
	label: string;
	icon: IconName;
	/** Shown in the header and the mobile tab bar, not only in "Mehr". */
	primary?: boolean;
}

export interface NavGroup {
	key: 'musik' | 'mitmachen' | 'pflege' | 'verwaltung' | 'bereich';
	label: string;
	items: NavItem[];
	/**
	 * A workspace: pages that belong to one job and are used one after another. Their pages
	 * show the group as tabs, and the start page shows the group as one entry.
	 */
	workspace?: boolean;
	/** Work for organisers: reached through the "Verwaltung" area, not the members' menu. */
	organiser?: boolean;
}

export interface NavContext {
	/** Sign-in mode: "off" leaves the app open and read-only. */
	auth: 'on' | 'off';
	rights: readonly Right[] | ReadonlySet<Right>;
	/** Parts of the app that are on (#134); all of them when left out. */
	features?: Features;
	/** Date polls (#95): for those who plan dates, and for those a poll is meant for. */
	polls?: boolean;
}

const has = (rights: NavContext['rights'], right: Right) =>
	Array.isArray(rights) ? rights.includes(right) : (rights as ReadonlySet<Right>).has(right);

export function navGroups({ auth, rights, features = ALL_ON, polls = false }: NavContext): NavGroup[] {
	const admin = has(rights, 'mitglieder.verwalten');
	const groups: NavGroup[] = [
		{
			key: 'musik',
			label: t.nav.groups.musik,
			items: [
				{ href: '/meine-noten', label: t.nav.myParts, icon: 'parts', primary: true },
				{ href: '/kalender', label: t.nav.concerts, icon: 'calendar', primary: true },
				{ href: '/stuecke', label: t.nav.pieces, icon: 'music' },
				{ href: '/chronik', label: t.nav.chronicle, icon: 'history' }
			]
		},
		{
			key: 'mitmachen',
			label: t.nav.groups.mitmachen,
			// Wishes need someone signed in, so each +1 counts once; the profile too.
			items:
				auth === 'on'
					? [
							...(features.wishes ? [{ href: '/wuensche', label: t.nav.wishes, icon: 'bulb' as const }] : []),
							...(polls ? [{ href: '/termine', label: t.nav.polls, icon: 'poll' as const }] : []),
							// Anonymous messages to the Leitung, and its inbox for those who read it.
							{ href: '/kummerkasten', label: t.nav.kummer, icon: 'mail' as const },
							// Also behind the avatar in the header; in the tab bar for members (see primaryNav).
							{ href: '/profil', label: t.nav.profile, icon: 'user' as const, primary: true }
						]
					: []
		},
		{
			// The music librarian's desk: what's broken, missing or borrowed, and the archive's details.
			key: 'pflege',
			label: t.nav.groups.pflege,
			workspace: true,
			organiser: true,
			items: [
				...(has(rights, 'stuecke.bearbeiten')
					? [
							{ href: '/meldungen', label: t.nav.reports, icon: 'flag' as const },
							{ href: '/fehlende-stimmen', label: t.nav.gaps, icon: 'alert' as const },
							{ href: '/stuecke/angaben', label: t.nav.details, icon: 'sparkle' as const },
							{ href: '/namen', label: t.nav.naming, icon: 'text' as const },
							...(features.loans ? [{ href: '/leihmaterial', label: t.nav.loans, icon: 'loan' as const }] : [])
						]
					: []),
				// The choirs and orchestras concerts are given with, for those who plan the programmes.
				...(has(rights, 'programme.bearbeiten') ? [{ href: '/ensembles', label: t.nav.ensembles, icon: 'users' as const }] : [])
			]
		},
		{
			key: 'verwaltung',
			label: t.nav.groups.verwaltung,
			workspace: true,
			organiser: true,
			items: [
				...(admin && auth === 'on' ? [{ href: '/admin', label: t.nav.admin, icon: 'shield' as const }] : []),
				// Every setting in one place (#185): the orchestra, the sheet and data, the status.
				...(admin || auth === 'off'
					? [{ href: auth === 'on' ? '/einstellungen' : '/einstellungen/status', label: t.nav.settings, icon: 'sliders' as const }]
					: [])
			]
		}
	];
	return groups.filter((group) => group.items.length);
}

/**
 * The navigation entry for the current page: the most specific one, so "/stuecke/angaben"
 * counts as "Angaben ergänzen", not as the archive. Home only on the start page.
 */
export function currentItem(groups: NavGroup[], path: string): { group: NavGroup; item: NavItem } | undefined {
	return groups
		.flatMap((group) => group.items.filter((item) => isActive(item.href, path)).map((item) => ({ group, item })))
		.sort((a, b) => b.item.href.length - a.item.href.length)[0];
}

/** The workspace the current page belongs to, for its tabs; only with more than one page. */
export function workspaceOf(groups: NavGroup[], path: string): NavGroup | undefined {
	const group = currentItem(groups, path)?.group;
	return group?.workspace && group.items.length > 1 ? group : undefined;
}

/** The organisers' area: its hub page lists the organiser groups (#185). */
export const ORGANISER_HUB = '/verwaltung';

/** The groups of organiser work this person sees; none for members. */
export function organiserGroups(groups: NavGroup[]): NavGroup[] {
	return groups.filter((group) => group.organiser);
}

/** Whether the page belongs to the organisers' area: its hub or one of its pages. */
export function inOrganiserArea(groups: NavGroup[], path: string): boolean {
	return isActive(ORGANISER_HUB, path) || !!currentItem(groups, path)?.group.organiser;
}

/**
 * The pages shown directly in the header and the tab bar: home, the primary pages, then the
 * organisers' area for those who have one, the profile for everyone else (it's also behind
 * the avatar, so organisers don't lose it).
 */
export function primaryNav(groups: NavGroup[]): NavItem[] {
	const organiser = organiserGroups(groups).length > 0;
	const primary = groups.flatMap((group) => group.items.filter((item) => item.primary && !(organiser && item.href === '/profil')));
	return [
		{ href: '/', label: t.nav.home, icon: 'home' },
		...primary,
		...(organiser ? [{ href: ORGANISER_HUB, label: t.nav.organise, icon: 'shield' as const }] : [])
	];
}

/**
 * The groups for the "Mehr" menu: the members' groups, and the organisers' area as one entry
 * instead of all its pages. The quick search still finds every page.
 */
export function menuGroups(groups: NavGroup[]): NavGroup[] {
	const work = organiserGroups(groups);
	return [
		...groups.filter((group) => !group.organiser),
		...(work.length
			? [{ key: 'bereich' as const, label: t.nav.organise, items: [{ href: ORGANISER_HUB, label: t.nav.organise, icon: 'shield' as const, primary: true }] }]
			: [])
	];
}

/**
 * The sections of the one settings page (#185): how the app looks and what it offers (only
 * with sign-in on, it changes everyone's app), the sheet and the data, and the status. The
 * last two are open while sign-in is off; that's how a deployment is set up.
 */
export function settingsSections({ auth, rights }: Pick<NavContext, 'auth' | 'rights'>): NavItem[] {
	return [
		...(auth === 'on' && has(rights, 'mitglieder.verwalten') ? [{ href: '/einstellungen', label: t.settings.sections.orchestra, icon: 'palette' as const }] : []),
		{ href: '/einstellungen/tabelle', label: t.settings.sections.sheet, icon: 'list' as const },
		{ href: '/einstellungen/status', label: t.settings.sections.status, icon: 'activity' as const }
	];
}

/** Pages that moved, old address first; a page below the old one moves along. */
const MOVED: [from: string, to: string][] = [
	['/konzerte', '/kalender'],
	// Merged into the settings (#185).
	['/setup', '/einstellungen/tabelle'],
	['/status', '/einstellungen/status']
];

/**
 * Where a page that moved now lives: "/konzerte/…" became the calendar, "/kalender/…", and
 * "/setup" and "/status" are sections of the settings, so shared links and bookmarks keep
 * working. Null for every other path.
 */
export function movedPath(path: string): string | null {
	const move = MOVED.find(([from]) => path === from || path.startsWith(from + '/'));
	return move ? move[1] + path.slice(move[0].length) : null;
}

/** Whether `href` is the current page or a page below it ("/stuecke" for "/stuecke/abc"). */
export function isActive(href: string, path: string): boolean {
	return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
}

import { t } from '#lib/i18n/index.ts';

/**
 * The tour for new members, in two short chapters: first the few places a member needs (the
 * next date, their parts, the calendar, the archive, "Mehr"), each pointing at the real thing;
 * then, if they like, setting the app up for themselves on their profile with its own controls
 * (instrument, look and text size, reminders, the app on the home screen). Offered once;
 * finishing or skipping it is remembered (D1 for those signed in, the browser otherwise).
 */

/** How the tour ended: taken to the end, or skipped. */
export type TourOutcome = 'done' | 'skipped';

export type TourChapter = 'basics' | 'setup';

export interface TourStep {
	key: keyof typeof t.tour.steps | 'setupOffer';
	chapter: TourChapter;
	/** The page the step is shown on; the tour goes there first. None: wherever the tour is. */
	path?: string;
	/**
	 * What the step points at, as CSS selectors tried in turn; all visible matches of the first
	 * that has any are ringed together (the header's link on wide screens, the tab bar's on
	 * phones; two rows of settings at once). None: the card alone.
	 */
	target?: string | string[];
	/** Left out when its target isn't on the page, e.g. notifications that aren't set up. */
	optional?: boolean;
}

/** The steps; setting things up only for someone signed in, who has a profile. */
export function tourSteps({ account }: { account: boolean }): TourStep[] {
	const basics: TourStep[] = [
		{ key: 'home', chapter: 'basics', path: '/', target: ['[data-tour="next"]', '[data-tour="/"]'] },
		{ key: 'parts', chapter: 'basics', path: '/meine-noten', target: ['[data-tour="instrument"]', '[data-tour="/meine-noten"]'] },
		{ key: 'calendar', chapter: 'basics', path: '/kalender', target: '[data-tour="/kalender"]' },
		{ key: 'pieces', chapter: 'basics', path: '/stuecke', target: '[data-tour="/stuecke"]' },
		{ key: 'more', chapter: 'basics', path: '/stuecke', target: '[data-tour="more"]' }
	];
	if (!account) return [...basics, { key: 'doneOpen', chapter: 'basics', path: '/' }];
	return [
		...basics,
		// A pause between the chapters: setting up is offered, not pressed on anyone.
		{ key: 'setupOffer', chapter: 'basics' },
		{ key: 'instruments', chapter: 'setup', path: '/profil', target: '[data-tour="instruments"]', optional: true },
		{ key: 'view', chapter: 'setup', path: '/profil', target: '[data-tour="view"]' },
		{ key: 'notifications', chapter: 'setup', path: '/profil', target: '#benachrichtigungen, #email', optional: true },
		{ key: 'install', chapter: 'setup', path: '/profil', target: '[data-tour="install"]', optional: true },
		{ key: 'done', chapter: 'setup', path: '/profil', target: '[data-tour="retake"]' }
	];
}

/** How the tour ended, from a form or the browser's storage; anything else is nothing. */
export function readOutcome(value: unknown): TourOutcome | null {
	return value === 'done' || value === 'skipped' ? value : null;
}

/** Where people without an account keep how the tour ended. */
export const TOUR_STORAGE_KEY = 'tour';

/**
 * Whether to offer the tour: the server's answer for someone signed in; for everyone else
 * (or when the database didn't answer) what this browser remembers.
 */
export function shouldOffer(server: 'offer' | 'seen' | 'local', stored: string | null): boolean {
	return server === 'offer' || (server === 'local' && !readOutcome(stored));
}

export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * Where the card goes: below what it points at, else above it, else at the bottom of the
 * free space (a target taller than the screen); centred on the target but inside the screen.
 * Without a target it sits at the bottom, in the middle. `view` is the space between the
 * header and the tab bar, `width` the whole screen's.
 */
export function placeCard(target: Box | null, card: { width: number; height: number }, view: { width: number; top: number; bottom: number }, gap = 12) {
	const margin = 16;
	const clampLeft = (left: number) => Math.max(margin, Math.min(left, view.width - card.width - margin));
	if (!target) return { left: clampLeft((view.width - card.width) / 2), top: view.bottom - card.height - margin, side: 'none' as const };
	const left = clampLeft(target.left + target.width / 2 - card.width / 2);
	const below = target.top + target.height + gap;
	if (below + card.height <= view.bottom - margin) return { left, top: Math.max(below, view.top + margin), side: 'below' as const };
	const above = target.top - gap - card.height;
	if (above >= view.top + margin) return { left, top: Math.min(above, view.bottom - card.height - margin), side: 'above' as const };
	return { left, top: view.bottom - card.height - margin, side: 'over' as const };
}

/**
 * Parts of the app an orchestra may not use (#134). Each is on unless the deployment turns it
 * off, in the preset's `features` or with FEATURES_OFF; a feature that is off has no pages, no
 * navigation entries, no counts and no sheet tab created for it. The few in OPT_IN are the other
 * way round: off unless the deployment turns them on, in the preset or with FEATURES_ON.
 */

import type { TabKey } from '#lib/repertoire/sheet.ts';

export const FEATURES = ['loans', 'musicReport', 'attendance', 'signups', 'wishes', 'calendarFeed', 'offline', 'seasons', 'tickets'] as const;

export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

/**
 * Off unless the deployment turns them on: selling tickets has legal and payment consequences,
 * so an orchestra has to choose it (docs/tickets-plan.md). /einstellungen can turn them off
 * again, but not on.
 */
export const OPT_IN: readonly Feature[] = ['tickets'];

/** The words FEATURES_OFF accepts besides the names above: the pages' German names. */
const ALIASES: Record<string, Feature> = {
	leihmaterial: 'loans',
	gema: 'musicReport',
	musikfolge: 'musicReport',
	anwesenheit: 'attendance',
	anmeldungen: 'signups',
	wuensche: 'wishes',
	wünsche: 'wishes',
	kalender: 'calendarFeed',
	kalenderabo: 'calendarFeed',
	jahreszeiten: 'seasons',
	karten: 'tickets',
	kartenverkauf: 'tickets'
};

const byName = new Map<string, Feature>([...FEATURES.map((feature) => [feature.toLowerCase(), feature] as const), ...Object.entries(ALIASES)]);

export const ALL_ON: Features = Object.fromEntries(FEATURES.map((feature) => [feature, true])) as Features;

/**
 * The features of a deployment: the preset's choice, then FEATURES_ON ("karten") and
 * FEATURES_OFF ("loans, gema") on top. Unknown words are returned too, so /status can point
 * out a typo.
 */
export function resolveFeatures(preset: Partial<Features> = {}, off = '', on = ''): { features: Features; unknown: string[] } {
	const features = { ...ALL_ON, ...Object.fromEntries(OPT_IN.map((feature) => [feature, false])), ...preset };
	const unknown: string[] = [];
	for (const [text, value] of [[on, true], [off, false]] as const) {
		for (const word of text.split(/[,;\s]+/).filter(Boolean)) {
			const feature = byName.get(word.toLowerCase());
			if (feature) features[feature] = value;
			else unknown.push(word);
		}
	}
	return { features, unknown };
}

/** Sheet tabs only a feature uses: /setup doesn't create them while it's off. */
export const FEATURE_TABS: Partial<Record<TabKey, Feature>> = { loans: 'loans', attendance: 'attendance', signups: 'signups', wishes: 'wishes' };

/** The feature a page or file belongs to, so its form actions and downloads answer 404 while it's off. */
export function featureOfPath(path: string): Feature | undefined {
	if (path === '/leihmaterial' || path.startsWith('/leihmaterial/')) return 'loans';
	if (path === '/wuensche' || path.startsWith('/wuensche/')) return 'wishes';
	// The feed sits next to the calendar's pages: only the .ics file itself.
	if (/^\/kalender\/[^/]+\.ics$/.test(path)) return 'calendarFeed';
	if (/^\/kalender\/[^/]+\/anwesenheit(\/|$)/.test(path)) return 'attendance';
	if (/^\/kalender\/[^/]+\/musikfolge\.csv$/.test(path)) return 'musicReport';
	if (/^\/kalender\/[^/]+\/karten(\/|$)/.test(path)) return 'tickets';
	if (/^\/(einlass|karte|api\/karten|api\/einlass)(\/|$)/.test(path)) return 'tickets';
	return undefined;
}

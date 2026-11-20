import type { Texts } from '../types.ts';

export const profile: Texts['profile'] = {
	title: 'Profile',
	lead: 'Your details and settings, grouped by topic.',
	settings: 'Settings',
	sections: {
		jump: 'On this page',
		about: 'About you',
		aboutLead: 'What you play and whether you are taking part right now. Your parts and the seating follow from this.',
		notify: 'Notifications & calendar',
		notifyLead: 'How you hear about rehearsals and concerts.',
		app: 'Display & app',
		appLead: 'How the app looks, on this device.',
		practice: 'Practice & your data',
		practiceLead: 'What the app keeps only for you, and all of it to take with you.',
		signIn: 'Sign-in & security',
		signInLead: 'How you sign in, and signing out.'
	},
	notMember: 'The profile is for registered members.',
	name: 'First and last name',
	instruments: 'Instruments',
	orchestras: 'Orchestras',
	orchestrasHint: "None ticked: you see the concerts of every orchestra.",
	status: 'Status',
	statuses: { aktiv: 'active', pausiert: 'paused', inaktiv: 'inactive', verwaltung: 'admin only', eltern: 'parent' } as Record<string, string>,
	statusHints: {
		aktiv: 'You count for the instrumentation.',
		pausiert: 'For example a semester abroad or parental leave. With a date you become active again automatically.',
		inaktiv: "You keep your access but don't count for the instrumentation.",
		verwaltung: "An admin-only account that doesn't play: it doesn't appear in sign-ups, attendance or polls.",
		eltern: "A parent who doesn't play: the account sees only the parents' area with their children's dates, no music."
	} as Record<string, string>,
	pausedUntil: 'Paused until (optional)',
	pausedUntilShort: (day: string) => `until ${day}`,
	save: 'Save',
	saved: 'Saved.',
	groups: 'Groups',
	groupsHint: 'Admins give groups and rights.',
	gone: "Your entry in “Members” wasn't found. Please reload the page.",
	failed: "Your profile couldn't be saved just now. Please try again.",
	unknownStatus: "This status doesn't exist.",
	badDate: "The date can't be read."
};

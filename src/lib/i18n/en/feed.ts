import type { Texts } from '../types.ts';

/** The personal calendar feed (#122), on /profil and in the feed itself. */
export const feed: Texts['feed'] = {
	title: 'Dates in your own calendar',
	lead: 'Every date in your calendar app, with your answer (✓ ? ✗) and what is rehearsed.',
	create: 'Create calendar link',
	subscribe: 'Subscribe in your calendar',
	copy: 'Copy link',
	copied: 'Copied',
	renew: 'Create new link',
	revoke: 'Block link',
	confirmRenew: 'Create a new link? Calendars subscribed to the old one will stop getting dates.',
	confirmRevoke: 'Block the link? Calendars subscribed to it will stop getting dates.',
	hint: 'Personal, please don’t pass it on. Google Calendar: Other calendars → From URL.',
	notSetUp: 'Not set up yet. An admin needs to run “Set up sheet” once.',
	failed: "The link couldn't be saved just now. Please try again.",
	program: 'Programme:',
	rehearsed: 'Rehearsed:',
	answer: (answer: string) => `Your answer: ${answer}`,
	details: 'Details:',
	parts: 'Your parts:',
	calendarName: (orchestra: string) => `${orchestra} · Dates`,
	/** The concerts for the orchestra's website (#197). */
	publicCalendarName: (orchestra: string) => `${orchestra} · Concerts`,
	publicProgram: 'Programme:'
};

import type { Texts } from '../types.ts';

export const concerts: Texts['concerts'] = {
	title: 'Calendar',
	lead: 'Rehearsals, concerts and date polls.',
	empty: 'Once the rehearsal calendar is connected, every concert and rehearsal shows here.',
	failed: "The calendar couldn't be loaded just now. Please try again in a moment.",
	past: 'Past concerts',
	noUpcoming: 'There are no dates in the calendar right now.',
	subscribe: 'Subscribe in Google Calendar',
	ownCalendar: 'Dates in my calendar',
	filters: { kind: 'Type', answer: 'My answer', concerts: 'Concerts', rehearsals: 'Rehearsals' },
	view: 'View',
	list: 'List',
	calendar: 'Month',
	next: 'Up next',
	today: 'Today',
	previousMonth: 'Previous month',
	nextMonth: 'Next month',
	noEventsThatDay: 'Nothing on this day.',
	types: {
		konzert: 'Concert',
		generalprobe: 'Dress rehearsal',
		probe: 'Rehearsal',
		sonstiges: 'Date'
	},
	tentative: 'not confirmed',
	allDay: 'all day',
	relative: (days: number) =>
		days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : days === -1 ? 'yesterday' : `${-days} days ago`,
	forConcert: (title: string) => `for ${title}`
};

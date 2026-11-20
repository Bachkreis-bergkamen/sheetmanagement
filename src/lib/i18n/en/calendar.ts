import type { Texts } from '../types.ts';

export const calendar: Texts['calendar'] = {
	/** Date polls next to the dates (#95). */
	polls: {
		new: 'New date poll',
		candidate: 'Proposed',
		waiting: (n: number, title: string) => (n === 1 ? `Date poll “${title}”: your answer is missing` : `${n} date polls are waiting for your answer`)
	},
	edit: {
		open: 'Edit',
		title: 'Edit date',
		save: 'Save changes',
		lead: 'Changed straight in the Google Calendar, for everyone to see.',
		saved: 'Saved: the date is changed in the calendar.'
	},
	add: {
		open: 'Add a date',
		short: 'Date',
		more: 'More details',
		lead: 'Goes straight into the Google Calendar, for everyone to see.',
		type: 'Type',
		title: 'Title',
		concertHint: 'e.g. Spring concert',
		untitled: (word: string) => `empty: “${word}”`,
		date: 'Date',
		start: 'Start',
		end: 'End',
		timeHint: 'No start: all day. No end: two hours for a concert, three for rehearsals.',
		location: 'Place',
		locationHint: 'e.g. School hall',
		concert: 'Rehearsal for',
		noConcert: 'No particular concert',
		tentative: 'Not certain yet (shows with “(?)”)',
		description: 'Note',
		save: 'Add to the calendar',
		yearOnly: 'Exact date unknown, only the year',
		saveArchive: 'Add to the archive',
		leadArchive: "It's in the past: goes into the archive (Repertoire sheet), not the calendar.",
		archiveOnly: 'Past concerts go into the archive; new dates are added by those who plan them.',
		places: 'Suggestions for the location',
		added: (title: string) => `“${title}” is in the calendar now.`,
		show: 'View',
		/** A role limited to some orchestras (#305) plans only their dates. */
		otherOrchestra: (orchestras: string) => `You plan dates for ${orchestras} only. Please tick one of them.`,
		readOnly:
			'Adding dates is off: the app may only read the calendar. Set CALENDAR_WRITE="true" and share the calendar with the service account with “Make changes to events”.',
		problems: {
			type: 'Please choose concert, rehearsal or dress rehearsal.',
			title: 'A concert needs a title.',
			date: 'Please choose a date.',
			'too-early': "The site doesn't show dates that far back. A past concert goes into the archive: choose “Concert”.",
			'too-late': "The site doesn't show dates that far ahead yet (up to 18 months). Is the year right?",
			time: 'Please give times as HH:MM; an end only with a start.',
			end: 'The end must be after the start.',
			concert: "That concert isn't in the calendar (any more); please pick one from the list.",
			orchestra: 'Please pick the orchestras from the list.',
			'too-long': "That's too long: title up to 120, place up to 200, note up to 2000 characters."
		},
		errors: {
			'not-configured': "The calendar isn't connected yet (CALENDAR_ID).",
			'read-only':
				'Adding dates is off: the app may only read the calendar. Set CALENDAR_WRITE="true" and share the calendar with the service account with “Make changes to events”.',
			refused: 'Google refused: the service account may not change events in this calendar. Please share it with “Make changes to events”.',
			failed: "The date couldn't be added just now. Please try again in a moment."
		}
	}
};

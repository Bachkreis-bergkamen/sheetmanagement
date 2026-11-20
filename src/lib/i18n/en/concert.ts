import type { Texts } from '../types.ts';

export const concert: Texts['concert'] = {
	/** In the public feed for the orchestra's website (#197). */
	publish: {
		title: 'Website',
		on: "On the orchestra's website",
		off: "Not on the orchestra's website",
		publish: 'Publish',
		withdraw: 'Withdraw',
		details: 'Text and tickets for the website',
		detailsHint: 'All optional. The website shows the language it is being read in.',
		textDe: 'Text (German)',
		textEn: 'Text (English)',
		ticketUrl: 'Link to tickets',
		ticketNoteDe: 'Ticket note (German)',
		ticketNoteEn: 'Ticket note (English)',
		ticketNotePlaceholder: 'e.g. Free admission, donations welcome',
		save: 'Save',
		saved: 'Saved',
		badLink: 'The ticket link must start with https://.'
	},
	map: 'Map',
	openInCalendar: 'In Google Calendar',
	rehearsals: 'Rehearsals',
	addRehearsal: 'Add a rehearsal',
	noRehearsals: 'No rehearsals in the calendar.',
	pastRehearsals: (n: number) => (n === 1 ? '1 past rehearsal' : `${n} past rehearsals`),
	program: 'Programme',
	programEmpty: 'No programme entered yet.',
	programNoSheet: 'Shows once the repertoire sheet is set up.',
	programHint: 'From the “Programme” tab.',
	notInArchive: 'no music in the library',
	archive: 'From the history',
	dateUnknown: 'Date unknown',
	preparesFor: 'Rehearsal for',
	orchestras: {
		over: 'Orchestras',
		all: 'All orchestras',
		change: 'Change',
		save: 'Save',
		hint: 'Only members of a ticked orchestra see the rehearsal and count under “Who’s coming?”.',
		none: 'Please tick at least one orchestra.',
		saved: 'Orchestras saved.'
	},
	sharedFrom: 'Same programme as',
	sharedWith: 'This programme also applies to',
	description: 'Note from the calendar',
	views: { label: 'View', overview: 'Overview', planning: 'Planning' },
	tools: 'Tools',
	lastAttendance: 'Attendance at the last rehearsal'
};

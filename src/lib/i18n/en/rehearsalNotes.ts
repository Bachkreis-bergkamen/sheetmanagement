import type { Texts } from '../types.ts';

/** Notes after a rehearsal (#145). */
export const rehearsalNotes: Texts['rehearsalNotes'] = {
	title: 'From the rehearsal',
	previous: (date: string) => `From the last rehearsal, ${date}`,
	done: 'Rehearsed',
	practise: 'To practise',
	next: 'Next time',
	doneHint: 'e.g. "Egmont up to bar 120"',
	practiseHint: 'e.g. "from letter B, slowly"',
	nextHint: 'e.g. "Morning Mood, from B"',
	write: 'Write a note',
	edit: 'Edit the note',
	lead: 'For everyone who missed it. Clearing every field removes the note.',
	empty: 'No note for this rehearsal yet.',
	save: 'Save',
	cancel: 'Cancel',
	by: (by: string, at: string) => [by, at].filter(Boolean).join(', '),
	saved: 'Note saved.',
	tooLong: 'At most 1000 characters per field, please.',
	failed: 'The note could not be saved just now. Please try again.',
	notSetUp: 'The "Rehearsal notes" tab is missing columns. The "Set up sheet" page adds them.',
	gone: 'Notes are only for rehearsals that have begun.',
	home: (date: string) => `From the rehearsal on ${date}`
};

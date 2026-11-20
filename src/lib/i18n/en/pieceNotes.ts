import type { Texts } from '../types.ts';

export const pieceNotes: Texts['pieceNotes'] = {
	title: 'Notes from rehearsals',
	earlier: 'Notes for earlier concerts',
	none: 'No notes yet, e.g. cuts, repeats or bowings.',
	add: 'Add a note',
	text: 'Note',
	textHint: 'e.g. "jump from bar 40 to 88" or "no repeat"',
	section: 'For',
	everyone: 'Everyone',
	sections: 'Sections',
	instruments: 'Instruments',
	concert: 'Applies to',
	always: 'Every performance',
	save: 'Save',
	delete: 'Delete',
	deleteNamed: (text: string) => `Delete note "${text}"`,
	forSection: (section: string) => `For ${section}`,
	forConcert: (concert: string) => `Only ${concert}`,
	meta: (by: string, at: string) => [by, at].filter(Boolean).join(', '),
	saved: 'Note saved.',
	deleted: 'Note deleted.',
	failed: 'The note could not be saved just now. Please try again.',
	notSetUp: 'The "Piece notes" tab is missing columns. The "Set up sheet" page adds them.',
	gone: 'The note no longer exists; perhaps someone deleted it already.',
	problems: {
		empty: 'Please enter a note.',
		'too-long': 'At most 500 characters, please.',
		section: 'Please choose a section or instrument from the list.',
		concert: 'Please choose a concert from the list.'
	},
	inMyParts: 'Notes'
};

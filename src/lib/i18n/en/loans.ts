import type { Texts } from '../types.ts';

export const loans: Texts['loans'] = {
	title: 'Rentals',
	lead: 'Rented music and when it goes back.',
	open: 'Out',
	returned: 'Returned',
	noOpen: 'Nothing is rented at the moment.',
	from: (from: string) => `from ${from}`,
	borrowedAt: (day: string) => `since ${day}`,
	dueAt: (day: string) => `due back ${day}`,
	dueUnknown: 'no return date',
	due: (days: number) =>
		days < -1 ? `${-days} days overdue` : days === -1 ? 'overdue since yesterday' : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`,
	returnedAt: 'returned',
	markReturned: 'Returned',
	reopen: 'Still here after all',
	add: 'Enter rented music',
	addLead: 'For music that has to go back. Two weeks before the date, the return shows under “Waiting for you”.',
	piece: 'Piece',
	pieceHint: 'Title from the library',
	fromLabel: 'From (publisher or orchestra)',
	borrowedLabel: 'Borrowed on',
	dueLabel: 'Due back',
	notes: 'Note (optional)',
	notesHint: 'e.g. hire fee, contact',
	save: 'Enter',
	saved: 'Entered.',
	problems: {
		'piece-missing': 'Please give a piece.',
		'from-missing': 'Please say who the music is from.',
		'bad-date': "The date can't be read. Possible are 2026-12-15 or 15.12.2026."
	} as Record<string, string>,
	notSetUp: 'Rentals: not in the sheet yet. Please run “Set up sheet” once.',
	failed: "The sheet couldn't be changed just now. Please try again.",
	gone: 'This entry has changed in the sheet. Please reload the page.',
	onPiece: 'Rented music',
	onPieceHint: 'Please mark only in pencil and return on time.',
	manage: 'All rentals',
	pastReturned: (n: number) => `${n} returned`
};

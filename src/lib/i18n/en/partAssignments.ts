import type { Texts } from '../types.ts';

export const partAssignments: Texts['partAssignments'] = {
	title: 'Part assignments',
	lead: 'Who plays another part instead of their own, e.g. the saxophones the bassoon part. My parts and the part set then count that one.',
	none: 'Everyone plays their own part.',
	add: 'Assign a part',
	who: 'Who',
	instruments: 'Everyone on an instrument',
	members: 'Single members',
	part: 'Plays',
	number: 'No.',
	anyNumber: 'any',
	concert: 'Applies to',
	always: 'Always',
	allPieces: 'For every piece, not just this one',
	save: 'Assign',
	delete: 'Delete',
	deleteNamed: (who: string, part: string) => `Delete assignment “${who} plays ${part}”`,
	plays: (who: string, part: string) => `${who} plays ${part}`,
	onlyConcert: (concert: string) => `Only ${concert}`,
	everyPiece: 'Every piece',
	forever: 'Always',
	meta: (by: string, at: string) => [by, at].filter(Boolean).join(', '),
	assigned: 'assigned',
	/** "Von" of a member's own pick of their part for a piece (Meine Noten). */
	ownPick: 'own pick',
	saved: 'Part assigned.',
	deleted: 'Assignment deleted.',
	failed: 'The assignment couldn’t be saved just now. Please try again.',
	notSetUp: 'The “Part assignments” tab is missing columns. “Set up sheet” adds them.',
	gone: 'This assignment no longer exists; maybe someone deleted it already.',
	problems: {
		who: 'Please pick an instrument or member from the list.',
		part: 'Please pick a part from the list.',
		concert: 'Please pick a concert from the list.'
	}
};

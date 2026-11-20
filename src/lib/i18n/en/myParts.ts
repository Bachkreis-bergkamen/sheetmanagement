import type { Texts } from '../types.ts';

export const myParts: Texts['myParts'] = {
	title: 'My parts',
	lead: 'Your parts, in programme order.',
	empty: 'After signing in you find your parts for every concert here.',
	wholeProgram: 'No rehearsal plan yet, so the whole programme.',
	concert: 'Concert',
	jumpTo: 'Jump to',
	more: (n: number) => (n === 1 ? '1 more concert' : `${n} more concerts`),
	instrument: 'Instrument',
	number: 'Part',
	anyNumber: 'all',
	pickInstrument: 'What do you play? Choose once and your parts are always here.',
	unknownInstrument: (text: string) => `The app doesn't know “${text}” as an instrument. Please choose one.`,
	save: 'Remember',
	saved: 'Remembered.',
	change: 'Change',
	show: 'Show',
	noConcert: 'There is no concert with a programme coming up right now.',
	noProgram: 'No programme entered for this concert yet.',
	shared: 'Shared part',
	open: (part: string) => `Open ${part}`,
	noPart: (instrument: string) => `No part for ${instrument}`,
	noMusic: 'No music in the library',
	missing: 'missing from the library',
	summary: (found: number, total: number) => `${found} of ${total} pieces with a part`,
	merge: 'As one PDF',
	/** Which of their parts someone plays at one concert: Violin I or Violin II, not both. */
	playing: {
		label: 'At this concert you play',
		inPiece: (piece: string) => `Your part in ${piece}`,
		forAll: 'For every piece; switch single pieces below.',
		all: 'All',
		allHint: 'Show all your parts',
		pick: (part: string) => `Show only ${part}`,
		yes: 'This also counts as a yes.',
		saved: 'Saved, with your answer to the concert too.',
		failed: 'That part isn’t one of your instruments.'
	},
	concertMode: {
		open: 'Concert mode',
		hint: 'Your parts in programme order, full screen. Turning by tap or pedal goes straight on into the next piece, and the screen stays on.',
		title: 'Concert mode',
		piece: 'Piece',
		night: 'Night'
	},
	merging: (done: number, total: number) => `Loading part ${done} of ${total} …`,
	mergeFailed: "The PDF couldn't be made. The single parts can still be opened.",
	skipped: (n: number) =>
		n === 1 ? "One part is missing from the PDF, it couldn't be loaded:" : `${n} parts are missing from the PDF, they couldn't be loaded:`,
	skipOffline: 'no connection',
	skipHttp: (status: number, text: string) => (status === 403 ? 'not signed in' : `Error ${status}${text ? ` – ${text.slice(0, 120)}` : ''}`),
	skipUnreadable: 'the file is not a readable PDF',
	mergeHint: 'Puts your parts together in programme order as one file, for printing or a tablet.',
	mergeOff: 'Putting parts together needs you to be signed in.',
	pickInstruments: 'What do you play? Choose once and your parts are always here.',
	paused: (until?: string) =>
		until ? `You're paused until ${until}. You still see your parts.` : "You're paused at the moment. You still see your parts.",
	inactive: "You're entered as inactive. You still see your parts.",
	profileHint: 'You can also change this on your profile.'
};

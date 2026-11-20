import type { Texts } from '../types.ts';

export const partSet: Texts['partSet'] = {
	link: 'Set of parts',
	title: 'Set of parts',
	lead: (players: number) =>
		`How many prints each part needs, from ${players === 1 ? '1 active member' : `${players} active members`} and their instruments: one per person, one per desk for strings, the score once. Check and change them, then print as one PDF.`,
	players: (n: number) => (n === 1 ? '1 plays' : n ? `${n} play` : 'nobody'),
	copies: (part: string) => `Prints of ${part}`,
	noMusic: 'No music in the library.',
	total: (copies: number, parts: number) => `${copies} ${copies === 1 ? 'print' : 'prints'} of ${parts} ${parts === 1 ? 'part' : 'parts'}`,
	build: 'As one PDF',
	building: (i: number, n: number) => `Part ${i} of ${n} …`,
	notPdf: 'not a PDF',
	fileName: 'Set of parts',
	orchestra: 'For',
	allOrchestras: 'All orchestras',
	apply: 'Show'
};

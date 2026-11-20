import type { Texts } from '../types.ts';

export const home: Texts['home'] = {
	title: (orchestra: string) => `${orchestra} music library`,
	hello: (name: string) => `Hello ${name}`,
	upNext: 'Up next',
	details: 'Details',
	allDates: 'All dates',
	nextConcert: 'Next concert',
	nextConcertEmpty: 'Once the calendar is connected, the next concert and its programme show here.',
	noNextConcert: 'There is no concert in the calendar right now.',
	program: 'Programme',
	pieces: (n: number) => (n === 1 ? '1 piece' : `${n} pieces`),
	morePieces: (n: number) => `+ ${n} more`,
	nextRehearsal: 'Next rehearsal',
	areYouIn: (day: string) => `Are you coming on ${day}?`,
	later: 'After that',
	answerNow: 'Answer now',
	quickLinks: 'All areas',
	work: 'Jobs in the orchestra',
	/** In the greeting: the next concert, "Autumn concert in 25 days" (#221). */
	countdown: (concert: string, when: string) => `${concert} ${when}`,
	todo: {
		title: 'Waiting for you',
		/** All open work as one row after its count ("6 things are waiting for you"); it opens to the list (#220). */
		summary: (n: number) => (n === 1 ? 'thing is waiting for you' : 'things are waiting for you'),
		reports: (n: number) => (n === 1 ? 'open report' : 'open reports'),
		wishes: (n: number) => (n === 1 ? 'open wish' : 'open wishes'),
		requests: (n: number) => (n === 1 ? 'access request' : 'access requests'),
		loans: (n: number) => (n === 1 ? 'return due' : 'returns due'),
		attendance: (n: number) => (n === 1 ? 'rehearsal without attendance' : 'rehearsals without attendance'),
		polls: (n: number) => (n === 1 ? 'date poll' : 'date polls'),
		scans: (n: number) => (n === 1 ? 'part to scan' : 'parts to scan')
	},
	/** One line under each page on the start page. */
	describe: {
		'/meine-noten': 'Your parts for the next concert.',
		'/kalender': 'Rehearsals and concerts.',
		'/chronik': 'Every concert since the beginning, in numbers.',
		'/ueben': 'Note reading, keys, playing in tune: a few minutes a day.',
		'/profil': 'Instrument, orchestra, your own calendar.',
		'/stuecke': 'Every piece with every part.',
		'/stuecke/angaben': 'Fill in missing details of pieces.',
		'/fehlende-stimmen': 'Gaps in the library.',
		'/namen': 'Bring file names into line with the convention.',
		'/wuensche': 'Suggest pieces and ideas.',
		'/meldungen': 'Deal with reported problems.',
		'/leihmaterial': 'Rented music and when it goes back.',
		'/admin': 'Members, roles and requests.',
		'/einstellungen': 'The orchestra, the sheet and data, the status.',
		'/termine': 'Agree on dates with the orga team.',
		'/ensembles': 'Choirs and orchestras we perform with.'
	} as Record<string, string>
};

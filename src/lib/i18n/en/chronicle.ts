import type { Texts } from '../types.ts';

/** The orchestra's history (#61). */
export const chronicle: Texts['chronicle'] = {
	title: 'History',
	lead: 'Every concert since the beginning, and what the orchestra likes to play most.',
	views: { label: 'View', timeline: 'Timeline', numbers: 'In numbers' },
	concerts: (n: number) => (n === 1 ? 'concert' : 'concerts'),
	pieces: (n: number) => (n === 1 ? 'piece' : 'pieces'),
	performances: (n: number) => (n === 1 ? 'performance' : 'performances'),
	since: 'since',
	decade: (decade: number) => `${decade}s`,
	undated: 'No date',
	yearUnknown: 'Year unknown',
	debut: 'new',
	debutHint: 'Played for the first time',
	noProgram: 'Programme not entered',
	mostPlayed: 'Played most often',
	mostPlayedNone: 'No piece has been on more than one programme yet.',
	times: (n: number) => `${n}×`,
	lastPlayed: (year: number) => `last ${year}`,
	playedIn: (first: number, last: number) => (first === last ? `${first}` : `${first}–${last}`),
	composers: 'Composers played most',
	composerLine: (count: number, pieces: number) => `played ${count}×, ${pieces === 1 ? '1 piece' : `${pieces} pieces`}`,
	byDecade: 'By decade',
	decadeLine: (concerts: number, pieces: number) =>
		`${concerts === 1 ? '1 concert' : `${concerts} concerts`}, ${pieces === 1 ? '1 piece' : `${pieces} pieces`}`,
	longAgo: 'Not played for a long time',
	longAgoLead: (years: number) => `Not on a programme for ${years} years or more. Time for another go?`,
	plannedAgain: 'planned again',
	longAgoNone: (years: number) => `Every piece was played within the last ${years} years.`,
	neverPlayed: 'Never played',
	neverPlayedLead: (n: number) =>
		n === 1 ? '1 piece with music in the library has never been on a programme.' : `${n} pieces with music in the library have never been on a programme.`,
	andMore: (n: number) => `and ${n} more`,
	empty: 'No past concerts yet. Old concerts go into the "Concerts" tab, their programmes into the "Programme" tab; a year is enough as the date.',
	noSheet: 'The history is built from the repertoire sheet, which is not connected yet.',
	seasonReport: 'Season report'
};

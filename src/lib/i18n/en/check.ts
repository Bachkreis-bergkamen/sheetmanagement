import type { Texts } from '../types.ts';

/** The planners' checklist on a concert page, worked out from the data. */
export const check: Texts['check'] = {
	title: 'Concert check',
	lead: "What's ready for this concert and what's still missing.",
	allDone: 'All done',
	pieces: (n: number) => (n === 1 ? '1 piece' : `${n} pieces`),
	open: (n: number) => (n === 1 ? '1 item open' : `${n} items open`),
	program: (n: number) => (n === 1 ? 'Programme with 1 piece entered' : `Programme with ${n} pieces entered`),
	noProgram: 'No programme entered yet',
	partsComplete: 'All parts in the library',
	partGaps: (pieces: string) => `${pieces} missing parts or pages`,
	planComplete: 'Every piece is planned for a rehearsal',
	duration: (minutes: number) => `About ${minutes} min.`,
	durationGaps: (pieces: string) => `Duration missing for ${pieces}`,
	loansDue: (titles: string) => `Rented music must go back before the concert: ${titles}`,
	returnLoans: (titles: string) => `Return rented music: ${titles}`,
	reportReady: 'The music report is complete',
	reportGaps: (pieces: string) => `Music report: details still missing for ${pieces}`
};

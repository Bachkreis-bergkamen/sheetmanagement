import type { Texts } from '../types.ts';

export const musicReport: Texts['musicReport'] = {
	tab: 'Music report',
	title: 'Music report',
	hint: "For the collecting society's report, as CSV for its form.",
	csv: 'Download as CSV',
	columns: {
		position: 'No.',
		title: 'Title',
		composer: 'Composer',
		arranger: 'Arranger',
		publisher: 'Publisher',
		duration: 'Duration',
		performers: 'Performers'
	},
	gaps: (n: number) => (n === 1 ? 'Details still missing for 1 piece:' : `Details still missing for ${n} pieces:`),
	missing: { composer: 'Composer', composerFull: 'Composer (full name)', publisher: 'Publisher', duration: 'Duration' } as Record<string, string>,
	complete: 'Every detail is there.',
	fullNames: 'Collecting societies want composers with their full names, e.g. “Ludwig van Beethoven” rather than “Beethoven”. The list takes them from the “Composer (full name)” column; “Look up online” when editing fills it.',
	fill: 'Fill in',
	organizer: 'Organiser',
	date: 'Date',
	venue: 'Venue'
};

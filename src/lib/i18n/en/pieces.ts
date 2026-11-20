import type { Texts } from '../types.ts';

export const pieces: Texts['pieces'] = {
	title: 'Music library',
	lead: 'Every piece with every part.',
	empty: 'Once Google Drive is connected, every piece in the library shows here.',
	failed: "The library couldn't be loaded just now. Please try again in a moment.",
	loading: 'The library is being read from Drive. This takes up to ten minutes; please check back then.',
	checkStatus: 'Check connection',
	search: 'Filter the archive: title, composer, part, note …',
	searchLabel: 'Filter the archive',
	needsWork: 'With gaps',
	/** No conductor's score in the archive, beside the other status. */
	noScore: 'Score missing',
	noMusic: 'Without music',
	byComposer: (composer: string) => `Works by ${composer}`,
	clearComposer: 'Remove composer filter',
	categoryFiles: 'Files for this category',
	count: (n: number) => (n === 1 ? '1 piece' : `${n} pieces`),
	parts: (n: number) => (n === 1 ? '1 part' : `${n} parts`),
	noResults: 'Nothing found.',
	clearSearch: 'Clear search',
	foundParts: (instruments: string) => `Part: ${instruments}`,
	foundNote: (excerpt: string) => `Note: ${excerpt}`,
	/** Found by one of a medley's songs ("Contents"). */
	foundSong: (song: string) => `Contains: ${song}`,
	/** After the first two composers of a medley: "Bizet, Offenbach and more". */
	moreComposers: 'and more',
	filter: 'Filter',
	filterGroups: { mine: 'For me', programs: 'Orchestra', categories: 'Genre', difficulty: 'Difficulty', length: 'Length', state: 'Status' },
	lengths: { kurz: 'Up to 5 min', mittel: '5–10 min', lang: 'Over 10 min' },
	myPart: 'With my part',
	assigned: 'Assigned to me',
	coming: 'In coming concerts',
	withRecording: 'With recording',
	status: {
		ok: '',
		missing: 'Parts missing',
		// Pages missing inside a part's PDF, not a missing part.
		incomplete: 'Pages missing',
		empty: 'No music',
		none: 'Not in the library'
	}
};

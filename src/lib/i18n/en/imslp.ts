import type { Texts } from '../types.ts';

/** Missing parts on IMSLP (#198), on "Missing parts". */
export const imslp: Texts['imslp'] = {
	search: 'Search IMSLP',
	searching: 'Searching IMSLP …',
	searchHint: 'For public-domain works: finds the work’s page on IMSLP and which parts are there. Downloading and uploading stay a person’s job; the licences differ per edition.',
	open: 'Open the page on IMSLP',
	has: (parts: string) => `Parts there: ${parts}`,
	noParts: 'The page has no single parts, perhaps only scores.',
	complete: 'Also all parts in one file (“Complete Parts”).',
	found: (label: string) => `${label}: on IMSLP`,
	notFound: (label: string) => `${label}: not there`,
	none: 'IMSLP has no work that is clearly this one.',
	unavailable: 'IMSLP can’t be reached just now.',
	searchThere: 'Search IMSLP yourself',
	notSearchable: 'Searching IMSLP doesn’t help for this piece.'
};

import type { Texts } from '../types.ts';

export const quickSearch: Texts['quickSearch'] = {
	label: 'Quick search',
	open: 'Search',
	shortcut: 'Ctrl K',
	placeholder: 'Piece, part, concert or page …',
	inArchive: (n: number) => (n === 1 ? 'Show in the archive' : `Show all ${n} in the archive`),
	pages: 'Pages',
	pieces: 'Pieces',
	concerts: 'Concerts',
	upcoming: 'Coming up',
	recent: 'Recently opened',
	loading: 'Loading …',
	none: (query: string) => `Nothing found for “${query}”.`,
	keys: '↑↓ choose · ↵ open · Esc close'
};

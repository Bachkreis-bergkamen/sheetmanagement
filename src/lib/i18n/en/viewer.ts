import type { Texts } from '../types.ts';

export const viewer: Texts['viewer'] = {
	show: 'View music',
	hide: 'Hide music',
	page: (page: number, pages: number) => `Page ${page} of ${pages}`,
	spread: (from: number, to: number, pages: number) => `Pages ${from}–${to} of ${pages}`,
	previous: 'Previous page',
	next: 'Next page',
	larger: 'Larger',
	smaller: 'Smaller',
	open: 'Open in new tab',
	loading: 'Loading the music …',
	hint: 'Type details from the page, or select and copy them in the new tab.'
};

import type { Texts } from '../types.ts';

/** A piece's background, "Wissenswertes" (#411): what the piece page and the print page show. */
export const facts: Texts['facts'] = {
	title: 'Background',
	sources: 'Sources',
	speaking: (seconds: number) => (seconds < 45 ? 'under 1 min to read out' : `about ${Math.round(seconds / 60)} min to read out`),
	add: 'Add background'
};

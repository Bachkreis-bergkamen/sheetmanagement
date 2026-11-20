import type { Texts } from '../types.ts';

export const duration: Texts['duration'] = {
	label: 'Duration',
	/** "about 74 min. (2 pieces without duration)" */
	total: (minutes: number, missing: number) =>
		`about ${minutes} min.${missing ? ` (${missing === 1 ? '1 piece' : `${missing} pieces`} without duration)` : ''}`,
	minutes: (minutes: number) => `${minutes} min.`,
	unknown: 'Duration not known yet',
	hint: 'The duration is on the piece (“Edit details”) and is added up here.'
};

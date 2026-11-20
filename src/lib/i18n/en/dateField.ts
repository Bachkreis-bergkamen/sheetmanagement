import type { Texts } from '../types.ts';

export const dateField: Texts['dateField'] = {
	placeholder: 'DD.MM.YYYY',
	placeholderFuzzy: 'DD.MM.YYYY, MM.YYYY or YYYY',
	pick: 'Pick from the calendar',
	unreadable: 'Please as day.month.year, e.g. 21.12.2026.',
	unreadableFuzzy: 'Please as 21.12.1957, 12.1957 or 1957.',
	tooLate: (last: string) => `Possible up to ${last}.`
};

import type { Texts } from '../types.ts';

/** Filters for a list, several at once (archive, calendar). */
export const filters: Texts['filters'] = {
	button: 'Filter',
	active: (label: string, n: number) => `${label}, ${n} on`,
	close: 'Close',
	reset: 'Reset',
	show: (n: number) => (n === 1 ? 'Show 1 entry' : `Show ${n}`),
	would: (n: number) => (n === 1 ? '1 entry' : `${n} entries`)
};

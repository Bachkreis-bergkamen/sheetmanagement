import { describe, expect, it } from 'vitest';
import { applyFilters, countWith, known, type FilterGroup } from './filters.ts';

type Piece = { title: string; orchestra: string; gaps: boolean };
const pieces: Piece[] = [
	{ title: 'Egmont', orchestra: 'A', gaps: true },
	{ title: 'Can-Can', orchestra: 'A', gaps: false },
	{ title: 'Morgenstimmung', orchestra: 'E', gaps: true },
	{ title: 'Nachtmusik', orchestra: 'K', gaps: false }
];
const groups: FilterGroup<Piece>[] = [
	{
		key: 'orchestra',
		label: 'Orchester',
		options: ['A', 'E', 'K'].map((name) => ({ value: name, label: name, test: (piece: Piece) => piece.orchestra === name }))
	},
	{ key: 'state', label: 'Zustand', options: [{ value: 'gaps', label: 'Mit Lücken', test: (piece: Piece) => piece.gaps }] }
];
const titles = (list: Piece[]) => list.map((piece) => piece.title);

describe('applyFilters', () => {
	it('keeps everything without a choice', () => {
		expect(applyFilters(pieces, groups, [])).toHaveLength(4);
	});

	it('widens within a group and narrows across groups', () => {
		expect(titles(applyFilters(pieces, groups, ['A', 'E']))).toEqual(['Egmont', 'Can-Can', 'Morgenstimmung']);
		expect(titles(applyFilters(pieces, groups, ['A', 'E', 'gaps']))).toEqual(['Egmont', 'Morgenstimmung']);
	});
});

describe('countWith', () => {
	it('says what an option would leave, given the others', () => {
		expect(countWith(pieces, groups, [], 'gaps')).toBe(2);
		expect(countWith(pieces, groups, ['gaps'], 'K')).toBe(0);
		// In the same group it adds: A or E.
		expect(countWith(pieces, groups, ['A'], 'E')).toBe(3);
		// Chosen already: what's shown now.
		expect(countWith(pieces, groups, ['A'], 'A')).toBe(2);
	});
});

describe('known', () => {
	it('drops choices no option has any more', () => {
		expect(known(groups, ['A', 'gone'])).toEqual(['A']);
	});
});

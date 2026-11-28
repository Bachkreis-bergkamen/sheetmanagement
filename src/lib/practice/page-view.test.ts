import { describe, expect, it } from 'vitest';
import { fittedFor, modeFor, shownPages, sideBySide, spreadTurn, turnTo } from './page-view.ts';

const a4 = { width: 595, height: 842 };

describe('modeFor', () => {
	it('shows two pages on a broad screen, where both fit at the size one would have', () => {
		expect(modeFor('auto', { stageWidth: 1800, stageHeight: 842, page: a4, pages: 4 })).toBe('spread');
	});

	it('keeps one page where two would shrink it', () => {
		expect(modeFor('auto', { stageWidth: 1000, stageHeight: 842, page: a4, pages: 4 })).toBe('page');
	});

	it('never shows a one-page part as two, also when two pages were chosen', () => {
		expect(modeFor('auto', { stageWidth: 1800, stageHeight: 842, page: a4, pages: 1 })).toBe('page');
		expect(modeFor('spread', { stageWidth: 1800, stageHeight: 842, page: a4, pages: 1 })).toBe('page');
	});

	it('shows half pages on a short, broad stage: a phone held sideways', () => {
		expect(modeFor('auto', { stageWidth: 800, stageHeight: 360, page: a4, pages: 1 })).toBe('half');
	});

	it('keeps what was chosen', () => {
		expect(modeFor('width', { stageWidth: 1800, stageHeight: 842, page: a4, pages: 4 })).toBe('width');
		expect(modeFor('half', { stageWidth: 1800, stageHeight: 842, page: a4, pages: 4 })).toBe('half');
	});

	it('starts with the whole page before the stage or the page is measured', () => {
		expect(modeFor('auto', { stageWidth: 0, stageHeight: 0, page: null, pages: 0 })).toBe('page');
	});
});

describe('shownPages', () => {
	it('shows one page, or this one and the next', () => {
		expect(shownPages('page', 3, 4)).toEqual([3]);
		expect(shownPages('spread', 1, 4)).toEqual([1, 2]);
	});

	it('ends the last spread with the last page', () => {
		expect(shownPages('spread', 4, 4)).toEqual([3, 4]);
		expect(shownPages('spread', 5, 5)).toEqual([4, 5]);
	});
});

describe('turnTo', () => {
	it('moves a spread on one page at a time: 1–2, 2–3, 3–4 (#414)', () => {
		expect(turnTo('spread', 1, 1, 4)).toBe(2);
		expect(turnTo('spread', 2, 1, 4)).toBe(3);
		expect(turnTo('spread', 3, -1, 4)).toBe(2);
	});

	it('stops at the spread that ends with the last page', () => {
		expect(turnTo('spread', 3, 1, 4)).toBeNull();
		expect(turnTo('spread', 1, -1, 4)).toBeNull();
	});

	it('counts a spread from the pages it shows, e.g. after coming back from the next piece', () => {
		expect(turnTo('spread', 4, -1, 4)).toBe(2);
		expect(turnTo('spread', 4, 1, 4)).toBeNull();
	});

	it('jumps to the first and last spread', () => {
		expect(turnTo('spread', 2, -99, 5)).toBe(1);
		expect(turnTo('spread', 2, 99, 5)).toBe(4);
	});

	it('turns one page otherwise, to the first and last at most', () => {
		expect(turnTo('page', 2, 1, 4)).toBe(3);
		expect(turnTo('half', 1, -1, 4)).toBeNull();
		expect(turnTo('page', 2, 99, 4)).toBe(4);
	});
});

describe('sideBySide', () => {
	it('puts pages side by side at the first one’s height', () => {
		expect(sideBySide([a4, a4])).toEqual({ size: { width: 1190, height: 842 }, shares: [0.5, 0.5] });
	});

	it('scales a page of another size to that height', () => {
		const { size, shares } = sideBySide([a4, { width: 1190, height: 1684 }]);
		expect(size).toEqual({ width: 1190, height: 842 });
		expect(shares).toEqual([0.5, 0.5]);
	});
});

describe('fittedFor', () => {
	it('fills a short stage with half the page', () => {
		expect(fittedFor('half', a4, 2000, 421)).toEqual({ width: 595, height: 842 });
	});

	it('fits two pages side by side as one sheet', () => {
		expect(fittedFor('spread', { width: 1190, height: 842 }, 2000, 421)).toEqual({ width: 595, height: 421 });
	});
});

describe('spreadTurn', () => {
	it('slides one page on or back, and not on a jump', () => {
		expect(spreadTurn(1, 2)).toBe('on');
		expect(spreadTurn(3, 2)).toBe('back');
		expect(spreadTurn(1, 4)).toBeNull();
		expect(spreadTurn(2, 2)).toBeNull();
	});
});

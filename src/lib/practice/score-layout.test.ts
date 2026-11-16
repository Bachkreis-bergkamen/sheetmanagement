import { describe, expect, it } from 'vitest';
import { dockFor, fitted, GAP, lying, PANEL, pileFor, wobble } from './score-layout.ts';

const a4 = { width: 595, height: 842 };

describe('fitted', () => {
	it('fits the whole page into the stage, by the side that runs out first', () => {
		expect(fitted(a4, 'page', 1000, 842)).toEqual({ width: 595, height: 842 });
		expect(fitted(a4, 'page', 297, 2000)).toEqual({ width: 297, height: 420 });
	});

	it('fits the width alone, however tall the page gets', () => {
		expect(fitted(a4, 'width', 1190, 400)).toEqual({ width: 1190, height: 1684 });
	});

	it('never shrinks a page below 100 px, e.g. before the stage is measured', () => {
		expect(fitted(a4, 'page', 0, 0)).toEqual({ width: 100, height: 100 });
	});
});

describe('pileFor', () => {
	it('lays the next two pages under this one and the last one played at the back', () => {
		expect(pileFor(2, 5)).toEqual([
			{ number: 3, behind: false, depth: 1 },
			{ number: 4, behind: false, depth: 2 },
			{ number: 1, behind: true, depth: 3 }
		]);
	});

	it('has nothing played before the first page, and nothing to come after the last', () => {
		expect(pileFor(1, 1)).toEqual([]);
		expect(pileFor(1, 2)).toEqual([{ number: 2, behind: false, depth: 1 }]);
		expect(pileFor(3, 3)).toEqual([{ number: 2, behind: true, depth: 1 }]);
	});
});

describe('lying', () => {
	it('is the same for a page every time, and differs from page to page', () => {
		const sheet = { number: 4, behind: false, depth: 1 };
		expect(lying(sheet)).toBe(lying({ ...sheet }));
		expect(lying(sheet)).not.toBe(lying({ ...sheet, number: 5 }));
		expect(lying(sheet)).toMatch(/^translate\(-?\d+\.\dpx, -?\d+\.\dpx\) rotate\(-?\d+\.\d\ddeg\)$/);
	});

	it('only ever tilts a little', () => {
		for (let number = 1; number < 50; number++) {
			expect(Math.abs(wobble(number, 3))).toBeLessThanOrEqual(1);
			const angle = Number(lying({ number, behind: false, depth: 1 }).match(/rotate\((-?[\d.]+)deg/)![1]);
			expect(Math.abs(angle)).toBeGreaterThanOrEqual(0.7);
			expect(Math.abs(angle)).toBeLessThanOrEqual(2);
		}
	});
});

describe('dockFor', () => {
	const page = { width: 600, height: 800 };

	it('puts the tools beside the page where its margin has room', () => {
		const dock = dockFor({ fit: 'page', stageWidth: 1400, stageHeight: 800, room: 800, whole: page, size: page });
		expect(dock).toMatchObject({ place: 'side', page: 400, left: `${1000 + GAP}px`, top: '0px', height: '100%' });
	});

	it('moves the page aside when only both margins together have room', () => {
		const stageWidth = 600 + PANEL + GAP + 20;
		const dock = dockFor({ fit: 'page', stageWidth, stageHeight: 800, room: 800, whole: page, size: page });
		expect(dock.place).toBe('side');
		expect(dock.page).toBe(20);
	});

	it('puts them below a page narrower than the screen when there is room under it', () => {
		const dock = dockFor({ fit: 'page', stageWidth: 700, stageHeight: 1200, room: 1200, whole: page, size: page });
		expect(dock).toEqual({ place: 'below', page: 50, left: '50px', top: `${800 + GAP}px`, width: '600px', height: `${1200 - 800 - GAP}px` });
	});

	it('puts them above the page otherwise, and always at the width', () => {
		expect(dockFor({ fit: 'page', stageWidth: 700, stageHeight: 900, room: 900, whole: page, size: page })).toEqual({ place: 'above', page: 50 });
		expect(dockFor({ fit: 'width', stageWidth: 1400, stageHeight: 2000, room: 2000, whole: page, size: page }).place).toBe('above');
	});

	it('decides by the page without the tools, not the smaller one they leave (#239)', () => {
		const smaller = { width: 450, height: 600 };
		expect(dockFor({ fit: 'page', stageWidth: 800, stageHeight: 600, room: 800, whole: page, size: smaller })).toEqual({ place: 'above', page: 175 });
	});
});

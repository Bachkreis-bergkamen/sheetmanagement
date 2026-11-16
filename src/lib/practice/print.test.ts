import { describe, expect, it } from 'vitest';
import { drawMarksOn, pageRule, type Pen } from './print.ts';

/** A pen that writes down what it's asked to draw. */
function recorder() {
	const calls: string[] = [];
	const pen = {
		lineWidth: 0,
		lineCap: 'butt',
		lineJoin: 'miter',
		strokeStyle: '',
		beginPath: () => calls.push('begin'),
		moveTo: (x: number, y: number) => calls.push(`M${x} ${y}`),
		lineTo: (x: number, y: number) => calls.push(`L${x} ${y}`),
		stroke: () => calls.push(`stroke ${pen.strokeStyle}`)
	};
	return { pen: pen as unknown as Pen, calls };
}

describe('drawMarksOn', () => {
	it('draws a stroke where the viewer shows it, in its colour', () => {
		const { pen, calls } = recorder();
		drawMarksOn(pen, [{ color: 'red', points: [0, 0, 0.5, 0.25, 1, 1] }], 1000, 2000);
		expect(calls).toEqual(['begin', 'M0 0', 'L500 500', 'L1000 2000', 'stroke #d0342c']);
		// As thick as in the viewer: 0.32 % of the page's width.
		expect(pen.lineWidth).toBeCloseTo(3.2);
		expect(pen.lineCap).toBe('round');
	});

	it('draws a single point as a dot', () => {
		const { pen, calls } = recorder();
		drawMarksOn(pen, [{ color: 'blue', points: [0.5, 0.5] }], 100, 100);
		expect(calls).toEqual(['begin', 'M50 50', 'L50.01 50', 'stroke #1f5fd1']);
	});

	it('draws a symbol as its lines', () => {
		const { pen, calls } = recorder();
		drawMarksOn(pen, [{ color: 'graphite', points: [0.5, 0.5], symbol: 'downbow' }], 1000, 1400);
		expect(calls.filter((call) => call === 'begin').length).toBeGreaterThan(0);
		expect(calls.at(-1)).toBe('stroke #4a4a4a');
	});

	it('leaves a page without marks alone', () => {
		const { pen, calls } = recorder();
		drawMarksOn(pen, undefined, 100, 100);
		drawMarksOn(pen, [], 100, 100);
		expect(calls).toEqual([]);
	});
});

describe('pageRule', () => {
	it("makes each sheet the part's own size, without margins", () => {
		expect(pageRule(595.276, 841.89)).toBe('@page { size: 595.3pt 841.9pt; margin: 0 }');
	});
});

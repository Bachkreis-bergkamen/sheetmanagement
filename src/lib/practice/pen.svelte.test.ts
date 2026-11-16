import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageMarks } from './page-marks.svelte.ts';
import { Pen, STAMP_GRACE } from './pen.svelte.ts';

vi.mock('../offline/marks.ts', async (original) => ({ ...(await original<typeof import('../offline/marks.ts')>()), keepPage: vi.fn(async () => {}) }));

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function setup() {
	const marks = new PageMarks(() => 'part');
	const pen = new Pen(marks, () => 1);
	pen.toggle();
	return { marks, pen };
}

describe('Pen', () => {
	it('draws a line from down to lift onto the page', () => {
		const { marks, pen } = setup();
		expect(pen.down({ id: 1, type: 'mouse', at: [0.1, 0.1] })).toBe(true);
		pen.move(1, [[0.2, 0.1], [0.3, 0.1]]);
		expect(pen.drawing?.points).toEqual([0.1, 0.1, 0.2, 0.1, 0.3, 0.1]);
		pen.lift(1);
		expect(pen.drawing).toBeNull();
		expect(marks.on(1)).toHaveLength(1);
		expect(marks.on(1)[0].color).toBe('graphite');
	});

	it('draws nothing while off', () => {
		const { marks, pen } = setup();
		pen.toggle();
		expect(pen.down({ id: 1, type: 'mouse', at: [0.1, 0.1] })).toBe(false);
		expect(pen.drawing).toBeNull();
		expect(marks.on(1)).toEqual([]);
	});

	it('lets one pointer draw: a second finger does not join, a pen takes over from the hand', () => {
		const { pen } = setup();
		pen.down({ id: 1, type: 'touch', at: [0.1, 0.1] });
		expect(pen.down({ id: 2, type: 'touch', at: [0.5, 0.5] })).toBe(false);
		pen.move(2, [[0.6, 0.6]]);
		expect(pen.drawing?.points).toEqual([0.1, 0.1]);
		expect(pen.down({ id: 3, type: 'pen', at: [0.4, 0.4] })).toBe(true);
		expect(pen.drawing?.points).toEqual([0.4, 0.4]);
		expect(pen.down({ id: 4, type: 'pen', at: [0.7, 0.7] })).toBe(false);
	});

	it('ignores fingers once a pen has drawn, until it is turned off and on again', () => {
		const { pen } = setup();
		pen.down({ id: 1, type: 'pen', at: [0.1, 0.1] });
		pen.lift(1);
		expect(pen.down({ id: 2, type: 'touch', at: [0.2, 0.2] })).toBe(false);
		pen.toggle();
		pen.toggle();
		expect(pen.down({ id: 3, type: 'touch', at: [0.2, 0.2] })).toBe(true);
	});

	it('places a symbol with a tap, and a second finger soon after takes it away again', () => {
		const { marks, pen } = setup();
		pen.choose('breath');
		expect(pen.down({ id: 1, type: 'touch', at: [0.3, 0.3] })).toBe(false);
		expect(marks.on(1)).toEqual([{ color: 'graphite', points: [0.3, 0.3], symbol: 'breath' }]);
		pen.dropTouch();
		expect(marks.on(1)).toEqual([]);
		pen.down({ id: 2, type: 'touch', at: [0.3, 0.3] });
		vi.advanceTimersByTime(STAMP_GRACE);
		pen.dropTouch();
		expect(marks.on(1)).toHaveLength(1);
	});

	it('drops a finger\'s line when a second finger makes it a zoom', () => {
		const { marks, pen } = setup();
		pen.down({ id: 1, type: 'touch', at: [0.1, 0.1] });
		pen.dropTouch();
		expect(pen.drawing).toBeNull();
		pen.lift(1);
		expect(marks.on(1)).toEqual([]);
	});

	it('erases where it goes, as one undo step', () => {
		const { marks, pen } = setup();
		marks.marks = { 1: [{ color: 'red', points: [0.1, 0.1, 0.11, 0.1] }, { color: 'red', points: [0.5, 0.5, 0.51, 0.5] }] };
		pen.choose('eraser');
		pen.down({ id: 1, type: 'mouse', at: [0.1, 0.1] });
		pen.move(1, [[0.3, 0.3], [0.5, 0.5]]);
		pen.lift(1);
		expect(marks.on(1)).toEqual([]);
		marks.undo(1);
		expect(marks.on(1)).toHaveLength(2);
	});

	it('picks a colour, which ends the eraser', () => {
		const { pen } = setup();
		pen.choose('eraser');
		pen.pick('blue');
		expect(pen.tool).toBe('line');
		expect(pen.ink).toBe('blue');
		pen.choose('eraser');
		pen.choose('eraser');
		expect(pen.tool).toBe('line');
	});

	it('keeps the line drawn so far when stopped', () => {
		const { marks, pen } = setup();
		pen.down({ id: 1, type: 'mouse', at: [0.1, 0.1] });
		pen.move(1, [[0.2, 0.2]]);
		pen.stop();
		expect(pen.on).toBe(false);
		expect(marks.on(1)).toHaveLength(1);
	});
});

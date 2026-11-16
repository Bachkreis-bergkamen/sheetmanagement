import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_STROKES, type Stroke } from './marks.ts';
import { PageMarks, SAVE_DELAY } from './page-marks.svelte.ts';

const keepPage = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../offline/marks.ts', async (original) => ({ ...(await original<typeof import('../offline/marks.ts')>()), keepPage }));

const line = (x: number): Stroke => ({ color: 'graphite', points: [x, 0.5, x + 0.01, 0.5] });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
	keepPage.mockClear();
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	fetchMock.mockReset();
});

/** The JSON bodies sent so far. */
const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

describe('PageMarks', () => {
	it('adds marks to a page and undoes them one by one', () => {
		const marks = new PageMarks(() => 'part');
		marks.add(1, line(0.1));
		marks.add(1, line(0.2));
		expect(marks.on(1)).toEqual([line(0.1), line(0.2)]);
		marks.undo(1);
		expect(marks.on(1)).toEqual([line(0.1)]);
		marks.undo(1);
		marks.undo(1);
		expect(marks.on(1)).toEqual([]);
		expect(marks.on(2)).toEqual([]);
	});

	it('refuses a mark when the page is full, until something goes', () => {
		const marks = new PageMarks(() => 'part');
		marks.marks = { 1: Array.from({ length: MAX_STROKES }, (_, i) => line(i / MAX_STROKES)) };
		expect(marks.add(1, line(0.5))).toBe(false);
		expect(marks.refused).toBe(true);
		expect(marks.fullness(1)).toBe(1);
		marks.change(1, marks.on(1).slice(1));
		expect(marks.refused).toBe(false);
		expect(marks.add(1, line(0.5))).toBe(true);
	});

	it('erases the marks near a point, a whole wipe in one undo step', () => {
		const marks = new PageMarks(() => 'part');
		marks.marks = { 1: [line(0.1), line(0.5), line(0.9)] };
		marks.erase(1, [0.1, 0.5]);
		marks.erase(1, [0.9, 0.5]);
		expect(marks.on(1)).toEqual([line(0.5)]);
		marks.undo(1);
		expect(marks.on(1)).toEqual([line(0.1), line(0.5), line(0.9)]);
	});

	it('starts a new undo step with the next wipe', () => {
		const marks = new PageMarks(() => 'part');
		marks.marks = { 1: [line(0.1), line(0.9)] };
		marks.erase(1, [0.1, 0.5]);
		marks.wiping = false;
		marks.erase(1, [0.9, 0.5]);
		marks.undo(1);
		expect(marks.on(1)).toEqual([line(0.9)]);
	});

	it('saves a page a moment after the last change, once', async () => {
		let file = 'first';
		const marks = new PageMarks(() => file);
		marks.add(2, line(0.1));
		expect(marks.saving).toBe('saving');
		await vi.advanceTimersByTimeAsync(SAVE_DELAY - 1);
		marks.add(2, line(0.2));
		file = 'second';
		await vi.advanceTimersByTimeAsync(SAVE_DELAY);
		expect(sent()).toEqual([{ file: 'second', page: 2, strokes: [line(0.1), line(0.2)] }]);
		expect(keepPage).toHaveBeenCalledWith('second', 2, [line(0.1), line(0.2)], false);
		expect(marks.saving).toBe('saved');
	});

	it('says why a save failed', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 413 }));
		const marks = new PageMarks(() => 'part');
		marks.add(1, line(0.1));
		await vi.advanceTimersByTimeAsync(SAVE_DELAY);
		expect(marks.saving).toBe('failed');
		expect(marks.failure).toBe('413');
		expect(keepPage).not.toHaveBeenCalled();
	});

	it('keeps the page on the device when offline, and says so until it has been sent', async () => {
		fetchMock.mockRejectedValue(new TypeError('offline'));
		const marks = new PageMarks(() => 'part');
		marks.add(1, line(0.1));
		await vi.advanceTimersByTimeAsync(SAVE_DELAY);
		expect(keepPage).toHaveBeenCalledWith('part', 1, [line(0.1)], true);
		expect(marks.saving).toBe('queued');
		expect(marks.failure).toBe('');
		marks.sent();
		expect(marks.saving).toBe('saved');
	});

	it('saves what is waiting at once on flush, and with keepalive on leaving', async () => {
		const marks = new PageMarks(() => 'part');
		marks.add(1, line(0.1));
		await marks.flush();
		expect(sent()).toEqual([{ file: 'part', page: 1, strokes: [line(0.1)] }]);
		marks.add(3, line(0.3));
		marks.leave();
		expect(fetchMock.mock.calls[1][1]).toMatchObject({ keepalive: true });
		await vi.advanceTimersByTimeAsync(SAVE_DELAY);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("takes what the server and the device have, but not over pages drawn on since opening", () => {
		const marks = new PageMarks(() => 'part');
		marks.marks = { 1: [line(0.1)] };
		marks.add(1, line(0.2));
		marks.merge({ 1: [], 2: [line(0.5)] }, { 3: { strokes: [line(0.7)], pending: true } }, true);
		expect(marks.on(1)).toEqual([line(0.1), line(0.2)]);
		expect(marks.on(2)).toEqual([line(0.5)]);
		expect(marks.on(3)).toEqual([line(0.7)]);
	});
});

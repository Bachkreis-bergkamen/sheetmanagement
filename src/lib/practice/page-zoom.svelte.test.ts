import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampZoom, MAX_ZOOM, PageZoom, SETTLE } from './page-zoom.svelte.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('clampZoom', () => {
	it('keeps the zoom between the fitted page and MAX_ZOOM, in hundredths', () => {
		expect(clampZoom(0.5)).toBe(1);
		expect(clampZoom(10)).toBe(MAX_ZOOM);
		expect(clampZoom(1.23456)).toBe(1.23);
	});
});

describe('PageZoom', () => {
	it('shows the new zoom at once and draws at it once the pinch rests', () => {
		const zoom = new PageZoom();
		expect(zoom.set(1.5)).toBe(true);
		expect(zoom.level).toBe(1.5);
		expect(zoom.zoomed).toBe(true);
		vi.advanceTimersByTime(SETTLE - 1);
		expect(zoom.set(2)).toBe(true);
		vi.advanceTimersByTime(SETTLE - 1);
		expect(zoom.drawn).toBe(1);
		vi.advanceTimersByTime(1);
		expect(zoom.drawn).toBe(2);
	});

	it('says when nothing changed, e.g. zooming out of the fitted page', () => {
		const zoom = new PageZoom();
		expect(zoom.set(0.8)).toBe(false);
		expect(zoom.zoomed).toBe(false);
	});
});

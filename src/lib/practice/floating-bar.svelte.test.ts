import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAR_KEY, FloatingBar, QUIET, type BarRoom } from './floating-bar.svelte.ts';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	store.clear();
});

function setup(room: Partial<BarRoom> = {}) {
	const now: BarRoom = { floating: true, roomy: false, focused: false, ...room };
	return { now, bar: new FloatingBar(() => now) };
}

describe('FloatingBar', () => {
	it('fades away after a few quiet seconds and comes back when woken', () => {
		const { bar } = setup();
		bar.follow();
		vi.advanceTimersByTime(QUIET - 1);
		expect(bar.bare).toBe(false);
		vi.advanceTimersByTime(1);
		expect(bar.bare).toBe(true);
		bar.wake();
		expect(bar.bare).toBe(false);
	});

	it('stays while the mouse or the keyboard is in it', () => {
		const { now, bar } = setup({ focused: true });
		bar.follow();
		vi.advanceTimersByTime(QUIET);
		expect(bar.bare).toBe(false);
		now.focused = false;
		bar.mouseOver = true;
		vi.advanceTimersByTime(QUIET);
		expect(bar.bare).toBe(false);
		bar.mouseOver = false;
		vi.advanceTimersByTime(QUIET);
		expect(bar.bare).toBe(true);
	});

	it('stays where the page leaves room for it, or once it no longer floats', () => {
		const { now, bar } = setup({ roomy: true });
		bar.follow();
		vi.advanceTimersByTime(QUIET);
		expect(bar.bare).toBe(false);
		now.roomy = false;
		bar.hide();
		expect(bar.bare).toBe(true);
		now.floating = false;
		bar.follow();
		expect(bar.bare).toBe(false);
		vi.advanceTimersByTime(QUIET);
		expect(bar.bare).toBe(false);
	});

	it('moves to the bottom and back, remembered on this device', () => {
		expect(setup().bar.below).toBe(false);
		setup().bar.move();
		expect(store.get(BAR_KEY)).toBe('true');
		const { bar } = setup();
		expect(bar.below).toBe(true);
		bar.move();
		expect(setup().bar.below).toBe(false);
	});
});

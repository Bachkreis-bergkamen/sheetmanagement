import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayedBar } from '#lib/practice/drills/sound.ts';
import { BarClock } from './bar-clock.svelte.ts';

let now = 0;
beforeEach(() => {
	vi.useFakeTimers();
	now = 0;
});
afterEach(() => vi.useRealTimers());

/** Moves the clock and the timers on together. */
function advance(ms: number) {
	now += ms;
	vi.advanceTimersByTime(ms);
}

const bar = (start: number) => ({ start, stop: vi.fn() }) as unknown as PlayedBar;

describe('BarClock', () => {
	it('lights each beat as it is heard, counting in, then calls done', () => {
		const clock = new BarClock(() => now);
		const played = bar(400);
		const done = vi.fn();
		clock.follow(played, 100, 4, 2, done, 30);
		expect(clock.conduct).toEqual({ start: 0, ms: 100 });
		expect(clock.beat).toBeNull();
		advance(0);
		expect(clock.beat).toBe(-4);
		advance(300);
		expect(clock.beat).toBe(-1);
		advance(100);
		expect(clock.beat).toBe(0);
		advance(200);
		expect(done).not.toHaveBeenCalled();
		advance(30);
		expect(done).toHaveBeenCalledOnce();
	});

	it('takes taps only while a bar is taking them', () => {
		const clock = new BarClock(() => now);
		clock.tap(10);
		expect(clock.taps).toEqual([]);
		clock.begin('count');
		clock.tap(10);
		clock.phase = 'tap';
		clock.tap(20);
		clock.phase = 'example';
		clock.tap(30);
		expect(clock.taps).toEqual([10, 20]);
		expect(clock.tapped).toBe(2);
		clock.begin('calibrate');
		expect(clock.taps).toEqual([]);
		expect(clock.tapped).toBe(0);
	});

	it('stops the bar and every timer at once', () => {
		const clock = new BarClock(() => now);
		const played = bar(100);
		const done = vi.fn();
		clock.begin('count');
		clock.follow(played, 100, 1, 1, done);
		clock.stop();
		advance(1000);
		expect(played.stop).toHaveBeenCalled();
		expect(done).not.toHaveBeenCalled();
		expect(clock.beat).toBeNull();
		expect(clock.phase).toBe('idle');
	});

	it('runs a timer at a time from the bar’s first beat, at once if it has passed', () => {
		const clock = new BarClock(() => now);
		now = 500;
		const run = vi.fn();
		clock.at(bar(400), 50, run);
		vi.advanceTimersByTime(0);
		expect(run).toHaveBeenCalledOnce();
	});
});

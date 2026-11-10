import { describe, expect, it } from 'vitest';
import { MAX_QUEUED_SECONDS } from '#lib/practice/practice.ts';
import { addToQueue, outcome } from './practice-queue.ts';

describe('practice time kept on the device (#304)', () => {
	it('adds up per part, at most one opening’s worth', () => {
		let queue = addToQueue({}, 'a', 30);
		queue = addToQueue(queue, 'a', 30);
		queue = addToQueue(queue, 'b', 12.4);
		expect(queue).toEqual({ a: 60, b: 12 });
		expect(addToQueue({ a: MAX_QUEUED_SECONDS - 10 }, 'a', 60).a).toBe(MAX_QUEUED_SECONDS);
		expect(addToQueue(queue, 'a', 0)).toBe(queue);
	});

	it('tells a report that counted or was refused for good from one to send again', () => {
		expect(outcome(204)).toBe('sent');
		expect(outcome(409)).toBe('refused');
		expect(outcome(404)).toBe('refused');
		expect(outcome(403)).toBe('refused');
		expect(outcome(503)).toBe('retry');
		expect(outcome(429)).toBe('retry');
		expect(outcome(500)).toBe('retry');
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { networkOr, PATIENCE_MS } from './patience.ts';

describe('networkOr (#303)', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const copy = new Response('copy');
	const answer = (body: string, after: number) => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(body)), after));

	it('takes the network when it answers in time', async () => {
		const result = networkOr(answer('fresh', 100), async () => copy);
		await vi.advanceTimersByTimeAsync(100);
		expect(await (await result).text()).toBe('fresh');
	});

	it('shows the copy when the network hangs', async () => {
		const result = networkOr(answer('fresh', 60_000), async () => copy);
		await vi.advanceTimersByTimeAsync(PATIENCE_MS);
		expect(await result).toBe(copy);
	});

	it('waits for the network when there is no copy', async () => {
		const result = networkOr(answer('fresh', 10_000), async () => undefined);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(await (await result).text()).toBe('fresh');
	});

	it('falls back to the copy at once when the request fails, and rejects without one', async () => {
		expect(await networkOr(Promise.reject(new TypeError('offline')), async () => copy)).toBe(copy);
		await expect(networkOr(Promise.reject(new TypeError('offline')), async () => undefined)).rejects.toThrow('offline');
	});
});

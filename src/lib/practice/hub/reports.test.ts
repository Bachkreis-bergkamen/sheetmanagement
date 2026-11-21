import { describe, expect, it, vi } from 'vitest';
import { sendDays, sendTime } from './reports.ts';

const answering = (status: number) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status }));
const bodyOf = (fetcher: ReturnType<typeof answering>) => JSON.parse(String(fetcher.mock.calls[0][1]?.body));
const offline = vi.fn(async () => {
	throw new TypeError('offline');
});

describe('sendTime', () => {
	it('sends whole seconds, and counts them once the server has', async () => {
		const fetcher = answering(200);
		expect(await sendTime(41.6, fetcher)).toEqual({ done: 42, counted: 42 });
		expect(bodyOf(fetcher)).toEqual({ seconds: 42 });
	});

	it('has nothing more to send once practice time was turned off', async () => {
		expect(await sendTime(30, answering(409))).toEqual({ done: 30, counted: 0 });
	});

	it('keeps the time while offline or the server is busy, and sends nothing under a second', async () => {
		expect(await sendTime(30, offline)).toEqual({ done: 0, counted: 0 });
		expect(await sendTime(30, answering(503))).toEqual({ done: 0, counted: 0 });
		const fetcher = answering(200);
		expect(await sendTime(0.4, fetcher)).toEqual({ done: 0, counted: 0 });
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe('sendDays', () => {
	it('sends the days, and hears when nothing is shared any more', async () => {
		const fetcher = answering(200);
		const days = { '2026-11-20': { answers: 4, right: 3, ms: 60_000, skills: {} } };
		expect(await sendDays(days as never, fetcher, '2026-11-21')).toBe(true);
		expect(bodyOf(fetcher).rows.length).toBeGreaterThan(0);
		expect(await sendDays({}, answering(409), '2026-11-21')).toBe(false);
		expect(await sendDays({}, offline, '2026-11-21')).toBe(true);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { videoLength } from './video-length.ts';

afterEach(() => vi.unstubAllGlobals());

describe('the Hörbeispiel’s length (#133)', () => {
	it('is asked once per video and written as a duration', async () => {
		const fetch = vi.fn(async () => Response.json({ seconds: 272 }));
		vi.stubGlobal('fetch', fetch);
		expect(await videoLength('aaaaaaaaaaa')).toBe('4:32');
		expect(await videoLength('aaaaaaaaaaa')).toBe('4:32');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('is null when YouTube names none, and asked again after a failure', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ seconds: null })));
		expect(await videoLength('bbbbbbbbbbb')).toBeNull();
		const failing = vi.fn(async () => new Response('', { status: 502 }));
		vi.stubGlobal('fetch', failing);
		await expect(videoLength('ccccccccccc')).rejects.toThrow('502');
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ seconds: 60 })));
		expect(await videoLength('ccccccccccc')).toBe('1:00');
	});
});

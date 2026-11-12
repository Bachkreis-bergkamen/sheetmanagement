import { describe, expect, it, vi } from 'vitest';
import { freshness } from './version-check.ts';
import { versionLabel, versionUrl } from '#lib/version.ts';

const answer = (body: object, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

describe('versionLabel and versionUrl', () => {
	it('shows the short commit and links to it', () => {
		expect(versionLabel('0.15.0', 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0')).toBe('v0.15.0 (a1b2c3d)');
		expect(versionUrl('a1b2c3d4e5f6')).toBe('https://github.com/Bachkreis-bergkamen/sheetmanagement/commit/a1b2c3d4e5f6');
	});

	it('falls back to the version and the repository without a commit', () => {
		expect(versionLabel('0.15.0', '')).toBe('v0.15.0');
		expect(versionUrl('')).toBe('https://github.com/Bachkreis-bergkamen/sheetmanagement');
	});
});

describe('freshness', () => {
	it("reads main's lead as what isn't deployed", async () => {
		const fetcher = answer({ ahead_by: 3, behind_by: 0, html_url: 'https://github.com/x' });
		expect(await freshness('aaaaaaa1', { fetcher })).toEqual({ behind: 3, ahead: 0, url: 'https://github.com/x' });
		expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/repos/Bachkreis-bergkamen/sheetmanagement/compare/aaaaaaa1...main'), expect.anything());
	});

	it('asks once an hour per commit', async () => {
		const fetcher = answer({ ahead_by: 0, behind_by: 0 });
		await freshness('bbbbbbb2', { fetcher, now: 0 });
		await freshness('bbbbbbb2', { fetcher, now: 30 * 60 * 1000 });
		expect(fetcher).toHaveBeenCalledTimes(1);
		await freshness('bbbbbbb2', { fetcher, now: 61 * 60 * 1000 });
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('is null when GitHub refuses or there is no commit', async () => {
		expect(await freshness('ccccccc3', { fetcher: answer({}, false) })).toBeNull();
		expect(await freshness('', { fetcher: answer({}) })).toBeNull();
	});
});

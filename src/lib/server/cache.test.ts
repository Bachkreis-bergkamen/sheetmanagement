import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cached, CacheMissError, CacheTimeoutError, clearMemoryCache, KvReadError, patchCached, type KvStore } from './cache.ts';

function memoryKv(): KvStore & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		async get(key) {
			const value = data.get(key);
			return value === undefined ? null : JSON.parse(value);
		},
		async put(key, value) {
			data.set(key, value);
		}
	};
}

describe('cached', () => {
	beforeEach(() => clearMemoryCache());

	it('builds once, then serves from memory while fresh', async () => {
		const build = vi.fn(async () => 'v1');
		const options = { key: 'k', maxAgeMs: 1000, build, now: () => 0 };

		expect(await cached(options)).toMatchObject({ value: 'v1', source: 'fresh' });
		expect(await cached(options)).toMatchObject({ value: 'v1', source: 'memory' });
		expect(build).toHaveBeenCalledTimes(1);
	});

	it('serves a stale value at once and refreshes in the background', async () => {
		let time = 0;
		let version = 0;
		const background: Promise<unknown>[] = [];
		const options = {
			key: 'k',
			maxAgeMs: 1000,
			build: async () => `v${++version}`,
			now: () => time,
			waitUntil: (p: Promise<unknown>) => background.push(p)
		};

		await cached(options);
		time = 5000;
		expect(await cached(options)).toMatchObject({ value: 'v1', source: 'memory' });
		expect(background).toHaveLength(1);
		await Promise.all(background);
		expect(await cached(options)).toMatchObject({ value: 'v2' });
	});

	it('takes a newer value another instance put in KV instead of rebuilding a stale one', async () => {
		const kv = memoryKv();
		const background: Promise<unknown>[] = [];
		let time = 0;
		const build = vi.fn(async () => 'own');
		const options = { key: 'k', maxAgeMs: 1000, build, kv, now: () => time, waitUntil: (p: Promise<unknown>) => background.push(p) };
		await cached(options);
		await Promise.all(background);
		kv.data.set('k', JSON.stringify({ storedAt: 4500, value: 'theirs' }));

		time = 5000;
		await cached(options);
		await Promise.all(background);
		expect(await cached(options)).toMatchObject({ value: 'theirs' });
		expect(build).toHaveBeenCalledTimes(1);
	});

	it('uses KV when memory is empty, e.g. in a new Worker instance', async () => {
		const kv = memoryKv();
		await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'shared', kv, now: () => 0 });
		clearMemoryCache();

		const build = vi.fn(async () => 'rebuilt');
		expect(await cached({ key: 'k', maxAgeMs: 1000, build, kv, now: () => 10 })).toMatchObject({
			value: 'shared',
			source: 'kv'
		});
		expect(build).not.toHaveBeenCalled();
	});

	it('rebuilds immediately when forced', async () => {
		const kv = memoryKv();
		await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'old', kv, now: () => 0 });
		const result = await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'new', kv, now: () => 1, force: true });
		expect(result).toMatchObject({ value: 'new', source: 'fresh' });
		expect(JSON.parse(kv.data.get('k')!).value).toBe('new');
	});

	it('starts a new build when forced, even while one is running', async () => {
		let release!: (value: string) => void;
		const slow = cached({ key: 'k', maxAgeMs: 1000, build: () => new Promise<string>((r) => (release = r)) });
		await new Promise((r) => setTimeout(r, 0));
		const forced = await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'after write', force: true });
		expect(forced.value).toBe('after write');
		release('before write');
		await slow;
	});

	it('gives up on a build that never finishes, and the next call starts over', async () => {
		const stuck = cached({ key: 'k', maxAgeMs: 1000, build: () => new Promise<string>(() => {}), timeoutMs: 20 });
		await expect(stuck).rejects.toThrow(CacheTimeoutError);

		await new Promise((r) => setTimeout(r, 25));
		const result = await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'ok', timeoutMs: 20 });
		expect(result).toMatchObject({ value: 'ok', source: 'fresh' });
	});

	it('writes to KV only when the value changed', async () => {
		const kv = memoryKv();
		const put = vi.spyOn(kv, 'put');
		let time = 0;
		const options = { key: 'k', maxAgeMs: 10, build: async () => 'same', kv, now: () => time };
		await cached(options);
		time = 100;
		await cached({ ...options, force: true });
		await cached({ ...options, build: async () => 'changed', force: true });
		expect(put).toHaveBeenCalledTimes(2);
	});

	it('shares one more build among saves that come while a forced one runs', async () => {
		let release!: (value: string) => void;
		const build = vi.fn(() => new Promise<string>((r) => (release = r)));
		const first = cached({ key: 'k', maxAgeMs: 1000, build, force: true });
		await new Promise((r) => setTimeout(r, 0));
		const second = cached({ key: 'k', maxAgeMs: 1000, build, force: true });
		const third = cached({ key: 'k', maxAgeMs: 1000, build, force: true });
		release('before');
		await first;
		await new Promise((r) => setTimeout(r, 0));
		release('after');
		expect((await second).value).toBe('after');
		expect((await third).value).toBe('after');
		expect(build).toHaveBeenCalledTimes(2);
	});

	it('writes KV at most once a second per key, the newest value last', async () => {
		const kv = memoryKv();
		const put = vi.spyOn(kv, 'put');
		const background: Promise<unknown>[] = [];
		const options = { key: 'k', maxAgeMs: 1000, kv, waitUntil: (p: Promise<unknown>) => background.push(p), force: true };
		await cached({ ...options, build: async () => 'one' });
		await cached({ ...options, build: async () => 'two' });
		await cached({ ...options, build: async () => 'three' });
		await Promise.all(background);
		expect(put).toHaveBeenCalledTimes(2);
		expect(JSON.parse(kv.data.get('k')!).value).toBe('three');
	});

	it('does not fail when KV refuses the write', async () => {
		const kv = memoryKv();
		kv.put = async () => {
			throw new Error('KV PUT failed: 429 Too Many Requests');
		};
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'v', kv })).toMatchObject({ value: 'v' });
		expect(await patchCached<string>({ key: 'k', kv, update: (value) => `${value}!` })).toBe(true);
		error.mockRestore();
	});
});

describe('cached, read-only (values too costly to build in a request)', () => {
	beforeEach(() => clearMemoryCache());

	it('throws CacheMissError instead of building when nothing is cached', async () => {
		const build = vi.fn(async () => 'built');
		await expect(cached({ key: 'k', maxAgeMs: 1000, build, kv: memoryKv(), readOnly: true })).rejects.toThrow(CacheMissError);
		expect(build).not.toHaveBeenCalled();
	});

	it('serves a stale value without refreshing it', async () => {
		const kv = memoryKv();
		kv.data.set('k', JSON.stringify({ storedAt: 0, value: 'old' }));
		const build = vi.fn(async () => 'new');
		const background: Promise<unknown>[] = [];
		const options = { key: 'k', maxAgeMs: 1000, build, kv, now: () => 5000, readOnly: true, waitUntil: (p: Promise<unknown>) => background.push(p) };
		expect(await cached(options)).toMatchObject({ value: 'old', source: 'kv' });
		expect(await cached(options)).toMatchObject({ value: 'old', source: 'memory' });
		expect(build).not.toHaveBeenCalled();
		expect(background).toHaveLength(0);
	});

	it('takes a newer value from KV once its own is stale', async () => {
		const kv = memoryKv();
		kv.data.set('k', JSON.stringify({ storedAt: 0, value: 'old' }));
		const options = { key: 'k', maxAgeMs: 1000, build: async () => 'built', kv, now: () => 5000, readOnly: true };
		await cached(options);
		kv.data.set('k', JSON.stringify({ storedAt: 4500, value: 'from cron' }));
		expect(await cached(options)).toMatchObject({ value: 'from cron', source: 'kv' });
	});

	it('still builds when forced', async () => {
		const result = await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'built', kv: memoryKv(), readOnly: true, force: true });
		expect(result).toMatchObject({ value: 'built', source: 'fresh' });
	});

	it('does not build when KV cannot be read, after one more try', async () => {
		const kv = memoryKv();
		const get = vi.spyOn(kv, 'get').mockRejectedValue(new Error('KV down'));
		const build = vi.fn(async () => 'built');
		await expect(cached({ key: 'k', maxAgeMs: 1000, build, kv, readOnly: true })).rejects.toThrow(KvReadError);
		expect(get).toHaveBeenCalledTimes(2);
		expect(build).not.toHaveBeenCalled();
	});

	it('reads KV again when the first read fails', async () => {
		const kv = memoryKv();
		kv.data.set('k', JSON.stringify({ storedAt: 0, value: 'stored' }));
		vi.spyOn(kv, 'get').mockRejectedValueOnce(new Error('blip'));
		expect(await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'built', kv, now: () => 10, readOnly: true })).toMatchObject({ value: 'stored' });
	});
});

describe('cached, waitForRefresh (the cron job)', () => {
	beforeEach(() => clearMemoryCache());

	it('refreshes a stale value before returning', async () => {
		const kv = memoryKv();
		kv.data.set('k', JSON.stringify({ storedAt: 0, value: 'old' }));
		const result = await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'new', kv, now: () => 5000, waitForRefresh: true });
		expect(result).toMatchObject({ value: 'new', source: 'fresh' });
	});

	it('hands the stale value to build, to update instead of starting over', async () => {
		const kv = memoryKv();
		kv.data.set('k', JSON.stringify({ storedAt: 0, value: 'old' }));
		const build = vi.fn(async (previous?: string) => `${previous}+changes`);
		const result = await cached({ key: 'k', maxAgeMs: 1000, build, kv, now: () => 5000, waitForRefresh: true });
		expect(build).toHaveBeenCalledWith('old');
		expect(result.value).toBe('old+changes');
	});

	it('hands the value from KV to a forced build too', async () => {
		const kv = memoryKv();
		kv.data.set('k', JSON.stringify({ storedAt: 4900, value: 'stored' }));
		const build = vi.fn(async (previous?: string) => `${previous}+write`);
		await cached({ key: 'k', maxAgeMs: 1000, build, kv, now: () => 5000, force: true });
		expect(build).toHaveBeenCalledWith('stored');
	});

	it('leaves a fresh value alone', async () => {
		const kv = memoryKv();
		kv.data.set('k', JSON.stringify({ storedAt: 4500, value: 'fresh' }));
		const build = vi.fn(async () => 'new');
		expect(await cached({ key: 'k', maxAgeMs: 1000, build, kv, now: () => 5000, waitForRefresh: true })).toMatchObject({ value: 'fresh' });
		expect(build).not.toHaveBeenCalled();
	});
});

describe('patchCached', () => {
	beforeEach(() => clearMemoryCache());

	it('changes the cached value in memory and KV, keeping its age', async () => {
		const kv = memoryKv();
		const build = vi.fn(async () => ['a', 'b']);
		const options = { key: 'k', maxAgeMs: 1000, build, kv, now: () => 5 };
		await cached(options);

		expect(await patchCached<string[]>({ key: 'k', kv, update: (value) => value.map((v) => v.toUpperCase()) })).toBe(true);
		expect(await cached(options)).toMatchObject({ value: ['A', 'B'], storedAt: 5, source: 'memory' });
		expect(JSON.parse(kv.data.get('k')!)).toEqual({ storedAt: 5, value: ['A', 'B'] });
		expect(build).toHaveBeenCalledTimes(1);
	});

	it('does nothing when nothing is cached', async () => {
		expect(await patchCached<string>({ key: 'k', update: () => 'x' })).toBe(false);
	});

	it('waits for a refresh that is running, so it does not bring the old value back', async () => {
		let release!: (value: string) => void;
		const running = cached({ key: 'k', maxAgeMs: 1000, build: () => new Promise<string>((r) => (release = r)) });
		await new Promise((r) => setTimeout(r, 0));
		const patch = patchCached<string>({ key: 'k', update: (value) => `${value} patched` });
		release('old');
		await running;
		await patch;
		expect(await cached({ key: 'k', maxAgeMs: 1000, build: async () => 'rebuilt' })).toMatchObject({ value: 'old patched' });
	});
});

/** The part of a Cloudflare KV namespace binding this app uses. */
export interface KvStore {
	get(key: string, type: 'json'): Promise<unknown>;
	put(key: string, value: string): Promise<void>;
}

interface Entry<T> {
	storedAt: number;
	value: T;
}

export interface CachedOptions<T> {
	key: string;
	/** After this age the value is refreshed in the background (stale-while-revalidate). */
	maxAgeMs: number;
	build: () => Promise<T>;
	/** Persistent store shared by all Worker instances. Without it, only memory is used. */
	kv?: KvStore;
	/** Keeps the Worker alive for a background refresh after the response is sent. */
	waitUntil?: (promise: Promise<unknown>) => void;
	now?: () => number;
	/** Rebuild now and wait for it, ignoring cached values and refreshes already running. */
	force?: boolean;
	/** How long a caller waits for a build before giving up. */
	timeoutMs?: number;
}

export interface CachedResult<T> {
	value: T;
	storedAt: number;
	source: 'memory' | 'kv' | 'fresh';
}

export class CacheTimeoutError extends Error {
	constructor(key: string, ms: number) {
		super(`Building ${key} took longer than ${ms} ms`);
		this.name = 'CacheTimeoutError';
	}
}

/**
 * Well below the 30 seconds Cloudflare gives background work (waitUntil) after the
 * response, so a page never waits for a refresh that the runtime will cancel anyway.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, { promise: Promise<Entry<unknown>>; startedAt: number; forced: boolean }>();
/** What was last written to KV per key, so unchanged values aren't written again (free tier: 1,000 writes a day). */
const persisted = new Map<string, string>();
/** Forced builds waiting for the one running, by key: saves in quick succession share one. */
const queued = new Map<string, Promise<Entry<unknown>>>();

/**
 * KV takes one write a second per key; a second one fails with 429. Several saves in a row
 * used to fail that way after the save itself had gone through.
 */
const KV_WRITE_GAP_MS = 1_100;
/** Per key: when KV was last written, the newest value still to write, and the writer running. */
const kvWrites = new Map<string, { at: number; next?: { json: string; body: string }; running?: Promise<void> }>();

/**
 * Writes an entry to KV, at most once per KV_WRITE_GAP_MS and key: values that come quicker
 * are left out except the newest, written once the gap is over. Memory already has the value,
 * so nothing waits for this, and a failed write is only logged; the next refresh tries again.
 */
function persist(kv: KvStore, key: string, entry: Entry<unknown>, waitUntil?: (promise: Promise<unknown>) => void): Promise<void> {
	const json = JSON.stringify(entry.value);
	const state = kvWrites.get(key) ?? { at: 0 };
	kvWrites.set(key, state);
	if (!state.running && persisted.get(key) === json) return Promise.resolve();
	state.next = { json, body: `{"storedAt":${entry.storedAt},"value":${json}}` };
	const running = (state.running ??= (async () => {
		// Starts once `running` is set, and clears it in the same turn the last value is written.
		await null;
		while (state.next) {
			const gap = state.at + KV_WRITE_GAP_MS - Date.now();
			if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
			const { json, body } = state.next;
			state.next = undefined;
			if (persisted.get(key) === json) continue;
			state.at = Date.now();
			try {
				await kv.put(key, body);
				persisted.set(key, json);
			} catch (error) {
				console.error(`Saving ${key} in KV failed:`, error);
			}
		}
		state.running = undefined;
	})());
	if (!waitUntil) return running;
	waitUntil(running);
	return Promise.resolve();
}

/**
 * Waits for a build, but not forever. In Workers, a promise whose I/O belongs to another
 * request never settles once that request is gone (e.g. a background refresh that
 * Cloudflare cancelled). Without a limit every later visitor would wait for it too.
 */
function withTimeout<T>(promise: Promise<T>, key: string, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new CacheTimeoutError(key, ms)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Two cache levels: memory (per Worker instance) and KV (shared, survives restarts).
 * Stale values are returned at once and refreshed in the background, so visitors
 * only wait for Google when there is no cached value at all.
 */
export async function cached<T>(options: CachedOptions<T>): Promise<CachedResult<T>> {
	const { key, maxAgeMs, kv, waitUntil, force = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
	const now = options.now ?? Date.now;

	const refresh = (fresh: boolean): Promise<Entry<T>> => {
		const running = inflight.get(key);
		// A refresh that's been running too long is stuck (see withTimeout); start over.
		const stuck = !running || Date.now() - running.startedAt >= timeoutMs;
		if (!stuck && !fresh) return withTimeout(running.promise as Promise<Entry<T>>, key, timeoutMs);
		if (!stuck && fresh && running.forced) {
			// Saves in quick succession: the running build may have read before this write, so one
			// more after it, shared by every save meanwhile, instead of a full read for each.
			let next = queued.get(key) as Promise<Entry<T>> | undefined;
			if (!next) {
				next = running.promise.then(
					() => undefined,
					() => undefined
				).then(() => {
					queued.delete(key);
					return refresh(true);
				});
				queued.set(key, next);
			}
			return withTimeout(next, key, timeoutMs * 2);
		}
		const promise: Promise<Entry<T>> = (async () => {
			const entry: Entry<T> = { storedAt: now(), value: await options.build() };
			memory.set(key, entry);
			if (kv) await persist(kv, key, entry, waitUntil);
			return entry;
		})().finally(() => {
			if (inflight.get(key)?.promise === promise) inflight.delete(key);
		});
		inflight.set(key, { promise, startedAt: Date.now(), forced: fresh });
		return withTimeout(promise, key, timeoutMs);
	};

	const isFresh = (entry: Entry<T>) => now() - entry.storedAt < maxAgeMs;
	const serve = (entry: Entry<T>, source: CachedResult<T>['source']): CachedResult<T> => {
		if (!isFresh(entry)) {
			const background = refresh(false).catch((error) => console.error(`Refreshing ${key} failed:`, error));
			waitUntil?.(background);
		}
		return { value: entry.value, storedAt: entry.storedAt, source };
	};

	if (!force) {
		const inMemory = memory.get(key) as Entry<T> | undefined;
		if (inMemory) return serve(inMemory, 'memory');

		const stored = (await kv?.get(key, 'json').catch(() => null)) as Entry<T> | null | undefined;
		if (stored && typeof stored.storedAt === 'number') {
			memory.set(key, stored);
			return serve(stored, 'kv');
		}
	}

	// Forced: after a write, a refresh that started before it would bring old data.
	const fresh = await refresh(force);
	return { value: fresh.value, storedAt: fresh.storedAt, source: 'fresh' };
}

/** For tests only. */
export function clearMemoryCache() {
	memory.clear();
	inflight.clear();
	queued.clear();
	persisted.clear();
	kvWrites.clear();
}

/**
 * Changes a cached value in place after a small write (e.g. renamed files), so it shows at
 * once without rebuilding the whole thing. Keeps its age, so the usual refresh still comes.
 * Does nothing when nothing is cached; the next visitor builds it anyway.
 */
export async function patchCached<T>(options: {
	key: string;
	kv?: KvStore;
	waitUntil?: (promise: Promise<unknown>) => void;
	timeoutMs?: number;
	update: (value: T) => T;
}): Promise<boolean> {
	const { key, kv, waitUntil, update, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
	// A refresh that started before the write would bring the old value back: patch after it.
	const running = inflight.get(key);
	if (running) await withTimeout(running.promise, key, timeoutMs).catch(() => {});
	const entry = (memory.get(key) ?? (await kv?.get(key, 'json').catch(() => null))) as Entry<T> | null | undefined;
	if (!entry || typeof entry.storedAt !== 'number') return false;
	const patched: Entry<T> = { storedAt: entry.storedAt, value: update(entry.value) };
	memory.set(key, patched);
	if (kv) await persist(kv, key, patched, waitUntil);
	return true;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyData, type DrillData } from '#lib/practice/drills/progress.ts';
import { DrillStore, FIRST_SYNC_MS, SYNC_AFTER_MS, type DrillBackend } from './drill-store.svelte.ts';

const item = { box: 3, due: 10, seen: 2, right: 2, times: [900] };

/** A backend in memory: what's on this device, what the server answers, and what was sent. */
function backend(local: Partial<DrillData> = {}, { remote = null as DrillData | null | 'never', keeps = true } = {}) {
	const sent: DrillData[] = [];
	const kept: DrillData[] = [];
	let cleared = 0;
	const fake: DrillBackend = {
		load: async () => ({ data: { ...emptyData(), ...local }, saved: keeps }),
		save: async (_account, data) => {
			kept.push(JSON.parse(JSON.stringify(data)));
			return keeps;
		},
		clear: async () => {
			cleared++;
		},
		sync: (data) => {
			sent.push(JSON.parse(JSON.stringify(data)));
			if (remote === 'never') return new Promise(() => {});
			return Promise.resolve(remote && { ...remote, changed: data.changed });
		}
	};
	return { fake, sent, kept, cleared: () => cleared };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DrillStore', () => {
	it('loads the progress, lets it be brought up to date, then is ready', async () => {
		const { fake } = backend({ items: { 'notes:treble:0': item } });
		const store = new DrillStore('a@b.de', false, fake);
		const order: string[] = [];
		await store.begin(
			(drills) => {
				order.push('prepare');
				drills.unlocked = ['notes'];
			},
			() => order.push(`ready ${store.ready}`)
		);
		expect(order).toEqual(['prepare', 'ready true']);
		expect(store.drills.items['notes:treble:0']).toEqual(item);
		expect(store.drills.unlocked).toEqual(['notes']);
		expect(store.synced).toBeNull();
	});

	it('says when this device can’t keep the progress', async () => {
		const store = new DrillStore('a@b.de', false, backend({}, { keeps: false }).fake);
		await store.begin();
		expect(store.saved).toBe(false);
	});

	it('merges what the other devices practised before it is ready', async () => {
		const remote = { ...emptyData(), items: { 'keys:0:major': item } };
		const { fake, kept } = backend({ items: { 'notes:treble:0': item } }, { remote });
		const store = new DrillStore('a@b.de', true, fake);
		await store.begin();
		expect(Object.keys(store.drills.items).sort()).toEqual(['keys:0:major', 'notes:treble:0']);
		expect(store.synced).toBe(true);
		await vi.waitFor(() => expect(kept.length).toBe(1));
	});

	it('starts without the server when it doesn’t answer in time', async () => {
		const { fake } = backend({}, { remote: 'never' });
		const store = new DrillStore('a@b.de', true, fake);
		const begun = store.begin();
		await vi.advanceTimersByTimeAsync(FIRST_SYNC_MS);
		expect(store.ready).toBe(true);
		expect(store.synced).toBe(false);
		void begun;
	});

	it('keeps a change at once, and sends it to the server a moment later', async () => {
		const { fake, sent, kept } = backend({}, { remote: emptyData() });
		const store = new DrillStore('a@b.de', true, fake);
		await store.begin();
		const before = sent.length;
		store.drills.unsent = 12;
		store.persist();
		store.persist();
		await vi.advanceTimersByTimeAsync(0);
		expect(kept.at(-1)?.unsent).toBe(12);
		expect(sent.length).toBe(before);
		await vi.advanceTimersByTimeAsync(SYNC_AFTER_MS);
		expect(sent.length).toBe(before + 1);
		expect(sent.at(-1)?.unsent).toBe(12);
	});

	it('sends nothing for a member not signed in, nor before it is ready', async () => {
		const local = backend();
		const store = new DrillStore('a@b.de', false, local.fake);
		await store.syncNow();
		await store.begin();
		store.persist();
		await vi.advanceTimersByTimeAsync(SYNC_AFTER_MS);
		expect(local.sent).toEqual([]);
	});

	it('sends once more when asked while sending, so the last change goes too', async () => {
		let answer: (data: DrillData) => void = () => {};
		const sent: DrillData[] = [];
		const fake: DrillBackend = {
			...backend().fake,
			sync: (data) => {
				sent.push(data);
				return sent.length === 2 ? new Promise((resolve) => (answer = resolve)) : Promise.resolve(emptyData());
			}
		};
		const store = new DrillStore('a@b.de', true, fake);
		await store.begin();
		const first = store.syncNow();
		void store.syncNow();
		expect(sent.length).toBe(2);
		answer(emptyData());
		await first;
		expect(sent.length).toBe(3);
	});

	it('says the server is behind when it can’t be reached', async () => {
		const { fake } = backend({}, { remote: null });
		const store = new DrillStore('a@b.de', true, fake);
		await store.begin();
		expect(store.synced).toBe(false);
	});

	it('starts again from nothing, dropping the copies from before', async () => {
		const local = backend({ items: { 'notes:treble:0': item } });
		const store = new DrillStore('a@b.de', false, local.fake);
		await store.begin();
		vi.setSystemTime(5000);
		await store.reset();
		expect(local.cleared()).toBe(1);
		expect(store.drills.items).toEqual({});
		expect(store.drills.unlocked).toEqual([]);
		expect(store.drills.since).toBe(5000);
	});
});

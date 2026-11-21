import { clearDrills, loadDrills, saveDrills, syncDrills } from '#lib/practice/drills/store.ts';
import { emptyData, type DrillData } from '#lib/practice/drills/progress.ts';
import { mergeData, withDevice } from '#lib/practice/drills/sync.ts';

/** Where the progress is kept: this device's IndexedDB and the server (see store.ts); apart for the tests. */
export type DrillBackend = {
	load: (account: string) => Promise<{ data: DrillData; saved: boolean }>;
	save: (account: string, data: DrillData) => Promise<boolean>;
	clear: (account: string) => Promise<void>;
	sync: (data: DrillData, closing?: boolean) => Promise<DrillData | null>;
};

const BROWSER: DrillBackend = { load: loadDrills, save: saveDrills, clear: clearDrills, sync: syncDrills };

/** How long the page waits for the progress from the other devices before it starts without. */
export const FIRST_SYNC_MS = 4000;
/** A change goes to the server this long after it, so a round's answers go together. */
export const SYNC_AFTER_MS = 3000;

/**
 * The member's progress in the Übebereich (#300), kept on this device and, for a signed-in
 * member, on their other devices: this copy goes to the server a few seconds after a change,
 * when the page opens, is hidden or comes back online, and what comes back is merged in, so
 * answers given meanwhile stay.
 */
export class DrillStore {
	drills = $state<DrillData>(emptyData());
	/** Loaded, and (where synced) merged with the other devices or given up waiting for them. */
	ready = $state(false);
	/** Whether this device keeps the progress; not in some private windows. */
	saved = $state(true);
	/** Whether the server has this device's latest copy; shown, so a member knows it's safe to switch. */
	synced = $state<boolean | null>(null);
	#account: string;
	#synced: boolean;
	#backend: DrillBackend;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#syncing = false;
	#again = false;

	/** `synced`: whether the progress is kept on the server too, for a signed-in member. */
	constructor(account: string, synced: boolean, backend: DrillBackend = BROWSER) {
		this.#account = account;
		this.#synced = synced;
		this.#backend = backend;
	}

	/**
	 * Loads the progress, has `prepare` bring old progress up to date, and merges in what was
	 * practised on another device, before the page offers a placement test or a first round;
	 * `onReady` then runs once the progress is there.
	 */
	async begin(prepare: (drills: DrillData) => void = () => {}, onReady: () => void = () => {}) {
		const loaded = await this.#backend.load(this.#account);
		this.drills = loaded.data;
		this.saved = loaded.saved;
		prepare(this.drills);
		if (this.#synced) {
			const sentAt = this.drills.changed;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const remote = await Promise.race([
				this.#backend.sync(this.drills),
				new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), FIRST_SYNC_MS)))
			]);
			clearTimeout(timer);
			if (remote) {
				this.drills = withDevice(mergeData(this.drills, remote), this.drills);
				this.synced = this.drills.changed === sentAt;
				this.#save();
			} else this.synced = false;
		}
		this.ready = true;
		onReady();
		if (this.synced === false) await this.syncNow();
	}

	/** A change made: kept on this device now, and sent to the server a moment later. */
	persist() {
		this.drills.changed = Date.now();
		this.#save();
		if (this.#synced) {
			clearTimeout(this.#timer);
			this.#timer = setTimeout(() => this.syncNow(), SYNC_AFTER_MS);
		}
	}

	/** Sends this copy now and merges in what comes back; `closing` while the page is hidden. */
	async syncNow(closing = false): Promise<void> {
		clearTimeout(this.#timer);
		if (!this.#synced || !this.ready) return;
		if (this.#syncing) {
			this.#again = true;
			return;
		}
		this.#syncing = true;
		try {
			const sentAt = this.drills.changed;
			const remote = await this.#backend.sync(this.drills, closing);
			if (!remote) {
				this.synced = false;
				return;
			}
			const merged = withDevice(mergeData(this.drills, remote), this.drills);
			if (JSON.stringify(merged) !== JSON.stringify(this.drills)) {
				this.drills = merged;
				this.#save();
			}
			this.synced = this.drills.changed === sentAt;
		} finally {
			this.#syncing = false;
			if (this.#again) {
				this.#again = false;
				await this.syncNow(closing);
			}
		}
	}

	/** Starts again from nothing; the reset time drops the copies from before it, on the server and the other devices. */
	async reset() {
		await this.#backend.clear(this.#account);
		this.drills = { ...emptyData(), unlocked: [], since: Date.now() };
		this.persist();
	}

	/** The page closes: nothing more sent later. */
	stop() {
		clearTimeout(this.#timer);
	}

	#save() {
		void this.#backend.save(this.#account, this.drills).then((ok) => (this.saved = ok));
	}
}

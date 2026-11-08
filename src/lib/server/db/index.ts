import { seedDemoPractice } from '../demo/practice.ts';
import { appEnv, isDemo } from '../env.ts';
import { today } from '../members.ts';
import { memoryStore } from './memory.ts';
import { sqlStore, type D1 } from './sql.ts';
import type { Store } from './types.ts';

/**
 * Data the app writes itself and nobody edits by hand (#161): push subscriptions, which
 * reminders went out, small values jobs keep between runs. Deployed it lives in D1 (the DB
 * binding, schema in migrations/); without the binding (demo, tests, dev without Wrangler)
 * in memory. Everything people maintain stays in the Google Sheet.
 */

export { reminderKey, type Account, type DataRow, type DataState, type MarkShare, type PageCount, type PageRole, type PushDevice, type ShareAnswer, type SentReminder, type Store, type TourOutcome } from './types.ts';

let memory: Store | undefined;
let d1: { db: D1; store: Store } | undefined;

export function getStore(): Store {
	const db = isDemo() ? undefined : appEnv().DB;
	if (!db) {
		if (!memory) {
			memory = memoryStore();
			// The demo member's practice time, so its overview has something to show.
			if (isDemo()) seedDemoPractice(memory, today()).catch(() => {});
		}
		return memory;
	}
	if (d1?.db !== db) d1 = { db, store: sqlStore(db) };
	return d1.store;
}

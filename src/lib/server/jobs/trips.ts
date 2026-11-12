import { t } from '#lib/i18n/index.ts';
import { listsDue } from '#lib/trips/lists.ts';
import { features } from '../env.ts';
import { today } from '../members.ts';
import { tripStore } from '../trips.ts';
import type { JobResult } from './index.ts';

/**
 * Once a day: a trip's lists (#334, step 2) go four weeks after it ended, with the instruments
 * ticked, the diet and allergies, the documents and consents. The trip, its plan and the
 * sign-ups stay; what people keep for their next trip stays with them.
 */
export async function pruneTripLists(): Promise<JobResult> {
	const store = features().trips ? tripStore() : null;
	if (!store) return { ok: true, summary: t.status.tripListsPruned(0) };
	return { ok: true, summary: t.status.tripListsPruned(await store.purgeLists(listsDue(await store.list(), today()).map((trip) => trip.id))) };
}

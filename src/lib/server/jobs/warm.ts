import { t } from '#lib/i18n/index.ts';
import { getCatalog } from '../catalog.ts';
import { getRepertoire } from '../repertoire.ts';
import { getSchedule } from '../schedule.ts';
import { getArchiveIndex, NotConfiguredError } from '../services.ts';
import type { JobResult } from './index.ts';

/** Builds or refreshes the archive index when it's due; a failure shows as the archive failing. */
async function buildArchiveIndex(): Promise<void> {
	try {
		await getArchiveIndex({ build: true });
	} catch (cause) {
		if (!(cause instanceof NotConfiguredError)) console.error('Building the archive index failed:', cause);
	}
}

/**
 * Fills the caches the pages need: Drive index (in KV), calendar (in KV) and the sheet,
 * including adding new pieces and concerts to it. Every step is cached and deduplicated,
 * so running it often is cheap: a stale value is refreshed, a fresh one left alone.
 */
export async function warmCaches(): Promise<JobResult & { sources: { archive: boolean; calendar: boolean; sheet: boolean } }> {
	// Only this job builds the archive index; pages just read it (see getArchiveIndex).
	const index = buildArchiveIndex();
	const [catalog, schedule, sheet] = await Promise.all([index.then(() => getCatalog()), getSchedule(), getRepertoire()]);
	const sources = { archive: catalog.ok, calendar: schedule.ok, sheet: sheet.ok };
	const failed = (Object.keys(sources) as (keyof typeof sources)[]).filter((key) => !sources[key]).map((key) => t.status.warmSources[key]);
	return { ok: !failed.length, summary: failed.length ? t.status.warmFailed(failed.join(', ')) : t.status.warmDone, sources };
}

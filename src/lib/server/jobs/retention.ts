import { entryDay, planRetention, retentionCutoff } from '#lib/access/retention.ts';
import { t } from '#lib/i18n/index.ts';
import { readSettings } from '#lib/settings.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { config } from '#lib/config/index.ts';
import { today } from '../members.ts';
import { getStore } from '../db/index.ts';
import { daysBefore, KEEP_DAYS } from '#lib/page-counts.ts';
import { getSchedule } from '../schedule.ts';
import { readTab, refreshAfterWrite, SheetLayoutError, updateRecords } from '../sheet-writes.ts';
import type { JobResult } from './index.ts';

/**
 * Retention (#158), once a day: sign-ups and attendance from before the seasons set on
 * /einstellungen lose the person's name (see #lib/access/retention.ts). Off unless set.
 */
export async function applyRetention(): Promise<JobResult> {
	// The page counts (#185) hold nothing personal, but needn't grow forever either.
	await getStore()
		.prunePageCounts(daysBefore(today(), KEEP_DAYS))
		.catch((error) => console.error('Pruning the page counts failed:', error));
	const settings = await readTab('settings').catch((cause) => (cause instanceof SheetLayoutError ? undefined : Promise.reject(cause)));
	const seasons = settings ? readSettings(settings.rows).retention : undefined;
	if (!seasons) return { ok: true, summary: t.status.retentionOff };

	const cutoff = retentionCutoff(today(), seasons);
	const schedule = await getSchedule();
	const days = new Map(schedule.ok ? schedule.events.map((event) => [event.id, eventDay(event, config.timeZone)]) : []);
	const newId = () => crypto.randomUUID().slice(0, 8);
	const anonymous = t.retention.anonymous;

	let changed = 0;
	for (const key of ['signups', 'attendance'] as const) {
		const table = await readTab(key).catch((cause) => (cause instanceof SheetLayoutError ? undefined : Promise.reject(cause)));
		if (!table) continue;
		const plan = planRetention(
			table.rows,
			(values: Record<string, string>) => entryDay(days.get(values.eventId), values.answeredAt, values.event),
			cutoff,
			{ anonymous, newId, clear: key === 'signups' ? ['comment'] : [] }
		);
		await updateRecords(key, table as never, plan as never);
		changed += plan.length;
	}
	if (changed) await refreshAfterWrite();
	return { ok: true, summary: t.status.retentionDone(changed, cutoff) };
}

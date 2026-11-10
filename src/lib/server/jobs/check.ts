import { t } from '#lib/i18n/index.ts';
import { authConfig } from '../auth/index.ts';
import { getStore } from '../db/index.ts';
import { GoogleApiError } from '../google/client.ts';
import { listEvents } from '../google/calendar.ts';
import { getSpreadsheetInfo } from '../google/sheets.ts';
import { getAccessList } from '../repertoire.ts';
import { peopleWithRight } from '#lib/reminders/reminders.ts';
import { getGoogle, NotConfiguredError, requireSetting } from '../services.ts';
import { channels, channelsSetUp, deliver } from './deliver.ts';
import type { JobResult } from './index.ts';

/**
 * The daily connection check (#159): one cheap request each to Drive, Calendar and the sheet,
 * as /status makes them. When the outcome changes, the admins get one notification: what
 * broke, or that everything works again. A setting that was never made isn't a failure.
 */

type Part = 'drive' | 'calendar' | 'sheet';
const STATE_KEY = 'connection-check';
const label = (part: Part) => t.status.warmSources[part === 'drive' ? 'archive' : part];

function reason(error: unknown): string | null {
	if (error instanceof NotConfiguredError) return null;
	if (error instanceof GoogleApiError) return `${error.status}`;
	return error instanceof Error ? error.message : String(error);
}

/** What failed, by part, with a short reason. */
export async function connectionProblems(): Promise<Partial<Record<Part, string>>> {
	let client;
	try {
		client = getGoogle().client;
	} catch (error) {
		const why = reason(error);
		return why ? { drive: why, calendar: why, sheet: why } : {};
	}
	const probes: Record<Part, () => Promise<unknown>> = {
		drive: () =>
			client.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(requireSetting('DRIVE_ARCHIVE_FOLDER_ID'))}`, {
				params: { fields: 'id', supportsAllDrives: 'true' }
			}),
		calendar: () => listEvents(client, requireSetting('CALENDAR_ID'), { from: new Date(), to: new Date(Date.now() + 86_400_000) }),
		sheet: () => getSpreadsheetInfo(client, requireSetting('REPERTOIRE_SHEET_ID'))
	};
	const problems: Partial<Record<Part, string>> = {};
	await Promise.all(
		(Object.keys(probes) as Part[]).map(async (part) => {
			try {
				await probes[part]();
			} catch (error) {
				const why = reason(error);
				if (why) problems[part] = why;
			}
		})
	);
	return problems;
}

export async function checkConnections(): Promise<JobResult> {
	const problems = await connectionProblems();
	const parts = (Object.keys(problems) as Part[]).sort();
	const names = parts.map(label).join(', ');
	const state = parts.join(',');
	const store = getStore();
	const before = await store.getState(STATE_KEY);
	// The first run counts as "all fine before": a working fresh deploy isn't news, a broken one is.
	const changed = (before ?? '') !== state;
	let told = '';
	const ways = changed ? await channels() : null;
	if (ways && channelsSetUp(ways)) {
		const auth = authConfig();
		const admins = peopleWithRight(await getAccessList().catch(() => null), auth.mode === 'on' ? auth.bootstrapAdmins : [], 'mitglieder.verwalten');
		const notice = parts.length
			? { title: t.reminders.checkFailedTitle, body: t.reminders.checkFailedBody(parts.map((part) => `${label(part)} (${problems[part]})`).join(', ')), url: '/einstellungen/status', tag: 'connection-check' }
			: { title: t.reminders.checkOkTitle, body: t.reminders.checkOkBody, url: '/einstellungen/status', tag: 'connection-check' };
		// By push, else by email (#123): a broken sheet doesn't stop the mail, which needs only Google's sign-in.
		const reached = (await Promise.all(admins.map((admin) => deliver(admin, notice, ways)))).filter(Boolean);
		told = ` ${t.reminders.adminsTold(reached.length)}`;
	}
	await store.setState(STATE_KEY, state);
	return { ok: !parts.length, summary: (parts.length ? t.reminders.checkFailed(names) : t.reminders.checkOk) + told };
}

import { t } from '#lib/i18n/index.ts';
import { peopleWithRight } from '#lib/reminders/reminders.ts';
import { authConfig } from '../auth/index.ts';
import { getStore } from '../db/index.ts';
import { getAccessList } from '../repertoire.ts';
import { channels, channelsSetUp, deliver } from './deliver.ts';
import type { JobResult } from './index.ts';

/** Kinds not seen for this long are forgotten. */
export const KEEP_ERRORS_DAYS = 30;

/**
 * New kinds of errors (#191), every hour: the admins get one notice about the kinds they
 * haven't heard of, so they know before members report it. A kind that comes back counts
 * up on /status without another notice.
 */
export async function announceErrors(): Promise<JobResult> {
	const store = getStore();
	await store.pruneErrors(KEEP_ERRORS_DAYS);
	const fresh = (await store.errorLog(KEEP_ERRORS_DAYS)).filter((group) => !group.notified);
	if (!fresh.length) return { ok: true, summary: t.reminders.errorsNone };

	let told = '';
	const ways = await channels();
	if (channelsSetUp(ways)) {
		const auth = authConfig();
		const admins = peopleWithRight(await getAccessList().catch(() => null), auth.mode === 'on' ? auth.bootstrapAdmins : [], 'mitglieder.verwalten');
		const first = fresh[0];
		const notice = { title: t.reminders.errorsTitle(fresh.length), body: t.reminders.errorsBody(first.place, first.message, fresh.length - 1), url: '/einstellungen/status#fehler', tag: 'error-log' };
		const reached = (await Promise.all(admins.map((admin) => deliver(admin, notice, ways)))).filter(Boolean);
		told = ` ${t.reminders.adminsTold(reached.length)}`;
	}
	// Told or not: /status shows them either way, and a later notice about old kinds would only be noise.
	await store.markErrorsNotified(fresh.map((group) => group.fingerprint));
	return { ok: true, summary: t.reminders.errorsNew(fresh.length) + told };
}

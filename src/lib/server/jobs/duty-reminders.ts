import type { AccessList } from '#lib/access/access.ts';
import { jobTime, placesOf, remindNow, sortSlots } from '#lib/duties/duties.ts';
import * as t from '#lib/i18n/texts.ts';
import type { Reminder } from '#lib/reminders/reminders.ts';
import { dutyStore, helpers } from '../duties.ts';
import type { Notice } from '../push/index.ts';

/**
 * Reminders for Dienste (#298), sent by the reminders job with the others: once to each person
 * on a job, the day before and on the day; and when an organiser asked for it, once to every
 * member without a job on that date while places are free. Parents aren't nudged unprompted.
 */

/** A nudge counts for three days; after that the organiser asks again. */
const NUDGE_DAYS = 3;

export async function dutyReminders(today: string, access: AccessList | null, now: number): Promise<(Reminder<unknown> & { notice: Notice })[]> {
	const store = await dutyStore();
	if (!store) return [];
	const [slots, takes, nudges] = await Promise.all([store.slots(), store.takes(), store.nudges()]);
	const pending: (Reminder<unknown> & { notice: Notice })[] = [];

	for (const slot of slots.filter((one) => remindNow(one, today))) {
		const url = `/kalender/${encodeURIComponent(slot.eventId)}/dienste`;
		for (const take of placesOf(slot, takes).on) {
			pending.push({
				kind: 'duty',
				subject: slot.id,
				recipient: take.email,
				about: slot,
				notice: {
					title: t.duties.remindTitle(slot.task, slot.eventDay === today),
					body: t.duties.remindBody(slot.eventTitle, jobTime(slot, t.duties.startsAt), slot.note ?? ''),
					url,
					tag: `duty-${slot.id}`
				}
			});
		}
	}

	for (const nudge of nudges) {
		if (now - Date.parse(nudge.requestedAt) > NUDGE_DAYS * 86_400_000) continue;
		const mine = sortSlots(slots.filter((slot) => slot.eventId === nudge.eventId && slot.eventDay >= today));
		const open = mine.filter((slot) => placesOf(slot, takes).free > 0);
		if (!open.length) continue;
		const busy = new Set(takes.filter((take) => take.eventId === nudge.eventId).map((take) => take.email));
		const free = open.reduce((sum, slot) => sum + placesOf(slot, takes).free, 0);
		const notice: Notice = {
			title: t.duties.nudgeTitle(open[0].eventTitle),
			body: t.duties.nudgeBody(free, open.map((slot) => slot.task).join(', ')),
			url: `/kalender/${encodeURIComponent(nudge.eventId)}/dienste`,
			tag: `duty-nudge-${nudge.eventId}`
		};
		for (const person of helpers(access).filter((one) => !busy.has(one.email))) {
			pending.push({ kind: 'duty-nudge', subject: `${nudge.eventId}@${nudge.requestedAt}`, recipient: person.email, about: nudge, notice });
		}
	}
	return pending;
}

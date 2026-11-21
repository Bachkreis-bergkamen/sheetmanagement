import { fail } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { dutyCounts, eventPlaces, type DutySlot } from '#lib/duties/duties.ts';
import { formatDay } from '#lib/events/format.ts';
import * as t from '#lib/i18n/texts.ts';
import { readPeriod } from '#lib/repertoire/season.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { DUTY_RIGHT, dutyStore, helpers } from '#lib/server/duties.ts';
import { requireFeature } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { today } from '#lib/server/members.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * The Dienste across dates (#298), for those who organise them: where people are still
 * missing, concerts without any yet, who took how many in a period, and the templates.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireFeature('duties');
	requireRight(locals, DUTY_RIGHT);
	const store = await dutyStore();
	if (!store) return { state: 'not-set-up' as const };
	const day = today();
	const [slots, takes, templates, library, list] = await Promise.all([store.slots(), store.takes(), store.templates(), getLibrary(), getAccessList().catch(() => null)]);
	const byEvent = new Map<string, DutySlot[]>();
	for (const slot of slots) byEvent.set(slot.eventId, [...(byEvent.get(slot.eventId) ?? []), slot]);
	const href = (id: string) => `/kalender/${encodeURIComponent(id)}/dienste`;
	// Up to the last date with jobs: what someone took for an upcoming concert counts already.
	const last = slots.reduce((latest, slot) => (slot.eventDay > latest ? slot.eventDay : latest), day);
	const period = readPeriod(url.searchParams.get('von'), url.searchParams.get('bis') ?? last, day);
	const counts = dutyCounts(slots, takes, period);
	const counted = new Set(counts.map((person) => person.email));
	return {
		state: 'ready' as const,
		upcoming: [...byEvent.values()]
			.filter((mine) => mine[0].eventDay >= day)
			.sort((a, b) => a[0].eventDay.localeCompare(b[0].eventDay))
			.map((mine) => ({ id: mine[0].eventId, title: mine[0].eventTitle, dateText: formatDay(mine[0].eventDay, config.locale), places: eventPlaces(mine, takes), href: href(mine[0].eventId) })),
		withoutDuties: library.schedule.ok
			? library.schedule.events
					.filter((event) => event.type === 'konzert' && !event.past && !byEvent.has(event.id))
					.map((event) => ({ id: event.id, title: event.displayTitle, dateText: event.date.long, href: href(event.id) }))
			: [],
		period,
		counts: counts.map(({ email, name, count, tasks }) => ({ email, name, count, tasks: [...new Set(tasks)].join(', ') })),
		// Everyone who could help and took nothing in the period: the first to ask next time.
		none: helpers(list)
			.filter((person) => !counted.has(person.email))
			.map((person) => person.name),
		templates: templates.map((template) => ({ id: template.id, name: template.name, jobs: template.jobs.map((job) => `${job.task} (${job.needed})`).join(', '), count: template.jobs.length }))
	};
};

export const actions: Actions = {
	removeTemplate: async ({ locals, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const store = await dutyStore();
		if (!store) return fail(503, { message: t.duties.notSetUp });
		try {
			await store.removeTemplate(String((await request.formData()).get('template') ?? ''));
		} catch (cause) {
			console.error('Deleting a duty template failed:', cause);
			return fail(503, { message: t.duties.failed });
		}
		return { saved: t.duties.templateRemoved };
	}
};

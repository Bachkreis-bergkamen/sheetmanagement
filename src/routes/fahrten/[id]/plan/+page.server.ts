import { error, fail } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { runInBackground } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { today } from '#lib/server/members.ts';
import { notify } from '#lib/server/push/index.ts';
import { openTrip, planEventOf } from '#lib/server/trips.ts';
import { newTripId } from '#lib/server/trips-store.ts';
import { formatWeekday, isRunning, nowAndNext, planByDay, planItemFromForm, signedUp, PLAN_KINDS, type Participant, type Trip } from '#lib/trips/trips.ts';
import type { Actions, PageServerLoad } from './$types';

/** The plan over several days (#334): today on the phone during the trip, all days, and print. */

/** The time now in the orchestra's time zone, "14:05". */
const timeNow = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: config.timeZone }).format(new Date());

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { store, trip, organises, inside } = await openTrip(locals, params.id);
	// The plan is for those coming along, their parents and the organisers.
	if (!inside) error(404, t.trips.noAccess);
	const [items, library] = await Promise.all([store.plan(trip.id), getLibrary().catch(() => null)]);
	const schedule = library?.schedule.ok ? library.schedule : null;
	const events = trip.eventIds.flatMap((id) => {
		const event = schedule?.byId.get(id);
		return event ? [planEventOf(event)] : [];
	});
	const days = planByDay(trip, items, events);
	const day = today();
	const running = isRunning(trip, day);
	const view = url.searchParams.get('ansicht') === 'alle' || !running ? ('all' as const) : ('today' as const);
	const time = timeNow();
	return {
		trip: { id: trip.id, title: trip.title, firstDay: trip.firstDay, lastDay: trip.lastDay },
		days,
		running,
		view,
		today: day,
		time,
		current: running ? nowAndNext(days.find((entry) => entry.day === day), time) : null,
		organises,
		kinds: PLAN_KINDS
	};
};

/** Tells everyone signed up that the plan changed ("Probe beginnt 30 min später"). */
function announce(trip: Trip, participants: Participant[], body: string) {
	runInBackground(notify(signedUp(participants).map((p) => p.email), { title: t.trips.days.changed(trip.title), body, url: `/fahrten/${trip.id}/plan`, tag: `fahrt-plan-${trip.id}` }));
}

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const { store, trip, participants, organises } = await openTrip(locals, params.id);
		if (!organises) error(403, t.messages.noRight);
		const form = await request.formData();
		const parsed = planItemFromForm(form, trip);
		if ('problem' in parsed) return fail(400, { error: t.trips.days.problems[parsed.problem], id: String(form.get('id') ?? '') });
		const known = String(form.get('id') ?? '');
		const existing = known ? (await store.plan(trip.id)).find((item) => item.id === known) : undefined;
		await store.savePlanItem({ ...parsed.item, id: existing?.id ?? newTripId(), tripId: trip.id });
		if (form.get('notify') === 'on') {
			const when = `${formatWeekday(parsed.item.day, config.locale)}${parsed.item.start ? `, ${parsed.item.start}` : ''}`;
			announce(trip, participants, t.trips.days.changedBody(when, parsed.item.title));
		}
		return { saved: true };
	},

	remove: async ({ locals, params, request }) => {
		const { store, trip, participants, organises } = await openTrip(locals, params.id);
		if (!organises) error(403, t.messages.noRight);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const item = (await store.plan(trip.id)).find((entry) => entry.id === id);
		if (!item) return { saved: true };
		await store.removePlanItem(trip.id, id);
		if (form.get('notify') === 'on') announce(trip, participants, t.trips.days.removedBody(formatWeekday(item.day, config.locale), item.title));
		return { saved: true };
	}
};

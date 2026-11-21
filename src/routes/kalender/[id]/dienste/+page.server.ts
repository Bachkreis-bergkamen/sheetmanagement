import { error, fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { eventPlaces, jobFromForm, jobsOf, jobTime, placesOf, rideFromForm, sortSlots } from '#lib/duties/duties.ts';
import { dateFormat } from '#lib/events/format.ts';
import { formatDay } from '#lib/events/format.ts';
import * as t from '#lib/i18n/texts.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { DUTY_RIGHT, dutyPerson, dutyStore, helpers } from '#lib/server/duties.ts';
import { requireFeature } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { today } from '#lib/server/members.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * The Dienste of one date (#298): what it needs, who took which place, taking, leaving and
 * handing on one for members and parents (#299), and for organisers setting the jobs up,
 * putting people down, templates and a reminder to those without a job. Below, the date's
 * Fahrgemeinschaften (#196): lifts offered and asked for.
 */

const nudgeDate = dateFormat(config.locale, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: config.timeZone });

/** The store and the date: from the calendar, or as the jobs remember it once it left the calendar. */
async function dateOf(id: string) {
	const store = await dutyStore();
	if (!store) error(404, t.duties.notSetUp);
	const library = await getLibrary();
	const event = library.schedule.ok ? library.schedule.byId.get(id) : undefined;
	if (event) {
		const day = eventDay(event, config.timeZone);
		return { store, event: { id: event.id, title: event.displayTitle, day, dateText: event.date.long, past: event.past, inCalendar: true } };
	}
	const slots = await store.slotsOf(id);
	if (!slots.length) error(library.schedule.ok ? 404 : 503, library.schedule.ok ? t.messages.noEvent : t.messages.calendarUnavailable);
	const { eventDay: day, eventTitle: title } = slots[0];
	return { store, event: { id, title, day, dateText: formatDay(day, config.locale), past: day < today(), inCalendar: false } };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	requireFeature('duties');
	const { store, event } = await dateOf(params.id);
	const list = await getAccessList().catch(() => null);
	const me = await dutyPerson(locals, list);
	const manage = locals.access.rights.has(DUTY_RIGHT);
	const [slots, takes, templates, rides, nudges] = await Promise.all([
		store.slotsOf(event.id),
		store.takesOf(event.id),
		manage ? store.templates() : [],
		store.ridesOf(event.id),
		manage ? store.nudges() : []
	]);
	// The calendar is the truth for the title and day; the jobs keep a copy for when it's gone.
	if (event.inCalendar && [...slots, ...rides].some((one) => one.eventTitle !== event.title || one.eventDay !== event.day)) {
		await store.renameEvent(event.id, event.day, event.title).catch((cause) => console.error('Renaming the Dienste of a date failed:', cause));
	}
	const busy = new Set(takes.map((take) => take.email));
	const nudged = nudges.find((one) => one.eventId === event.id);
	return {
		event: { id: event.id, title: event.title, dateText: event.dateText, past: event.past },
		// A parent account (#299) can't open the date's page; back to their area.
		back: locals.access.parent?.only ? '/eltern' : `/kalender/${encodeURIComponent(event.id)}`,
		slots: sortSlots(slots).map((slot) => {
			const { on, free } = placesOf(slot, takes);
			return {
				id: slot.id,
				task: slot.task,
				from: slot.from ?? '',
				to: slot.to ?? '',
				time: jobTime(slot, t.duties.startsAt),
				needed: slot.needed,
				note: slot.note ?? '',
				free,
				on: on.map((take) => ({ email: take.email, name: take.name, me: take.email === me?.email, offered: !!take.offered })),
				mine: !!me && on.some((take) => take.email === me.email)
			};
		}),
		places: eventPlaces(slots, takes),
		canTake: !!me && !event.past,
		manage,
		people: manage ? helpers(list, { parents: true }) : [],
		templates: templates.map((template) => ({ id: template.id, name: template.name, count: template.jobs.length })),
		// Members without a job here, for the reminder; parents aren't asked unprompted.
		nudge:
			manage && slots.length && !event.past && eventPlaces(slots, takes).free
				? { waiting: helpers(list).filter((person) => !busy.has(person.email)).length, last: nudged ? nudgeDate.format(new Date(nudged.requestedAt)) : undefined }
				: null,
		me: me?.email ?? '',
		rides: rides.map((ride) => ({ id: ride.id, kind: ride.kind, name: ride.name, from: ride.from, seats: ride.seats, note: ride.note ?? '', mine: ride.email === me?.email }))
	};
};

/** The store, the date and the job named in the form, or why not. */
async function jobIn(id: string, data: FormData) {
	const { store, event } = await dateOf(id);
	const slot = await store.slot(String(data.get('slot') ?? ''));
	return { store, event, slot: slot?.eventId === event.id ? slot : null };
}

const failed = (what: string, cause: unknown) => {
	console.error(`${what} failed:`, cause);
	return fail(503, { message: t.duties.failed });
};

export const actions: Actions = {
	take: async ({ locals, params, request }) => {
		requireFeature('duties');
		const me = await dutyPerson(locals);
		if (!me) error(403, t.messages.noRight);
		const { store, event, slot } = await jobIn(params.id, await request.formData());
		if (event.past) return fail(409, { message: t.duties.past });
		if (!slot) return fail(404, { message: t.duties.gone });
		try {
			const result = await store.take(slot.id, me);
			if (result !== 'taken') return fail(409, { message: t.duties.problems[result] });
		} catch (cause) {
			return failed('Taking a duty', cause);
		}
		return { saved: t.duties.taken };
	},

	leave: async ({ locals, params, request }) => {
		requireFeature('duties');
		const me = await dutyPerson(locals);
		if (!me) error(403, t.messages.noRight);
		const { store, event, slot } = await jobIn(params.id, await request.formData());
		if (event.past) return fail(409, { message: t.duties.past });
		if (!slot) return fail(404, { message: t.duties.gone });
		try {
			await store.leave(slot.id, me.email);
		} catch (cause) {
			return failed('Leaving a duty', cause);
		}
		return { saved: t.duties.left };
	},

	offer: async ({ locals, params, request }) => {
		requireFeature('duties');
		const me = await dutyPerson(locals);
		if (!me) error(403, t.messages.noRight);
		const data = await request.formData();
		const { store, event, slot } = await jobIn(params.id, data);
		if (event.past) return fail(409, { message: t.duties.past });
		if (!slot) return fail(404, { message: t.duties.gone });
		const offered = data.get('offered') === '1';
		try {
			if (!(await store.offer(slot.id, me.email, offered))) return fail(409, { message: t.duties.gone });
		} catch (cause) {
			return failed('Handing a duty on', cause);
		}
		return { saved: offered ? t.duties.offeredDone : t.duties.unoffered };
	},

	takeOver: async ({ locals, params, request }) => {
		requireFeature('duties');
		const me = await dutyPerson(locals);
		if (!me) error(403, t.messages.noRight);
		const data = await request.formData();
		const { store, event, slot } = await jobIn(params.id, data);
		if (event.past) return fail(409, { message: t.duties.past });
		if (!slot) return fail(404, { message: t.duties.gone });
		const from = normalizeEmail(String(data.get('from') ?? ''));
		try {
			const before = (await store.takesOf(slot.eventId)).find((take) => take.slotId === slot.id && take.email === from);
			const result = await store.takeOver(slot.id, from, me);
			if (result !== 'taken') return fail(409, { message: t.duties.problems[result === 'gone' ? 'not-offered' : result] });
			return { saved: t.duties.tookOver(before?.name ?? from) };
		} catch (cause) {
			return failed('Taking over a duty', cause);
		}
	},

	nudge: async ({ locals, params }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const { store, event } = await dateOf(params.id);
		if (event.past) return fail(409, { message: t.duties.past });
		try {
			await store.nudge(event.id, normalizeEmail(locals.access.user?.email ?? ''));
		} catch (cause) {
			return failed('Asking for a duty reminder', cause);
		}
		return { saved: t.duties.nudged };
	},

	addRide: async ({ locals, params, request }) => {
		requireFeature('duties');
		const me = await dutyPerson(locals);
		if (!me) error(403, t.messages.noRight);
		const { store, event } = await dateOf(params.id);
		if (event.past) return fail(409, { message: t.duties.past });
		const checked = rideFromForm(await request.formData());
		if ('problem' in checked) return fail(400, { message: t.duties.problems[checked.problem], ride: true });
		try {
			await store.addRide({ ...checked.values, ...me, eventId: event.id, eventDay: event.day, eventTitle: event.title });
		} catch (cause) {
			return failed('Adding a ride', cause);
		}
		return { saved: t.duties.rideAdded };
	},

	removeRide: async ({ locals, params, request }) => {
		requireFeature('duties');
		const me = await dutyPerson(locals);
		if (!me) error(403, t.messages.noRight);
		const { store } = await dateOf(params.id);
		try {
			if (!(await store.removeRide(String((await request.formData()).get('ride') ?? ''), me.email))) return fail(404, { message: t.duties.gone });
		} catch (cause) {
			return failed('Deleting a ride', cause);
		}
		return { saved: t.duties.rideRemoved };
	},

	assign: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const data = await request.formData();
		const { store, slot } = await jobIn(params.id, data);
		if (!slot) return fail(404, { message: t.duties.gone });
		const email = normalizeEmail(String(data.get('email') ?? ''));
		const person = helpers(await getAccessList().catch(() => null), { parents: true }).find((one) => one.email === email);
		if (!person) return fail(400, { message: t.duties.problems['who-missing'] });
		try {
			const by = normalizeEmail(locals.access.user?.email ?? '');
			const result = await store.take(slot.id, { ...person, ...(by && by !== person.email ? { by } : {}) });
			if (result !== 'taken') return fail(409, { message: t.duties.problems[result] });
		} catch (cause) {
			return failed('Putting someone on a duty', cause);
		}
		return { saved: t.duties.assigned(person.name) };
	},

	unassign: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const data = await request.formData();
		const { store, slot } = await jobIn(params.id, data);
		if (!slot) return fail(404, { message: t.duties.gone });
		const email = normalizeEmail(String(data.get('email') ?? ''));
		const on = (await store.takesOf(slot.eventId)).find((take) => take.slotId === slot.id && take.email === email);
		try {
			await store.leave(slot.id, email);
		} catch (cause) {
			return failed('Taking someone off a duty', cause);
		}
		return { saved: t.duties.unassigned(on?.name ?? email) };
	},

	add: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const { store, event } = await dateOf(params.id);
		const data = await request.formData();
		const checked = jobFromForm(data);
		if ('problem' in checked) return fail(400, { message: t.duties.problems[checked.problem], values: Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)])) });
		try {
			await store.addSlot({ ...checked.values, eventId: event.id, eventDay: event.day, eventTitle: event.title });
		} catch (cause) {
			return failed('Adding a duty', cause);
		}
		return { saved: t.duties.added };
	},

	update: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const data = await request.formData();
		const { store, slot } = await jobIn(params.id, data);
		if (!slot) return fail(404, { message: t.duties.gone });
		const checked = jobFromForm(data);
		if ('problem' in checked) return fail(400, { message: t.duties.problems[checked.problem], slot: slot.id });
		try {
			const { on } = placesOf(slot, await store.takesOf(slot.eventId));
			// Fewer places than people on it: someone has to be taken off first, by name.
			if (checked.values.needed < on.length) return fail(409, { message: t.duties.tooFew(on.length), slot: slot.id });
			await store.updateSlot(slot.id, checked.values);
		} catch (cause) {
			return failed('Changing a duty', cause);
		}
		return { saved: t.duties.saved };
	},

	remove: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const { store, slot } = await jobIn(params.id, await request.formData());
		if (!slot) return fail(404, { message: t.duties.gone });
		try {
			await store.removeSlot(slot.id);
		} catch (cause) {
			return failed('Deleting a duty', cause);
		}
		return { saved: t.duties.removed };
	},

	useTemplate: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const { store, event } = await dateOf(params.id);
		const id = String((await request.formData()).get('template') ?? '');
		try {
			const template = (await store.templates()).find((one) => one.id === id);
			if (!template) return fail(404, { message: t.duties.problems['no-template'] });
			// In the template's order, one after the other, so they keep it on the page.
			const start = Date.now();
			for (const [i, job] of template.jobs.entries()) {
				await store.addSlot({ ...job, eventId: event.id, eventDay: event.day, eventTitle: event.title }, new Date(start + i).toISOString());
			}
			return { saved: t.duties.used(template.jobs.length) };
		} catch (cause) {
			return failed('Using a duty template', cause);
		}
	},

	saveTemplate: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const { store, event } = await dateOf(params.id);
		const name = String((await request.formData()).get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
		if (!name) return fail(400, { message: t.duties.problems['template-name'] });
		try {
			const slots = await store.slotsOf(event.id);
			if (!slots.length) return fail(400, { message: t.duties.problems['no-jobs'] });
			await store.saveTemplate(name, jobsOf(slots));
		} catch (cause) {
			return failed('Saving a duty template', cause);
		}
		return { saved: t.duties.templateSaved(name) };
	}
};

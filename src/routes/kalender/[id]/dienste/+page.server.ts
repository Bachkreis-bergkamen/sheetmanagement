import { error, fail } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { eventPlaces, jobFromForm, jobsOf, jobTime, placesOf, sortSlots } from '#lib/duties/duties.ts';
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
 * The Dienste of one date (#298): what it needs, who took which place, taking and leaving one
 * for members, and for organisers setting the jobs up, putting people down and templates.
 */

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
	const [slots, takes, templates] = await Promise.all([store.slotsOf(event.id), store.takesOf(event.id), manage ? store.templates() : []]);
	// The calendar is the truth for the title and day; the jobs keep a copy for when it's gone.
	if (event.inCalendar && slots.some((slot) => slot.eventTitle !== event.title || slot.eventDay !== event.day)) {
		await store.renameEvent(event.id, event.day, event.title).catch((cause) => console.error('Renaming the Dienste of a date failed:', cause));
	}
	return {
		event: { id: event.id, title: event.title, dateText: event.dateText, past: event.past },
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
				on: on.map((take) => ({ email: take.email, name: take.name, me: take.email === me?.email })),
				mine: !!me && on.some((take) => take.email === me.email)
			};
		}),
		places: eventPlaces(slots, takes),
		canTake: !!me && !event.past,
		manage,
		people: manage ? helpers(list) : [],
		templates: templates.map((template) => ({ id: template.id, name: template.name, count: template.jobs.length }))
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

	assign: async ({ locals, params, request }) => {
		requireFeature('duties');
		requireRight(locals, DUTY_RIGHT);
		const data = await request.formData();
		const { store, slot } = await jobIn(params.id, data);
		if (!slot) return fail(404, { message: t.duties.gone });
		const email = normalizeEmail(String(data.get('email') ?? ''));
		const person = helpers(await getAccessList().catch(() => null)).find((one) => one.email === email);
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

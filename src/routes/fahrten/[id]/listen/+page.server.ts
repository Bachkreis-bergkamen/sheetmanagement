import { error, fail, redirect } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { today } from '#lib/server/members.ts';
import { listPerson, type ListPerson, type OpenedTrip } from '#lib/server/trip-lists.ts';
import { openTrip } from '#lib/server/trips.ts';
import { newTripId } from '#lib/server/trips-store.ts';
import { instrumentFromForm, isKeepable, KEPT_BY_DEFAULT, LIST_KINDS, LIST_READERS, listFromForm, listsFor, listsGoneOn, INSTRUMENTS_MAX, type ListKind } from '#lib/trips/lists.ts';
import { isActive } from '#lib/trips/trips.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Your lists for a trip (#334, step 2), or as a parent your child's: filled in once, then
 * filled in again from the last trip and only confirmed. Each list says who sees it.
 */

/** Whose lists: yours, or with ?fuer=1 your first child coming along. */
function whose(opened: OpenedTrip, fuer: string | null): ListPerson {
	const person = listPerson(opened, fuer);
	if (!person) redirect(303, `/fahrten/${opened.trip.id}`);
	return person;
}

/** The lists can be changed until the trip is over; afterwards they're kept unchanged until they go. */
const editable = (opened: OpenedTrip) => today() <= opened.trip.lastDay;

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const opened = await openTrip(locals, params.id);
	const { store, trip, viewer, participants, list } = opened;
	const fuer = url.searchParams.get('fuer');
	const person = whose(opened, fuer);
	const [entries, kept, instruments] = await Promise.all([store.lists(trip.id), store.kept(person.email), store.instruments([person.email])]);
	const own = entries.filter((entry) => entry.email === person.email);
	const nameOf = (email: string) => (email === person.email ? person.name : email === viewer.email ? viewer.name : (list?.membersByEmail.get(email)?.name ?? ''));

	// The people whose lists the viewer fills in: themself and the children coming along.
	const people = [
		...(participants.some((p) => p.email === viewer.email && isActive(p)) ? [{ name: viewer.name, fuer: null as string | null }] : []),
		...viewer.children.flatMap((email) => participants.filter((p) => p.email === email && isActive(p))).map((p, i) => ({ name: p.name, fuer: String(i + 1) }))
	];

	return {
		trip: { id: trip.id, title: trip.title, firstDay: trip.firstDay, lastDay: trip.lastDay, kind: trip.kind },
		person: { name: person.name, minor: person.minor, byParent: person.byParent, roles: person.participant.roles },
		fuer,
		people,
		editable: editable(opened),
		goneOn: listsGoneOn(trip),
		questions: trip.questions,
		instruments,
		lists: listsFor(trip, person.participant.roles).map((kind) => {
			const entry = own.find((one) => one.kind === kind);
			const keptOne = isKeepable(kind) ? kept.find((one) => one.kind === kind) : undefined;
			return {
				kind,
				readers: LIST_READERS[kind],
				// Saved for this trip, else what was kept from the last one, to confirm.
				data: entry?.data ?? keptOne?.data ?? null,
				fromLastTrip: !entry && !!keptOne,
				savedAt: entry?.savedAt ?? null,
				savedBy: entry && entry.savedBy !== viewer.email ? nameOf(entry.savedBy) || t.trips.lists.someoneElse : null,
				keep: isKeepable(kind) ? (keptOne ? true : entry ? false : KEPT_BY_DEFAULT[kind]) : null,
				// A young player's consents are given by a parent (#299).
				locked: kind === 'einverstaendnis' && person.minor && !person.byParent
			};
		})
	};
};

const now = () => new Date().toISOString();

/** The opened trip and whose lists, for an action; refuses when the trip is over. */
async function forAction(locals: App.Locals, id: string, form: FormData) {
	const opened = await openTrip(locals, id);
	const fuer = String(form.get('fuer') ?? '') || null;
	const person = listPerson(opened, fuer);
	if (!person) error(403, t.messages.noRight);
	if (!editable(opened)) return { opened, person, closed: fail(409, { error: t.trips.lists.closed }) };
	return { opened, person, closed: null };
}

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const form = await request.formData();
		const { opened, person, closed } = await forAction(locals, params.id, form);
		if (closed) return closed;
		const kind = String(form.get('kind') ?? '') as ListKind;
		if (!LIST_KINDS.includes(kind) || !listsFor(opened.trip, person.participant.roles).includes(kind)) error(400, t.messages.noRight);
		if (kind === 'einverstaendnis' && person.minor && !person.byParent) return fail(403, { kind, error: t.trips.lists.problems.parent });
		const store = opened.store;
		const instruments = kind === 'instrumente' ? await store.instruments([person.email]) : [];
		const parsed = listFromForm(kind, form, { questions: opened.trip.questions, minor: person.minor, instruments });
		if ('problem' in parsed) return fail(400, { kind, error: t.trips.lists.problems[parsed.problem] });
		const at = now();
		if (kind === 'instrumente') {
			const taken = (parsed.data as { taken: string[] }).taken;
			// Taking an instrument along confirms its value, as the form says next to the button.
			if (taken.length && !form.get('confirmValues')) return fail(400, { kind, error: t.trips.lists.problems.confirm });
			for (const instrument of instruments.filter((one) => taken.includes(one.id))) await store.saveInstrument({ ...instrument, confirmedAt: at });
		}
		await store.saveList({ tripId: opened.trip.id, email: person.email, kind, data: parsed.data, savedAt: at, savedBy: opened.viewer.email });
		if (isKeepable(kind)) {
			if (form.get('keep')) await store.keep({ email: person.email, kind, data: parsed.data, savedAt: at });
			else await store.unkeep(person.email, kind);
		}
		return { kind, saved: true };
	},

	/** Adds one of the person's instruments, or changes it; they keep it for every trip. */
	instrument: async ({ locals, params, request }) => {
		const form = await request.formData();
		const { opened, person, closed } = await forAction(locals, params.id, form);
		if (closed) return closed;
		const parsed = instrumentFromForm(form);
		if ('problem' in parsed) return fail(400, { kind: 'instrumente', instrumentError: t.trips.lists.problems[parsed.problem] });
		const known = await opened.store.instruments([person.email]);
		const id = String(form.get('id') ?? '');
		const existing = known.find((one) => one.id === id);
		if (!existing && known.length >= INSTRUMENTS_MAX) return fail(400, { kind: 'instrumente', instrumentError: t.trips.lists.problems['too-many'] });
		await opened.store.saveInstrument({
			...parsed.instrument,
			id: existing?.id ?? newTripId(),
			email: person.email,
			// A changed value is a confirmed one.
			confirmedAt: now()
		});
		return { kind: 'instrumente', instrumentSaved: true };
	},

	removeInstrument: async ({ locals, params, request }) => {
		const form = await request.formData();
		const { opened, person, closed } = await forAction(locals, params.id, form);
		if (closed) return closed;
		await opened.store.removeInstrument(person.email, String(form.get('id') ?? ''));
		return { kind: 'instrumente', instrumentSaved: true };
	}
};

import { error, fail, redirect } from '@sveltejs/kit';
import type { ShownEvent } from '#lib/events/schedule.ts';
import * as t from '#lib/i18n/texts.ts';
import { parsePlanEdit, planRehearsalSave, planVersion } from '#lib/rehearsals/plan.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { getLibrary, namedItem, type Library } from '#lib/server/library.ts';
import { getRehearsalPlan } from '#lib/server/repertoire.ts';
import { appendRecords, deleteRows, readTab, refreshAfterWrite, SheetLayoutError } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

/** The concert and its rehearsals from the calendar; the plan is edited per concert. */
function concertOf(library: Library, id: string) {
	const schedule = library.schedule;
	if (!schedule.ok) error(503, t.messages.calendarUnavailable);
	const event = schedule.byId.get(id);
	if (!event) error(404, t.messages.noEvent);
	const rehearsals = event.rehearsalIds.map((rid) => schedule.byId.get(rid)).filter((e): e is ShownEvent => !!e);
	return { event, rehearsals };
}

/** What the sheet's "Probe" column says, so the tab stays readable without the app. */
const label = (rehearsal: ShownEvent) => `${rehearsal.displayTitle} · ${rehearsal.date.long}`;

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRight(locals, 'programme.bearbeiten');
	const [library, plan] = await Promise.all([getLibrary(), getRehearsalPlan()]);
	const { event, rehearsals } = concertOf(library, params.id);
	const concert = { id: event.id, title: event.displayTitle };
	if (event.type !== 'konzert') return { state: 'not-a-concert' as const, concert };
	if (!plan) return { state: 'not-set-up' as const, concert };
	if (!rehearsals.length) return { state: 'no-rehearsals' as const, concert };

	// The programme's pieces, by the name they have in "Stücke"; then pieces planned that
	// aren't (or no longer) in it, so nothing in the sheet goes unseen.
	const program = library.concertsById.get(event.id)?.sheet?.program ?? [];
	const pieces = program.map((entry) => ({ name: entry.pieceName, ...namedItem(library, entry.pieceName), inProgram: true }));
	const byName = new Map(pieces.map((piece) => [normalize(piece.name), piece]));
	const selected: Record<string, string[]> = {};
	const notes: Record<string, Record<string, string>> = {};
	for (const rehearsal of rehearsals) {
		selected[rehearsal.id] = [];
		notes[rehearsal.id] = {};
		for (const entry of plan.byEvent.get(rehearsal.id) ?? []) {
			let piece = byName.get(normalize(entry.pieceName));
			if (!piece) {
				piece = { name: entry.pieceName, ...namedItem(library, entry.pieceName), inProgram: false };
				pieces.push(piece);
				byName.set(normalize(entry.pieceName), piece);
			}
			selected[rehearsal.id].push(piece.name);
			if (entry.notes) notes[rehearsal.id][piece.name] = entry.notes;
		}
	}

	return {
		state: 'ready' as const,
		concert,
		version: planVersion(plan.table, rehearsals.map((r) => r.id)),
		rehearsals: rehearsals.map((r) => ({ id: r.id, title: r.displayTitle, date: r.date, past: r.past, type: r.type })),
		pieces: pieces.map(({ name, title, subtitle, inProgram }) => ({ name, title, subtitle, inProgram })),
		selected,
		notes
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		requireRight(locals, 'programme.bearbeiten');
		const data = await request.formData();
		const library = await getLibrary();
		const { rehearsals } = concertOf(library, params.id);
		const ids = rehearsals.map((r) => r.id);
		const edit = parsePlanEdit(String(data.get('plan') ?? ''), new Set(ids));
		if (!edit) return fail(400, { message: t.rehearsalPlan.failed });

		try {
			const table = await readTab('rehearsals');
			if (planVersion(table, ids) !== String(data.get('version'))) return fail(409, { message: t.rehearsalPlan.conflict });
			const plan = planRehearsalSave(table, edit, Object.fromEntries(rehearsals.map((r) => [r.id, label(r)])));
			// New rows first: if deleting the old ones fails, nothing is lost, only doubled.
			await appendRecords('rehearsals', table, plan.append);
			await deleteRows('rehearsals', table, plan.remove);
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: t.rehearsalPlan.notSetUp });
			console.error('Saving a rehearsal plan failed:', cause);
			return fail(503, { message: t.messages.sheetFailed });
		}
		redirect(303, `/kalender/${encodeURIComponent(params.id)}?probenplan`);
	}
};

import { error, fail, redirect } from '@sveltejs/kit';
import { countingMembers, isAdminOnly, normalizeEmail } from '#lib/access/access.ts';
import { attendanceVersion, parseTicks, planAttendanceSave } from '#lib/attendance/attendance.ts';
import { config } from '#lib/config/index.ts';
import type { ShownEvent } from '#lib/events/schedule.ts';
import * as t from '#lib/i18n/texts.ts';
import { formatInstrument } from '#lib/music/my-parts.ts';
import { sectionOf } from '#lib/signups/signups.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { isOn, requireFeature } from '#lib/server/env.ts';
import { getLibrary, orchestraOf, type Library } from '#lib/server/library.ts';
import { getAccessList, getAttendance, getSignups } from '#lib/server/repertoire.ts';
import { appendRecords, deleteRows, readTab, refreshAfterWrite, SheetLayoutError, updateRecords, withSheetLock } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

const RIGHT = 'anwesenheit.erfassen';

function eventOf(library: Library, id: string): ShownEvent {
	const schedule = library.schedule;
	if (!schedule.ok) error(503, t.messages.calendarUnavailable);
	const event = schedule.byId.get(id);
	if (!event) error(404, t.messages.noEvent);
	return event;
}

const isRehearsal = (event: ShownEvent) => event.type === 'probe' || event.type === 'generalprobe';

/** What the sheet's "Termin" column says, so the tab stays readable without the app. */
const label = (event: ShownEvent) => `${event.displayTitle} · ${event.date.long}`;

/**
 * Who can be ticked off: active members of the date's orchestra (see orchestraOf), plus anyone who answered
 * or already has a row, so nobody recorded goes unseen. In instrument order, then by name.
 * Nobody ticked yet: the sign-ups' "Zusage" are the starting point.
 */
async function people(library: Library, event: ShownEvent) {
	const [access, signups, attendance] = await Promise.all([getAccessList(), isOn('signups') ? getSignups() : null, getAttendance()]);
	const orchestra = orchestraOf(library, event);
	const members = access?.members ?? [];
	const byEmail = new Map(members.map((member) => [member.email, member]));
	const answers = new Map((signups?.byEvent.get(event.id) ?? []).map((signup) => [signup.email, signup]));
	const recorded = attendance?.byEvent.get(event.id);
	const emails = new Set([
		// Everyone active, whatever they answered: a "Vielleicht" or an "Absage" may still turn up.
		// Members without an instrument (conductor, board) come last, under "Ohne Instrument".
		...countingMembers(members, orchestra, library.today).map((member) => member.email),
		...answers.keys(),
		...(recorded?.keys() ?? [])
	].filter((email) => !isAdminOnly(byEmail.get(email))));
	const order = new Map(config.instruments.map((instrument, i) => [instrument.name, i]));
	const list = [...emails].map((email) => {
		const member = byEmail.get(email);
		const answer = answers.get(email);
		const section = sectionOf(answer?.instrument ?? '', member, config);
		const entry = recorded?.get(email);
		return {
			email,
			name: member?.name ?? answer?.name ?? entry?.name ?? email,
			section: section ? formatInstrument(section) : '',
			rank: section ? (order.get(section.instrument) ?? Infinity) : Infinity,
			answer: answer?.answer,
			present: entry ? entry.present : answer?.answer === 'yes'
		};
	});
	list.sort((a, b) => a.rank - b.rank || a.section.localeCompare(b.section) || a.name.localeCompare(b.name, config.locale));
	return { list, attendance, taken: !!recorded?.size };
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requireFeature('attendance');
	requireRight(locals, RIGHT);
	const library = await getLibrary();
	const event = eventOf(library, params.id);
	const concert = event.concertId ? library.concertsById.get(event.concertId) : undefined;
	const base = {
		rehearsal: { id: event.id, title: event.displayTitle, date: event.date },
		concert: concert ? { id: concert.id, title: concert.title } : undefined
	};
	if (!isRehearsal(event)) return { state: 'not-a-rehearsal' as const, ...base };
	if (event.daysUntil > 0) return { state: 'not-yet' as const, ...base };
	const { list, attendance, taken } = await people(library, event);
	if (!attendance) return { state: 'not-set-up' as const, ...base };
	return {
		state: 'ready' as const,
		...base,
		taken,
		version: attendanceVersion(attendance.table, event.id),
		people: list.map(({ rank: _, ...person }) => person)
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		const library = await getLibrary();
		const event = eventOf(library, params.id);
		if (!isRehearsal(event) || event.daysUntil > 0) return fail(400, { message: t.attendance.notYet });
		const { list } = await people(library, event);
		const ticks = parseTicks(String(data.get('ticks') ?? ''), new Map(list.map((person) => [normalizeEmail(person.email), person.name])));
		if (!ticks) return fail(400, { message: t.attendance.failed });

		try {
			// The version check and the writes in one turn: nobody's save lands in between.
			const conflict = await withSheetLock(async () => {
				const table = await readTab('attendance');
				if (attendanceVersion(table, event.id) !== String(data.get('version'))) return true;
				const plan = planAttendanceSave(table, event.id, label(event), ticks);
				await updateRecords('attendance', table, plan.update);
				// New rows before deleting: if deleting fails, nothing is lost, only doubled.
				await appendRecords('attendance', table, plan.append);
				await deleteRows('attendance', table, plan.remove);
				return false;
			});
			if (conflict) return fail(409, { message: t.attendance.conflict });
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: t.attendance.notSetUp });
			console.error('Saving attendance failed:', cause);
			return fail(503, { message: t.attendance.failed });
		}
		redirect(303, `/kalender/${encodeURIComponent(params.id)}?anwesenheit`);
	}
};

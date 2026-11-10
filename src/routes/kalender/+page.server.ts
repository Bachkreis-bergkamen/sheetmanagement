import { fail } from '@sveltejs/kit';
import { mayFor } from '#lib/access/access.ts';
import { concertSummary, getLibrary, isPastConcert, shownDates } from '#lib/server/library.ts';
import { config } from '#lib/config/index.ts';
import { newEventFromForm } from '#lib/events/new-event.ts';
import { t } from '#lib/i18n/index.ts';
import { isOpen } from '#lib/polls/polls.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { addPastConcert } from '#lib/server/archive.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { pollStore, pollViewer, visiblePolls } from '#lib/server/polls.ts';
import { addCalendarEvent, calendarRange, getSchedule } from '#lib/server/schedule.ts';
import { calendarWriteEnabled } from '#lib/server/services.ts';
import { myAnswers } from '#lib/server/signups.ts';
import type { Actions, PageServerLoad } from './$types';

/** The first and last day the site shows from the calendar, in the orchestra's time zone. */
function shownDays() {
	const { from, to } = calendarRange(Date.now());
	const day = (date: Date) => eventDay({ start: date.toISOString(), allDay: false }, config.timeZone);
	return { first: day(from), last: day(to) };
}

/** List or calendar, remembered per viewer in a cookie the page sets. */
const VIEW_COOKIE = 'konzerte-ansicht';

/** Open date polls meant for you (#95), with whether you've answered: they sit next to the dates. */
async function openPolls(locals: App.Locals, today: string) {
	const store = pollStore();
	const viewer = await pollViewer(locals);
	if (!store || !viewer) return { polls: [], plans: false };
	const polls = await Promise.all(
		(await visiblePolls(locals))
			.filter((poll) => isOpen(poll, today))
			.map(async (poll) => {
				const responses = (await store.get(poll.id))?.responses ?? [];
				return { ...poll, answers: responses.length, answered: responses.some((response) => response.email === viewer.email) };
			})
	);
	return { polls, plans: viewer.plans };
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const view = cookies.get(VIEW_COOKIE) === 'kalender' ? ('calendar' as const) : ('list' as const);
	const library = await getLibrary();
	const schedule = library.schedule;
	const [polls, answers] = await Promise.all([
		openPolls(locals, library.today).catch((error) => {
			console.error('Loading the date polls failed:', error);
			return { polls: [], plans: false };
		}),
		myAnswers(locals)
	]);

	// Past concerts: the calendar's recent ones and the history from the sheet, newest first.
	const past = library.concerts.filter((concert) => isPastConcert(concert, library.today)).map(concertSummary);

	// Adding dates: upcoming ones into the calendar for those who plan them, past concerts into
	// the archive (the sheet) for those who keep it. The form says when the calendar is read-only.
	const calendar = locals.access.rights.has('termine.planen');
	const archive = locals.access.rights.has('archiv.bearbeiten') && library.sheet === 'ok';
	const adding =
		calendar || archive
			? {
					calendar,
					archive,
					writable: calendarWriteEnabled(),
					// The date field stops where the site stops showing dates.
					last: shownDays().last,
					orchestras: config.orchestras,
					concerts: schedule.ok
						? schedule.events.filter((event) => event.type === 'konzert' && !event.past).map((event) => ({ id: event.id, title: event.displayTitle, date: event.date.long }))
						: []
				}
			: null;

	if (!schedule.ok) {
		return { error: schedule.reason, upcoming: [], events: [], today: library.today, view, past, concertTitles: {} as Record<string, string>, subscribeUrl: null, ...polls, adding, answers };
	}

	// Members see the rehearsals of their own orchestras; concerts are for everyone.
	const shown = schedule.events.filter(await shownDates(library, locals));
	const concertTitles: Record<string, string> = {};
	for (const event of schedule.events) {
		if (event.type === 'konzert') concertTitles[event.id] = event.displayTitle;
	}

	return {
		error: null,
		upcoming: shown.filter((event) => !event.past),
		// The calendar shows the recent past of the current month too.
		events: shown,
		today: library.today,
		view,
		past,
		concertTitles,
		subscribeUrl: schedule.subscribeUrl,
		...polls,
		adding,
		// The member's own answers, so the list shows which dates still wait for one.
		answers
	};
};

export const actions: Actions = {
	/**
	 * A concert or rehearsal into the Google Calendar ("termine.planen", CALENDAR_WRITE); a concert
	 * that's already over goes into the archive instead ("archiv.bearbeiten"), only the year if
	 * that's all anyone knows.
	 */
	addEvent: async ({ locals, request }) => {
		const form = await request.formData();
		const values = Object.fromEntries([...form].map(([name, value]) => [name, String(value)]));
		// Ticked one by one: all of them, to show the form again as it was.
		values.orchestra = form.getAll('orchestra').map(String).join(', ');
		const date = String(form.get('date') ?? '').trim();
		const today = eventDay({ start: new Date().toISOString(), allDay: false }, config.timeZone);
		if (values.type === 'konzert' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today && locals.access.rights.has('archiv.bearbeiten')) {
			const field = (name: string) => String(form.get(name) ?? '').trim().slice(0, 200);
			const refused = await addPastConcert(locals, {
				title: field('title'),
				date: form.get('yearOnly') ? date.slice(0, 4) : date,
				location: field('location'),
				orchestra: values.orchestra.slice(0, 200)
			});
			return fail(refused.status, { eventError: refused.message, eventValues: values });
		}

		requireRight(locals, 'termine.planen');
		// Planning limited to some orchestras (#305): a date for one of them, or for everyone.
		const own = locals.access.scopes?.get('termine.planen');
		if (own && !mayFor(locals.access, 'termine.planen', values.orchestra)) {
			return fail(403, { eventError: t.calendar.add.otherOrchestra(own.join(', ')), eventValues: values });
		}
		if (!calendarWriteEnabled()) return fail(503, { eventError: t.calendar.add.readOnly, eventValues: values });

		const schedule = await getSchedule();
		const concerts = schedule.ok ? schedule.events.filter((event) => event.type === 'konzert' && !event.past) : [];
		const parsed = newEventFromForm(form, { keywords: config.events, timeZone: config.timeZone, concerts, orchestras: config.orchestras, range: shownDays() });
		if ('error' in parsed) return fail(400, { eventError: t.calendar.add.problems[parsed.error], eventValues: values });

		const result = await addCalendarEvent(parsed.event);
		if (!result.ok) return fail(result.reason === 'failed' ? 503 : 400, { eventError: t.calendar.add.errors[result.reason], eventValues: values });
		return { eventAdded: { id: result.event.id, title: result.event.title } };
	}
};

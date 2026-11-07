import type { EventKeywords } from '#lib/config/index.ts';
import type { CalendarEvent } from '#lib/server/google/calendar.ts';
import { joinList, splitList } from '#lib/repertoire/lists.ts';
import { rowOrchestra, sameOrchestra, titleOrchestra } from '#lib/repertoire/orchestras.ts';
import { eventDay } from '#lib/repertoire/dates.ts';
import { dateFormat } from './format.ts';
import { buildSchedule, classify, significantWords } from './schedule.ts';

/**
 * A concert or rehearsal entered on /kalender, as Google Calendar's events.insert expects it.
 * The app knows an event's type and its concert only from the title (see schedule.ts), so the
 * title is made to say both: "Probe Herbstkonzert" prepares for the Herbstkonzert. A rehearsal
 * of only some of the orchestras names them too, "Probe Herbstkonzert (A)", so everyone looking
 * at the calendar sees it; all of them together, the usual case, needs no name.
 */

/** Where the app keeps a rehearsal's orchestras on the calendar event itself ("EO, A"). */
export const ORCHESTRA_PROPERTY = 'orchester';

export const NEW_EVENT_TYPES = ['konzert', 'probe', 'generalprobe'] as const;
export type NewEventType = (typeof NEW_EVENT_TYPES)[number];

export type NewEventProblem = 'type' | 'title' | 'date' | 'too-early' | 'too-late' | 'time' | 'end' | 'concert' | 'orchestra' | 'too-long';

/** The request body for events.insert: all-day with dates, otherwise local times in the orchestra's zone. */
export interface NewEventBody {
	summary: string;
	location?: string;
	description?: string;
	start: { date: string } | { dateTime: string; timeZone: string };
	end: { date: string } | { dateTime: string; timeZone: string };
	/** A rehearsal of some of the orchestras keeps them on the event too (see google/calendar.ts). */
	extendedProperties?: { shared: Record<string, string> };
}

export interface NewEventContext {
	keywords: EventKeywords;
	timeZone: string;
	/** Concerts a rehearsal may prepare for: the upcoming ones from the calendar. */
	concerts: Pick<CalendarEvent, 'id' | 'title' | 'start' | 'end' | 'allDay'>[];
	/** The orchestras sharing the calendar (config.orchestras). */
	orchestras?: string[];
	/** The first and last day the app loads from the calendar: a date outside would never show. */
	range?: { first: string; last: string };
	/**
	 * Changing an event that's already there: it may lie before the range (a rehearsal last week
	 * gets its time corrected), and the concert it already belongs to doesn't go into the title
	 * again, so saving without changes keeps the title as it is.
	 */
	editing?: { concertId?: string };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Without an end time: a concert takes about two hours, a rehearsal three. */
const DEFAULT_HOURS: Record<NewEventType, number> = { konzert: 2, probe: 3, generalprobe: 3 };

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim().replace(/\s+/g, ' ');
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** The title as the calendar keeps it: with a word that gives the type, and the concert's name for a rehearsal. */
export function newEventTitle(
	type: NewEventType,
	title: string,
	date: string,
	{ keywords, concerts, orchestras = [] }: Pick<NewEventContext, 'keywords' | 'concerts' | 'orchestras'>,
	concert?: NewEventContext['concerts'][number],
	orchestra?: string
): string {
	// "Generalprobe" for a Generalprobe, "Probe" rather than "Stimmprobe" for a rehearsal.
	const word = keywords[type][0] ?? type;
	const typeWord = word.charAt(0).toUpperCase() + word.slice(1);
	let result = title || typeWord;
	if (classify(result, keywords) !== type) result = `${typeWord} ${result}`;
	if (concert && type !== 'konzert') {
		// The title names the concert and the schedule links it there, among all concerts;
		// otherwise the concert's name is added. Everyone reading the calendar sees what it's for.
		const words = significantWords(concert.title, keywords);
		const named = [...significantWords(result, keywords)].some((word) => words.has(word));
		const linked =
			buildSchedule([{ id: '', title: result, start: date, end: date, allDay: true }, ...concerts], keywords).find((event) => event.id === '')?.concertId ===
			concert.id;
		if (!named || !linked) result = `${result} ${concert.title.replace(/\(\s*\?\s*\)/, '').replace(/\s+/g, ' ').trim()}`;
	}
	// Some of the orchestras, unless the title already names just them.
	const some = orchestra && type !== 'konzert' && !sameOrchestra(orchestra, joinList(orchestras));
	if (some && !sameOrchestra(titleOrchestra(result, orchestras), orchestra)) result = `${result} (${orchestra})`;
	return result;
}

/** The form on /kalender → the event to insert, or what's wrong with it. */
export function newEventFromForm(form: FormData, context: NewEventContext): { event: NewEventBody } | { error: NewEventProblem } {
	const type = text(form, 'type') as NewEventType;
	if (!NEW_EVENT_TYPES.includes(type)) return { error: 'type' };
	const title = text(form, 'title');
	const date = text(form, 'date');
	const start = text(form, 'start');
	const end = text(form, 'end');
	const location = text(form, 'location');
	const description = String(form.get('description') ?? '').trim();
	const concertId = text(form, 'concert');
	const orchestras = context.orchestras ?? [];
	// Ticked one by one; none is all of them together.
	const ticked = splitList(form.getAll('orchestra').map(String).join(', '));
	const orchestra = type === 'konzert' ? undefined : rowOrchestra(joinList(ticked), orchestras);

	if (type === 'konzert' && !title) return { error: 'title' };
	if (title.length > 120 || location.length > 200 || description.length > 2000) return { error: 'too-long' };
	if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: 'date' };
	if (context.range && date < context.range.first && !context.editing) return { error: 'too-early' };
	if (context.range && date > context.range.last) return { error: 'too-late' };
	if ((start && !TIME.test(start)) || (end && !TIME.test(end)) || (end && !start)) return { error: 'time' };
	if (start && end && minutes(end) <= minutes(start)) return { error: 'end' };

	const concert = concertId ? context.concerts.find((candidate) => candidate.id === concertId) : undefined;
	if (concertId && (!concert || type === 'konzert')) return { error: 'concert' };
	if (!ticked.every((name) => orchestras.some((known) => sameOrchestra(known, name)))) return { error: 'orchestra' };

	const named = context.editing && concert?.id === context.editing.concertId ? undefined : concert;
	const summary = newEventTitle(type, title, date, context, named, orchestra) + (form.get('tentative') ? ' (?)' : '');
	const until = end || clock(Math.min(minutes(start) + DEFAULT_HOURS[type] * 60, 23 * 60 + 59));
	return {
		event: {
			summary,
			...(location ? { location } : {}),
			...(description ? { description } : {}),
			start: start ? { dateTime: `${date}T${start}:00`, timeZone: context.timeZone } : { date },
			end: start ? { dateTime: `${date}T${until}:00`, timeZone: context.timeZone } : { date: nextDay(date) },
			...(orchestra && !sameOrchestra(orchestra, joinList(orchestras)) ? { extendedProperties: { shared: { [ORCHESTRA_PROPERTY]: orchestra } } } : {})
		}
	};
}

const TENTATIVE = /\s*\(\s*\?\s*\)/;

/**
 * A rehearsal's title once its orchestras are changed on its page: an "(A)" at the end gives way
 * to the new ones, none for all of them. What the title says elsewhere stays; the orchestras
 * kept on the event decide (see schedule.ts).
 */
export function orchestraTitle(title: string, chosen: string[], orchestras: string[]): string {
	const tentative = TENTATIVE.test(title);
	let result = title.replace(TENTATIVE, '').trim();
	const end = result.match(/\s*\(([^()]*)\)$/);
	const names = splitList(end?.[1]);
	if (end && names.length && names.every((name) => orchestras.some((orchestra) => sameOrchestra(orchestra, name)))) result = result.slice(0, end.index).trim();
	const some = chosen.length && chosen.length < orchestras.length;
	if (some) result = `${result} (${joinList(chosen)})`;
	return tentative ? `${result} (?)` : result;
}

/**
 * An event from the calendar as the form fills it in for a change on its page: local times in
 * the orchestra's zone, the title without "(?)" and without the orchestras at its end (the
 * ticks say those, and saving puts them back).
 */
export function eventFormValues(
	event: Pick<CalendarEvent, 'title' | 'start' | 'end' | 'allDay' | 'location' | 'orchestras'> & { type: string; concertId?: string; description?: string },
	{ timeZone, orchestras = [] }: { timeZone: string; orchestras?: string[] }
): Record<string, string> {
	const time = (iso: string) => dateFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
	const tentative = TENTATIVE.test(event.title);
	const title = event.type === 'konzert' ? event.title.replace(TENTATIVE, '').trim() : orchestraTitle(event.title.replace(TENTATIVE, '').trim(), [], orchestras);
	return {
		type: event.type,
		title,
		date: eventDay(event, timeZone),
		start: event.allDay ? '' : time(event.start),
		end: event.allDay ? '' : time(event.end),
		location: event.location ?? '',
		description: event.description ?? '',
		...(tentative ? { tentative: 'on' } : {}),
		concert: event.concertId ?? '',
		orchestra: event.orchestras ?? ''
	};
}

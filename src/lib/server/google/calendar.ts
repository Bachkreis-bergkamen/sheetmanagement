import { ORCHESTRA_PROPERTY, type NewEventBody } from '#lib/events/new-event.ts';
import type { GoogleClient } from './client.ts';

interface ApiEvent {
	id: string;
	status?: string;
	summary?: string;
	description?: string;
	location?: string;
	htmlLink?: string;
	start?: { date?: string; dateTime?: string };
	end?: { date?: string; dateTime?: string };
	extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}

interface EventListPage {
	items?: ApiEvent[];
	nextPageToken?: string;
}

export interface CalendarEvent {
	id: string;
	title: string;
	/** ISO date ("2026-11-15") for all-day events, ISO date-time otherwise. */
	start: string;
	end: string;
	allDay: boolean;
	location?: string;
	description?: string;
	url?: string;
	/** The orchestras the app set for it ("EO, A"); ahead of what the title names. */
	orchestras?: string;
}

export function toCalendarEvent(event: ApiEvent): CalendarEvent | null {
	const start = event.start?.dateTime ?? event.start?.date;
	if (event.status === 'cancelled' || !start) return null;
	return {
		id: event.id,
		title: event.summary?.trim() ?? '',
		start,
		end: event.end?.dateTime ?? event.end?.date ?? start,
		allDay: !event.start?.dateTime,
		location: event.location?.trim() || undefined,
		description: event.description?.trim() || undefined,
		url: event.htmlLink,
		orchestras: event.extendedProperties?.shared?.[ORCHESTRA_PROPERTY]?.trim() || undefined
	};
}

/** Events in a time range, with recurring events expanded, sorted by start. */
export async function listEvents(
	client: GoogleClient,
	calendarId: string,
	{ from, to }: { from: Date; to?: Date }
): Promise<CalendarEvent[]> {
	const items = await client.paginate<EventListPage, ApiEvent>(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
		{
			singleEvents: true,
			orderBy: 'startTime',
			timeMin: from.toISOString(),
			timeMax: to?.toISOString(),
			maxResults: 250
		},
		(page) => page.items
	);
	return items.map(toCalendarEvent).filter((event): event is CalendarEvent => event !== null);
}

/** Adds an event (needs the calendar.events scope and "Make changes to events" on the calendar). */
export async function insertEvent(client: GoogleClient, calendarId: string, event: NewEventBody): Promise<CalendarEvent> {
	const created = await client.request<ApiEvent>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
		method: 'POST',
		body: event
	});
	const result = toCalendarEvent(created);
	if (!result) throw new Error('Google returned the new event without a start');
	return result;
}

/** Changes an event's title and the orchestras the app keeps on it (empty removes them). */
export async function patchEventOrchestras(
	client: GoogleClient,
	calendarId: string,
	eventId: string,
	{ summary, orchestras }: { summary: string; orchestras: string }
): Promise<void> {
	await client.request<ApiEvent>(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		// Null deletes a property; shared, so everyone with the calendar keeps the same answer.
		{ method: 'PATCH', body: { summary, extendedProperties: { shared: { [ORCHESTRA_PROPERTY]: orchestras || null } } } }
	);
}

/** What a change on an event's page sends: empty texts clear a field, a null property removes it. */
export interface EventChange extends Omit<NewEventBody, 'extendedProperties' | 'location' | 'description'> {
	location: string;
	description?: string;
	extendedProperties: { shared: Record<string, string | null> };
}

/** Changes a concert's or rehearsal's title, time, place and note (events.patch). */
export async function patchEvent(client: GoogleClient, calendarId: string, eventId: string, change: EventChange): Promise<CalendarEvent> {
	const changed = await client.request<ApiEvent>(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		{ method: 'PATCH', body: change }
	);
	const result = toCalendarEvent(changed);
	if (!result) throw new Error('Google returned the changed event without a start');
	return result;
}

import * as t from '#lib/i18n/texts.ts';
import type { Answer } from '#lib/signups/signups.ts';
import type { FeedEvent } from './ical.ts';
import type { ShownEvent } from './schedule.ts';

/**
 * What a member's calendar feed shows (#122): the orchestra's dates as in the shared
 * calendar, plus what only the app knows. The member's own answer goes in front of the
 * title, what's rehearsed or played into the description, with links back to the app.
 */

export interface FeedInput {
	events: ShownEvent[];
	/** The member plays in the event's orchestra (or it has none). */
	includes: (event: ShownEvent) => boolean;
	/** Piece titles rehearsed (rehearsals) or played (concerts). */
	pieces: (event: ShownEvent) => string[];
	answer: (event: ShownEvent) => Answer | undefined;
	/** "https://noten.example.org" */
	origin: string;
	/** Events that ended before this are left out. */
	since: number;
}

const MARKS: Record<Answer, string> = { yes: '✓', maybe: '?', no: '✗' };

export function feedEvents({ events, includes, pieces, answer, origin, since }: FeedInput): FeedEvent[] {
	return events
		.filter((event) => new Date(event.end).getTime() >= since && includes(event))
		.map((event) => {
			const own = answer(event);
			const titles = pieces(event);
			const page = `${origin}/kalender/${encodeURIComponent(event.id)}`;
			const isConcert = event.type === 'konzert';
			const parts =
				titles.length && !event.past
					? `${origin}/meine-noten?${isConcert ? 'konzert' : 'probe'}=${encodeURIComponent(event.id)}`
					: undefined;
			// What's on and the own answer, then a blank line and the links.
			const info = [
				titles.length ? `${isConcert ? t.feed.program : t.feed.rehearsed} ${titles.join(', ')}` : '',
				own ? t.feed.answer(t.signups.answerValues[own]) : ''
			].filter(Boolean);
			const links = [`${t.feed.details} ${page}`, parts ? `${t.feed.parts} ${parts}` : ''].filter(Boolean);
			const description = [...info, ...(info.length ? [''] : []), ...links].join('\n');
			return {
				uid: `${event.id}@sheetmanagement`,
				title: own ? `${MARKS[own]} ${event.displayTitle}` : event.displayTitle,
				start: event.start,
				end: event.end,
				allDay: event.allDay,
				location: event.location,
				description,
				url: page,
				tentative: event.tentative
			};
		});
}

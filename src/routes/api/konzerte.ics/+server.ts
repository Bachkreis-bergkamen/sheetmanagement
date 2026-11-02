import { t } from '#lib/i18n/index.ts';
import { buildCalendar } from '#lib/events/ical.ts';
import { orchestra } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { feedEventsOf, publicFeed, publishedIds } from '#lib/server/public-concerts.ts';
import type { RequestHandler } from './$types';

/** The published upcoming concerts as a calendar to subscribe to (#197), e.g. from the orchestra's website. */
export const GET: RequestHandler = async () => {
	const [library, published] = await Promise.all([getLibrary(), publishedIds()]);
	const events = feedEventsOf(publicFeed(library, published), t.feed.publicProgram, t.partners.with);
	return new Response(buildCalendar(t.feed.publicCalendarName(orchestra().name), events), {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': 'inline; filename="konzerte.ics"',
			'access-control-allow-origin': '*',
			'cache-control': 'public, max-age=900'
		}
	});
};

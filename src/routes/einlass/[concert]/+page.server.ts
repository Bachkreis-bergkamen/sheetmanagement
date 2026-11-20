import { error } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import type { PageServerLoad } from './$types';

/** The door's page (docs/tickets-plan.md §4.4); the list itself comes from /api/einlass and stays on the phone. */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireFeature('tickets');
	requireRight(locals, 'karten.einlass');
	const library = await getLibrary();
	const event = library.schedule.ok ? library.schedule.byId.get(params.concert) : undefined;
	if (!event || event.type !== 'konzert') error(404, t.tickets.notAConcert);
	return { concert: { id: event.id, title: event.displayTitle, date: event.date } };
};

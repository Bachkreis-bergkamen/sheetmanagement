import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { isCarer } from '#lib/trips/lists.ts';
import type { Arrangement } from '#lib/trips/organising.ts';
import type { OpenedTrip } from './trip-lists.ts';
import { youngOnTrips } from './trips.ts';

/**
 * Organising a trip on the server (#334, step 3): who sees the rooms and vehicles (the organisers,
 * and the Betreuer·innen, who look after the group, to read), and one person's arrangement.
 */

/** The organisers change rooms and vehicles; the Betreuer·innen on the trip read them; a 404 for the others. */
export function organisingReader(opened: OpenedTrip) {
	const carer = isCarer(opened.participants, opened.viewer.email);
	if (!opened.organises && !carer) error(404, t.trips.noAccess);
	return { organises: opened.organises, carer };
}

/** Only the organisers; a 403 for a Betreuer·in who reads along, a 404 for the others. */
export function organisersOnly(opened: OpenedTrip) {
	organisingReader(opened);
	if (!opened.organises) error(403, t.messages.noRight);
}

/** The young players among those going, who shouldn't share a room with grown-ups alone. */
export const youngGoing = (opened: OpenedTrip) => new Set(opened.participants.filter((p) => youngOnTrips(opened.list, p.email)).map((p) => p.email));

/** Someone signed up, with their arrangement; null when they don't hold a place. */
export async function arrangementOf(opened: OpenedTrip, email: string): Promise<Arrangement | null> {
	if (!opened.participants.some((p) => p.email === email && p.status === 'angemeldet')) return null;
	return (await opened.store.arrangements(opened.trip.id)).find((one) => one.email === email) ?? { tripId: opened.trip.id, email };
}

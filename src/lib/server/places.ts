import { LANGUAGE } from '#lib/i18n/index.ts';
import { matchKnownPlaces, mergePlaces, placeLabel, MAX_PLACES, type PhotonPlace } from '#lib/events/places.ts';
import { searchText } from '#lib/music/text.ts';
import { isDemo } from './env.ts';
import { getLibrary } from './library.ts';

/**
 * Locations for the date form (/api/orte): where the orchestra has been, then addresses from
 * Photon (OpenStreetMap, no key). The server asks, so members' devices never contact it.
 */

const PHOTON = 'https://photon.komoot.io/api/';
const HEADERS = { 'user-agent': 'Notenarchiv/1.0 (https://github.com/Bachkreis-bergkamen/sheetmanagement)' };
/** The form shows what it has after this; known places don't wait for OpenStreetMap. */
const LOOKUP_TIMEOUT_MS = 2500;
/** Typed queries repeat while someone types and corrects; kept in memory only, never in KV (writes are limited). */
const found = new Map<string, string[]>();
const MAX_REMEMBERED = 200;

async function lookUp(query: string): Promise<string[]> {
	const key = searchText(query).replace(/\s+/g, ' ').trim();
	const remembered = found.get(key);
	if (remembered) return remembered;
	const params = new URLSearchParams({ q: query, limit: String(MAX_PLACES), lang: LANGUAGE === 'de' ? 'de' : 'en' });
	const response = await fetch(`${PHOTON}?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
	if (!response.ok) throw new Error(`Photon answered ${response.status}`);
	const body = (await response.json()) as { features?: { properties?: PhotonPlace }[] };
	const places = (body.features ?? []).map((feature) => placeLabel(feature.properties ?? {})).filter(Boolean);
	if (found.size >= MAX_REMEMBERED) found.delete(found.keys().next().value!);
	found.set(key, places);
	return places;
}

export async function suggestPlaces(query: string): Promise<string[]> {
	const library = await getLibrary();
	const known = [...library.concerts.map((concert) => concert.location), ...(library.schedule.ok ? library.schedule.events.map((event) => event.location) : [])];
	const matches = matchKnownPlaces(known.filter((place): place is string => !!place), query);
	// The demo stays offline; a known place that fills the list needs no lookup.
	if (isDemo() || matches.length >= MAX_PLACES || query.trim().length < 3) return mergePlaces(matches, []);
	const addresses = await lookUp(query).catch((cause) => {
		console.error('Looking up an address failed:', cause instanceof Error ? cause.message : cause);
		return [];
	});
	return mergePlaces(matches, addresses);
}

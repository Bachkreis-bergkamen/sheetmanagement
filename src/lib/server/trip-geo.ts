import type { Trip, TripPlace } from '#lib/trips/trips.ts';
import { config } from '#lib/config/index.ts';
import { findPicture, pictureQueries } from './trip-picture.ts';
import type { Lookups, TripStore } from './trips-store.ts';

/**
 * Where a trip goes (#334): each place as written ("Jugendherberge Haltern am See") looked up once
 * in OpenStreetMap (Nominatim), for its address, country and coordinates; the country's flag; and
 * from the coordinates the picture of a sight nearby (trip-picture.ts). Only the place names leave
 * the app, never anything about members; what's found is kept with the trip.
 */

const USER_AGENT = 'sheetmanagement-trips/1.0 (https://github.com/Bachkreis-bergkamen/sheetmanagement)';
/** Nominatim's usage policy: at most one request a second. */
const PAUSE_MS = 1100;
/** Places, and pictures, looked up per page view; the rest on the next one. */
const PER_RUN = 4;
const PICTURES_PER_RUN = 3;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface NominatimHit {
	lat: string;
	lon: string;
	address?: Record<string, string>;
}

/** "Stockwieser Damm 255, 45721 Haltern am See": street, then postcode and town, as far as known. */
export function addressOf(address: Record<string, string> = {}): string | undefined {
	const street = [address.road ?? address.pedestrian ?? address.square, address.house_number].filter(Boolean).join(' ');
	const town = address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet;
	const line = [street, [address.postcode, town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
	return line || undefined;
}

/** One place in OpenStreetMap; null when it isn't found or the service doesn't answer. */
export async function geocode(query: string, fetcher: Fetcher = fetch): Promise<TripPlace | null> {
	const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '1', limit: '1', 'accept-language': config.locale.slice(0, 2) || 'de' })}`;
	const response = await fetcher(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
	if (!response.ok) return null;
	const [hit] = (await response.json()) as NominatimHit[];
	const lat = Number(hit?.lat);
	const lon = Number(hit?.lon);
	if (!hit || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	const a = hit.address ?? {};
	const address = addressOf(a);
	return {
		lat,
		lon,
		...(address ? { address } : {}),
		...(a.state ? { region: a.state } : {}),
		...(a.country ? { country: a.country } : {}),
		...(/^[a-z]{2}$/i.test(a.country_code ?? '') ? { countryCode: a.country_code.toUpperCase() } : {})
	};
}

/** A country's flag as a small PNG data URL, so pages show it without asking anyone else. */
export async function flagOf(code: string, fetcher: Fetcher = fetch): Promise<string | null> {
	if (!/^[A-Z]{2}$/.test(code)) return null;
	const response = await fetcher(`https://flagcdn.com/w80/${code.toLowerCase()}.png`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(5000) });
	if (!response.ok || response.headers.get('content-type') !== 'image/png') return null;
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (!bytes.length || bytes.length > 20_000) return null;
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:image/png;base64,${btoa(binary)}`;
}

/** The places to look up: the stops, and what the picture is searched for, each once. */
export const placesOf = (trip: Pick<Trip, 'stops' | 'pictureSearch' | 'noPicture'>) => [...new Set([...trip.stops.map((stop) => stop.place), ...pictureQueries(trip)].filter(Boolean))];

/**
 * Looks up what's missing for the trip: places not yet known (a few per run, a second apart),
 * their flags, and a picture for each place not yet pictured. Never fails the page:
 * without the services the trip just has no address, flag or picture.
 */
export async function ensureLookups(store: TripStore, trip: Trip, { fetcher = fetch, pause = (ms: number) => new Promise((done) => setTimeout(done, ms)) }: { fetcher?: Fetcher; pause?: (ms: number) => Promise<unknown> } = {}): Promise<Trip> {
	const places = { ...trip.places };
	const flags = { ...trip.flags };
	const pictures = { ...trip.pictures };
	const found: Lookups = {};
	try {
		const missing = placesOf(trip).filter((place) => !(place in places)).slice(0, PER_RUN);
		for (const [i, place] of missing.entries()) {
			if (i) await pause(PAUSE_MS);
			places[place] = await geocode(place, fetcher);
		}
		if (missing.length) found.places = places;

		const countries = [...new Set(Object.values(places).flatMap((place) => (place?.countryCode ? [place.countryCode] : [])))].filter((code) => !(code in flags));
		for (const code of countries) {
			const flag = await flagOf(code, fetcher);
			if (flag) flags[code] = flag;
		}
		if (countries.length) found.flags = flags;

		// A picture waits until its place is known.
		const unpictured = pictureQueries(trip)
			.filter((query) => !(query in pictures) && query in places)
			.slice(0, PICTURES_PER_RUN);
		for (const query of unpictured) {
			const where = places[query];
			pictures[query] = where ? await findPicture(where, fetcher) : null;
		}
		if (unpictured.length) found.pictures = pictures;
	} catch (cause) {
		console.error('Looking up the places of a trip failed:', cause);
	}
	if (!Object.keys(found).length) return trip;
	await store.setLookups(trip.id, found).catch((cause) => console.error('Saving what was looked up for a trip failed:', cause));
	return {
		...trip,
		...(found.places ? { places: found.places } : {}),
		...(found.flags ? { flags: found.flags } : {}),
		...(found.pictures ? { pictures: found.pictures } : {})
	};
}

/** At most this long on a page's load; what takes longer goes on in the background, for the next view. */
export async function withinTime<T>(work: Promise<T>, fallback: T, ms = 2500): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<T>((done) => (timer = setTimeout(() => done(fallback), ms)));
	try {
		return await Promise.race([work, late]);
	} finally {
		clearTimeout(timer);
	}
}

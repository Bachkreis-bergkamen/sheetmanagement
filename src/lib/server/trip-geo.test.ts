import { describe, expect, it, vi } from 'vitest';
import { addressOf, ensureLookups, flagOf, geocode, placesOf, withinTime } from './trip-geo.ts';
import { MemoryTripStore } from './trips-store.ts';

vi.mock('#lib/config/index.ts', () => ({ config: { locale: 'de-DE' } }));
vi.mock('./trip-picture.ts', async (original) => ({
	...(await original<typeof import('./trip-picture.ts')>()),
	findPicture: vi.fn(async ({ lat }: { lat: number }) => (lat > 50 ? { url: 'https://upload.wikimedia.org/g.jpg', page: 'https://commons.wikimedia.org/wiki/File:G.jpg', title: 'Gänsemarkt' } : null))
}));

const hostel = {
	lat: '51.7512490',
	lon: '7.2457486',
	address: { tourism: 'Jugendherberge', house_number: '255', road: 'Stockwieser Damm', town: 'Haltern am See', state: 'Nordrhein-Westfalen', postcode: '45721', country: 'Deutschland', country_code: 'de' }
};

/** OpenStreetMap and the flags, as far as the lookup asks them. */
function services(asked: string[] = []) {
	return vi.fn(async (url: string) => {
		asked.push(url);
		if (url.startsWith('https://flagcdn.com/')) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
		const q = new URL(url).searchParams.get('q');
		const hits = q === 'Jugendherberge Haltern am See' ? [hostel] : q === 'Florenz' ? [{ lat: '43.77', lon: '11.26', address: { city: 'Florenz', state: 'Toskana', country: 'Italien', country_code: 'it' } }] : [];
		return new Response(JSON.stringify(hits), { headers: { 'content-type': 'application/json' } });
	});
}

describe('where a trip goes', () => {
	it('writes an address as people read it', () => {
		expect(addressOf(hostel.address)).toBe('Stockwieser Damm 255, 45721 Haltern am See');
		expect(addressOf({ city: 'Florenz' })).toBe('Florenz');
		expect(addressOf({})).toBeUndefined();
	});

	it('finds a place in OpenStreetMap, and its flag', async () => {
		expect(await geocode('Jugendherberge Haltern am See', services())).toEqual({
			lat: 51.751249,
			lon: 7.2457486,
			address: 'Stockwieser Damm 255, 45721 Haltern am See',
			region: 'Nordrhein-Westfalen',
			country: 'Deutschland',
			countryCode: 'DE'
		});
		expect(await geocode('Nirgendwo', services())).toBeNull();
		expect(await flagOf('DE', services())).toBe('data:image/png;base64,iVBORw==');
		expect(await flagOf('xx1', services())).toBeNull();
	});

	it('looks each place up once, a second apart, with its flag and the picture, and keeps it', async () => {
		const store = new MemoryTripStore();
		const trip = await store.create(
			{
				title: 'Italienreise',
				kind: 'konzertfahrt',
				firstDay: '2027-05-01',
				lastDay: '2027-05-04',
				orchestras: [],
				organisers: [],
				stops: [
					{ place: 'Jugendherberge Haltern am See', from: '2027-05-01', until: '2027-05-02' },
					{ place: 'Florenz', from: '2027-05-03', until: '2027-05-04' },
					{ place: 'Nirgendwo', from: '2027-05-03', until: '2027-05-04' }
				],
				lists: [],
				questions: []
			},
			'vera@x.org'
		);
		expect(placesOf(trip)).toEqual(['Jugendherberge Haltern am See', 'Florenz', 'Nirgendwo']);
		const asked: string[] = [];
		const pause = vi.fn(async () => {});
		const found = await ensureLookups(store, trip, { fetcher: services(asked), pause });
		expect(pause).toHaveBeenCalledTimes(2);
		expect(found.places?.['Florenz']).toMatchObject({ country: 'Italien', countryCode: 'IT' });
		expect(found.places?.['Nirgendwo']).toBeNull();
		expect(Object.keys(found.flags ?? {})).toEqual(['DE', 'IT']);
		expect(found.pictures).toMatchObject({ 'Jugendherberge Haltern am See': { title: 'Gänsemarkt' }, Florenz: null, Nirgendwo: null });
		expect(await store.get(trip.id)).toMatchObject({ pictures: { 'Jugendherberge Haltern am See': { title: 'Gänsemarkt' } }, places: { Florenz: { countryCode: 'IT' } } });

		// Nothing new: no question to anyone.
		const again: string[] = [];
		await ensureLookups(store, (await store.get(trip.id))!, { fetcher: services(again), pause });
		expect(again).toEqual([]);
	});

	it('never fails the page, and waits only so long', async () => {
		const store = new MemoryTripStore();
		const trip = await store.create({ title: 'X', kind: 'probenfahrt', firstDay: '2027-01-01', lastDay: '2027-01-02', orchestras: [], organisers: [], stops: [{ place: 'Rom', from: '2027-01-01', until: '2027-01-02' }], lists: [], questions: [] }, 'v@x.org');
		const broken = vi.fn(async () => {
			throw new Error('offline');
		});
		expect(await ensureLookups(store, trip, { fetcher: broken })).toEqual(trip);
		expect(await withinTime(new Promise((done) => setTimeout(() => done('late'), 50)), 'now', 5)).toBe('now');
		expect(await withinTime(Promise.resolve('quick'), 'now', 50)).toBe('quick');
	});
});

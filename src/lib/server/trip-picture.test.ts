import { describe, expect, it, vi } from 'vitest';
import { MemoryTripStore } from './trips-store.ts';
import { ensurePicture, findPicture, isWikimediaImage, pictureQuery, plain, searchesFor } from './trip-picture.ts';

vi.mock('#lib/config/index.ts', () => ({ config: { locale: 'de-DE' } }));

/** Wikimedia as far as the lookup asks it: Haltern am See has a photo, the hostel has none. */
function wikimedia(seen: string[] = []) {
	return vi.fn(async (url: string) => {
		const params = new URL(url).searchParams;
		seen.push(params.get('search') ?? params.get('ids') ?? params.get('titles') ?? '');
		const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
		if (params.get('action') === 'wbsearchentities') {
			const search = params.get('search');
			if (search === 'Haltern am See') return reply({ search: [{ id: 'Q1' }, { id: 'Q2' }] });
			return reply({ search: [] });
		}
		if (params.get('action') === 'wbgetentities') {
			return reply({
				entities: {
					// The first hit is the town's coat of arms: a drawing, skipped.
					Q1: { id: 'Q1', labels: { de: { value: 'Wappen' } }, claims: { P18: [{ mainsnak: { datavalue: { value: 'Wappen Haltern.svg' } } }], P625: [{ mainsnak: { datavalue: { value: { latitude: 51.7, longitude: 7.2 } } } }] } },
					Q2: { id: 'Q2', labels: { de: { value: 'Haltern am See' } }, claims: { P18: [{ mainsnak: { datavalue: { value: 'Haltern Stausee.jpg' } } }], P625: [{ mainsnak: { datavalue: { value: { latitude: 51.74, longitude: 7.18 } } } }] } }
				}
			});
		}
		return reply({
			query: {
				pages: [
					{
						imageinfo: [
							{
								thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Haltern_Stausee.jpg/1600px-Haltern_Stausee.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo',
								descriptionurl: 'https://commons.wikimedia.org/wiki/File:Haltern_Stausee.jpg',
								extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } }
							}
						]
					}
				]
			}
		});
	});
}

describe('the picture of a trip’s place', () => {
	it('looks for the organisers’ words, else the first place, never when switched off', () => {
		const stops = [{ place: 'Florenz', from: '', until: '' }];
		expect(pictureQuery({ stops })).toBe('Florenz');
		expect(pictureQuery({ stops, pictureSearch: 'Dom von Florenz' })).toBe('Dom von Florenz');
		expect(pictureQuery({ stops, noPicture: true })).toBe('');
		expect(pictureQuery({ stops: [] })).toBe('');
	});

	it('tries the place, then shorter forms of it', () => {
		expect(searchesFor('Jugendherberge Haltern am See')).toEqual(['Jugendherberge Haltern am See', 'Haltern am See']);
		expect(searchesFor('Altstadt, Florenz')).toEqual(['Altstadt, Florenz', 'Florenz', 'Altstadt']);
	});

	it('finds a photo through Wikidata, skipping drawings, with the credit Commons asks for', async () => {
		const seen: string[] = [];
		const picture = await findPicture('Jugendherberge Haltern am See', wikimedia(seen));
		expect(picture).toEqual({
			url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Haltern_Stausee.jpg/1600px-Haltern_Stausee.jpg',
			page: 'https://commons.wikimedia.org/wiki/File:Haltern_Stausee.jpg',
			title: 'Haltern am See',
			artist: 'Jane & Co',
			license: 'CC BY-SA 4.0',
			lat: 51.74,
			lon: 7.18
		});
		expect(seen).toEqual(['Jugendherberge Haltern am See', 'Haltern am See', 'Q1|Q2', 'File:Haltern Stausee.jpg']);
		expect(await findPicture('Nirgendwo', wikimedia())).toBeNull();
		expect(plain('<b>A</b>&nbsp;B')).toBe('A B');
		expect([isWikimediaImage('https://upload.wikimedia.org/a.jpg'), isWikimediaImage('https://evil.example/a.jpg'), isWikimediaImage('http://thumb.wikimedia.org/a.jpg'), isWikimediaImage('nonsense')]).toEqual([true, false, false, false]);
	});

	it('looks once per place, keeps what it found, and never fails the page', async () => {
		const store = new MemoryTripStore();
		const trip = await store.create(
			{ title: 'Probenwochenende', kind: 'probenfahrt', firstDay: '2027-03-05', lastDay: '2027-03-07', orchestras: [], organisers: [], stops: [{ place: 'Jugendherberge Haltern am See', from: '2027-03-05', until: '2027-03-07' }], lists: [], questions: [] },
			'vera@x.org'
		);
		const fetcher = wikimedia();
		const first = await ensurePicture(store, trip, fetcher);
		expect(first.picture?.title).toBe('Haltern am See');
		const calls = fetcher.mock.calls.length;
		const again = await ensurePicture(store, (await store.get(trip.id))!, fetcher);
		expect(fetcher.mock.calls.length).toBe(calls);
		expect(again.picture?.title).toBe('Haltern am See');

		// Switched off: the picture goes.
		const off = await ensurePicture(store, { ...again, noPicture: true }, fetcher);
		expect(off.picture).toBeUndefined();

		const broken = vi.fn(async () => {
			throw new Error('offline');
		});
		const failed = await ensurePicture(store, { ...trip, pictureSearch: 'Rom', pictureFor: undefined }, broken);
		expect(failed.pictureFor).toBeUndefined();
	});
});

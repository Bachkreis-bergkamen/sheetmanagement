import { describe, expect, it, vi } from 'vitest';
import { memoryStore } from './db/memory.ts';
import type { Library, LibraryConcert, LibraryPiece } from './library.ts';

const store = memoryStore();
vi.mock('./db/index.ts', () => ({ getStore: () => store }));

const { concertSlug, feedEventsOf, publicDetails, publicFeed, publishedIds, readDetails, setPublicDetails, setPublished } = await import('./public-concerts.ts');

const event = (start: string, past: boolean) => ({ start, end: start.replace('T19', 'T21'), allDay: false, location: 'Aula', displayTitle: 'Herbstkonzert', past });

const concert = (id: string, fields: Partial<LibraryConcert>): LibraryConcert =>
	({ id, title: id, date: null, dateKey: '', label: null, orchestras: [], partners: [], program: [], sharedWith: [], ...fields }) as LibraryConcert;

const library = {
	today: '2026-10-30',
	piecesById: new Map([['p1', { id: 'p1', title: 'Eine kleine Nachtmusik', composer: 'Mozart' } as LibraryPiece]]),
	concertsById: new Map([
		[
			'herbst',
			concert('herbst', {
				event: event('2026-11-15T19:00:00+01:00', false) as LibraryConcert['event'],
				orchestras: ['EO'],
				program: [{ title: 'Eine kleine Nachtmusik', pieceId: 'p1' }, { title: 'Zugabe' }],
				label: { long: 'Sonntag, 15. November 2026', day: '15', month: 'Nov.', year: '2026' }
			})
		],
		['winter', concert('winter', { event: event('2026-12-13T19:00:00+01:00', false) as LibraryConcert['event'] })],
		['1957', concert('1957', { title: 'Weihnachtskonzert', dateKey: '1957-12', location: 'Kirche', label: { long: 'Dezember 1957', day: '', month: 'Dez.', year: '1957' } })],
		['1990', concert('1990', { title: 'Sommerkonzert', dateKey: '1990-06' })],
		['secret', concert('secret', { event: event('2026-11-20T19:00:00+01:00', false) as LibraryConcert['event'] })]
	])
} as unknown as Library;

describe('publicFeed', () => {
	const feed = publicFeed(library, new Set(['winter', 'herbst', '1957', '1990', 'gone']));

	it('has only published concerts, upcoming soonest first', () => {
		expect(feed.upcoming.map((c) => c.id)).toEqual(['herbst', 'winter']);
	});

	it('puts published past concerts in the Chronik part, newest first', () => {
		expect(feed.past.map((c) => c.id)).toEqual(['1990', '1957']);
		expect(feed.past[1]).toMatchObject({ title: 'Weihnachtskonzert', date: '1957-12', dateText: 'Dezember 1957', location: 'Kirche' });
		expect(feed.past[1].start).toBeUndefined();
	});

	it('names the programme with composers, and nothing about members', () => {
		expect(feed.upcoming[0]).toEqual({
			id: 'herbst',
			slug: 'herbstkonzert-2026',
			title: 'Herbstkonzert',
			date: '2026-11-15',
			dateText: 'Sonntag, 15. November 2026',
			start: '2026-11-15T19:00:00+01:00',
			end: '2026-11-15T21:00:00+01:00',
			allDay: false,
			location: 'Aula',
			orchestras: ['EO'],
			partners: [],
			program: [{ title: 'Eine kleine Nachtmusik', composer: 'Mozart' }, { title: 'Zugabe' }]
		});
	});

	it('makes calendar events of the upcoming ones only', () => {
		const events = feedEventsOf(feed, 'Programm:');
		expect(events.map((e) => e.uid)).toEqual(['herbst@sheetmanagement-public', 'winter@sheetmanagement-public']);
		expect(events[0].description).toBe('Programm:\nMozart: Eine kleine Nachtmusik\nZugabe');
	});
});

describe('concerts with guests', () => {
	const kch = { shortName: 'KCH', name: 'Kammerchor Unna', kind: 'Chor', conductor: 'Anna Müller', website: 'https://kch.example.org', logo: 'https://kch.example.org/logo.png' };
	const shared = {
		...library,
		concertsById: new Map([
			[
				'gemeinsam',
				concert('gemeinsam', {
					event: event('2026-11-22T19:00:00+01:00', false) as LibraryConcert['event'],
					orchestras: ['EO'],
					partners: [kch],
					organizer: kch,
					program: [
						{ title: 'Eine kleine Nachtmusik', pieceId: 'p1', orchestra: 'EO' },
						{ title: 'Abendlied', composer: 'Josef Rheinberger', orchestra: 'KCH' },
						{ title: 'Halleluja', orchestra: 'EO, KCH' }
					]
				})
			]
		])
	} as unknown as Library;
	const feed = publicFeed(shared, new Set(['gemeinsam']));

	it('names the guests, who plays what, and who organises it', () => {
		const [gemeinsam] = feed.upcoming;
		expect(gemeinsam.partners).toEqual([kch]);
		expect(gemeinsam.organizer).toEqual({ name: 'Kammerchor Unna', website: 'https://kch.example.org' });
		expect(gemeinsam.program).toEqual([
			{ title: 'Eine kleine Nachtmusik', composer: 'Mozart', orchestra: 'EO' },
			{ title: 'Abendlied', composer: 'Josef Rheinberger', orchestra: 'KCH' },
			{ title: 'Halleluja', orchestra: 'EO, KCH' }
		]);
	});

	it('says who plays with us in calendar apps', () => {
		const [gemeinsam] = feedEventsOf(feed, 'Programm:', (names) => `mit ${names.join(', ')}`);
		expect(gemeinsam.description?.split('\n')[0]).toBe('mit Kammerchor Unna');
	});
});

describe('slugs', () => {
	it('add the year unless the title has it, and spell out umlauts', () => {
		expect(concertSlug('Herbstkonzert', '2026-11-15')).toBe('herbstkonzert-2026');
		expect(concertSlug('Frühlingskonzert 2026', '2026-04-19')).toBe('fruehlingskonzert-2026');
		expect(concertSlug('Weihnachtskonzert', '1957-12')).toBe('weihnachtskonzert-1957');
		expect(concertSlug('🎻', '')).toBe('konzert');
	});

	it('stay unique in the feed, the oldest keeping the plain one', () => {
		const twice = { ...library, concertsById: new Map(library.concertsById) } as Library;
		twice.concertsById.set('herbst-2', concert('herbst-2', { event: event('2026-11-16T19:00:00+01:00', false) as LibraryConcert['event'] }));
		const slugs = publicFeed(twice, new Set(['herbst-2', 'herbst'])).upcoming.map((c) => [c.id, c.slug]);
		expect(slugs).toEqual([
			['herbst', 'herbstkonzert-2026'],
			['herbst-2', 'herbstkonzert-2026-2']
		]);
	});
});

describe('details for the website', () => {
	const form = (fields: Record<string, string>) => {
		const data = new FormData();
		for (const [name, value] of Object.entries(fields)) data.set(name, value);
		return data;
	};

	it('reads the form, leaving out what is empty', () => {
		expect(readDetails(form({ textDe: ' Mit Solistin ', textEn: '', ticketUrl: 'https://tickets.example.org/herbst', ticketNoteDe: 'Eintritt frei' }))).toEqual({
			details: { text: { de: 'Mit Solistin' }, ticketUrl: 'https://tickets.example.org/herbst', ticketNote: { de: 'Eintritt frei' } },
			badLink: false
		});
		expect(readDetails(form({}))).toEqual({ details: {}, badLink: false });
	});

	it('refuses ticket links that are not http(s)', () => {
		expect(readDetails(form({ ticketUrl: 'javascript:alert(1)' }))).toEqual({ details: {}, badLink: true });
	});

	it('are stored per concert and go into the feed', async () => {
		await setPublicDetails('herbst', { text: { de: 'Mit Solistin', en: 'With a soloist' }, ticketNote: { de: 'Eintritt frei' } });
		await setPublicDetails('winter', { ticketUrl: 'https://tickets.example.org' });
		await setPublicDetails('winter', {});
		const details = await publicDetails();
		expect([...details.keys()]).toEqual(['herbst']);
		const herbst = publicFeed(library, new Set(['herbst']), details).upcoming[0];
		expect(herbst).toMatchObject({ text: { de: 'Mit Solistin', en: 'With a soloist' }, ticketNote: { de: 'Eintritt frei' } });
		expect(herbst.ticketUrl).toBeUndefined();
	});
});

describe('publishing', () => {
	it('keeps the published ids in the store', async () => {
		await setPublished('herbst', true);
		await setPublished('1957', true);
		await setPublished('herbst', false);
		expect([...(await publishedIds())]).toEqual(['1957']);
	});
});

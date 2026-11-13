import { describe, expect, it, vi } from 'vitest';
import { findPicture, isWikimediaImage, pictureQueries, plain, score, shownPictures, sightsQuery, smaller, type Candidate } from './trip-picture.ts';

vi.mock('#lib/config/index.ts', () => ({ config: { locale: 'de-DE' } }));

const sight = (extra: Partial<Candidate> = {}): Candidate => ({ title: 'Dom', file: 'Dom.jpg', links: 80, km: 0.5, town: false, ...extra });
const photo = { width: 4000, height: 2600, categories: '' };

/** Wikidata and Commons as far as the lookup asks them, around Köln. */
function wikimedia() {
	return vi.fn(async (url: string) => {
		const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
		const row = (title: string, file: string, links: number, km: number, town = false) => ({
			item: { value: `http://www.wikidata.org/entity/${title}` },
			itemLabel: { value: title },
			image: { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}` },
			links: { value: String(links) },
			dist: { value: String(km) },
			town: { value: String(town) }
		});
		if (url.startsWith('https://query.wikidata.org/')) {
			return reply({
				results: {
					bindings: [
						row('Köln', 'Köln Luftbild.jpg', 200, 1, true),
						row('Kamen', 'Kamen Markt.jpg', 60, 4.5, true),
						row('Kölner Dom', 'Kölner Dom von Osten.jpg', 86, 0.6),
						row('Kölner Dom', 'Kölner Dom von Osten.jpg', 86, 0.6),
						row('Lanxess Arena', 'Arena.jpg', 31, 2),
						row('Wappen', 'Wappen.svg', 90, 1)
					]
				}
			});
		}
		const info = (title: string, width: number, height: number, categories = '') => ({
			title: `File:${title}`,
			imageinfo: [
				{
					thumburl: `https://thumb.wikimedia.org/wikipedia/commons/thumb/x/xy/${encodeURIComponent(title)}/1920px-${encodeURIComponent(title)}?utm_source=commons.wikimedia.org`,
					descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
					width,
					height,
					extmetadata: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, Categories: { value: categories } }
				}
			]
		});
		return reply({
			query: {
				pages: [
					info('Köln Luftbild.jpg', 5000, 3000, 'Aerial photographs of Cologne'),
					info('Kamen Markt.jpg', 4000, 2600, 'Quality images'),
					info('Kölner Dom von Osten.jpg', 4589, 7220),
					info('Arena.jpg', 783, 430)
				]
			}
		});
	});
}

describe('the picture of a trip’s place', () => {
	it('looks for a picture of each place, the organisers’ words instead of the first, none when switched off', () => {
		const stop = (place: string) => ({ place, from: '', until: '' });
		const stops = [stop('Peking'), stop('Xi’an'), stop('Shanghai'), stop('Peking')];
		expect(pictureQueries({ stops })).toEqual(['Peking', 'Xi’an', 'Shanghai']);
		expect(pictureQueries({ stops, pictureSearch: 'Verbotene Stadt' })).toEqual(['Verbotene Stadt', 'Xi’an', 'Shanghai', 'Peking']);
		expect(pictureQueries({ stops, noPicture: true })).toEqual([]);
		expect(pictureQueries({ stops: [] })).toEqual([]);
	});

	it('shows the pictures found in the order of the places, the same one once', () => {
		const picture = (url: string) => ({ url, page: url, title: url });
		const stops = ['Peking', 'Xi’an', 'Shanghai', 'Suzhou'].map((place) => ({ place, from: '', until: '' }));
		const shown = shownPictures({ stops, pictures: { Peking: picture('a'), 'Xi’an': null, Shanghai: picture('b'), Suzhou: picture('b') } });
		expect(shown.map(({ place, picture: one }) => [place, one.url])).toEqual([
			['Peking', 'a'],
			['Shanghai', 'b']
		]);
	});

	it('asks Wikidata for things with a photo around the place, the most-linked first, no stations', () => {
		const query = sightsQuery(50.94, 6.96);
		expect(query).toContain('Point(6.96 50.94)');
		expect(query).toContain('ORDER BY DESC(?links)');
		expect(query).toContain('wd:Q55488');
	});

	it('weighs fame and nearness, a wide and quality photo, never one from above', () => {
		const base = score(sight(), photo)!;
		expect(score(sight({ links: 10 }), photo)!).toBeLessThan(base);
		expect(score(sight({ km: 4 }), photo)!).toBeLessThan(base);
		expect(score(sight(), { ...photo, categories: 'Quality images of Cologne' })!).toBeGreaterThan(base);
		expect(score(sight(), { ...photo, categories: 'Aerial photographs of Cologne' })!).toBeLessThan(base - 1);
		expect(score(sight(), { width: 2600, height: 4000, categories: '' })!).toBeLessThan(base);
		// Not usable: small, a drawing, very tall, a station, no photo at all.
		expect(score(sight(), { width: 900, height: 600, categories: '' })).toBeNull();
		expect(score(sight({ file: 'Wappen.svg' }), photo)).toBeNull();
		expect(score(sight(), { width: 1500, height: 3000, categories: '' })).toBeNull();
		expect(score(sight({ title: 'Köln Hauptbahnhof' }), photo)).toBeNull();
		expect(score(sight(), undefined)).toBeNull();
	});

	it('picks the best-known sight with a good photo, with the credit Commons asks for', async () => {
		const fetcher = wikimedia();
		const picture = await findPicture({ lat: 50.94, lon: 6.96 }, fetcher);
		expect(picture).toEqual({
			url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/x/xy/K%C3%B6lner%20Dom%20von%20Osten.jpg/1920px-K%C3%B6lner%20Dom%20von%20Osten.jpg',
			page: 'https://commons.wikimedia.org/wiki/File:K%C3%B6lner%20Dom%20von%20Osten.jpg',
			title: 'Kölner Dom',
			artist: 'Jane & Co',
			license: 'CC BY-SA 4.0',
			tall: true
		});
		// One question to Wikidata, one to Commons for all photos.
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(decodeURIComponent(String(fetcher.mock.calls[1][0]))).not.toContain('Kamen');
	});

	it('finds nothing when there is nothing, and serves only Commons’ images', async () => {
		const empty = vi.fn(async () => new Response(JSON.stringify({ results: { bindings: [] } })));
		expect(await findPicture({ lat: 0, lon: 0 }, empty)).toBeNull();
		expect(plain('<b>A</b>&nbsp;B')).toBe('A B');
		expect(plain('&amp;lt;b&amp;gt; &lt;script&gt;x')).toBe('&lt;b&gt; scriptx');
		expect(plain('<scr<script>ipt>alert(1)')).toBe('iptalert(1)');
		expect([isWikimediaImage('https://upload.wikimedia.org/a.jpg'), isWikimediaImage('https://evil.example/a.jpg'), isWikimediaImage('http://thumb.wikimedia.org/a.jpg'), isWikimediaImage('nonsense')]).toEqual([true, false, false, false]);
		expect(smaller('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1920px-X.jpg')).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg');
		expect(smaller('https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg')).toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg');
	});
});

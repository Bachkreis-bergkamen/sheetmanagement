import { describe, expect, it } from 'vitest';
import { searchWikipedia, webSearchUrl, wikiQuery, wikipediaArticle, WikipediaBusyError } from './wikipedia.ts';

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('wikipedia', () => {
	it('searches with the title and the composer’s last name', () => {
		expect(wikiQuery('Egmont-Ouvertüre', 'Ludwig van Beethoven')).toBe('Egmont-Ouvertüre Beethoven');
		expect(wikiQuery('Musical-Highlights', 'Lloyd Webber, Schönberg')).toBe('Musical-Highlights Webber');
		expect(wikiQuery(' Bolero ')).toBe('Bolero');
	});

	it('finds articles in the first language, else in the second', async () => {
		const asked: string[] = [];
		const fetchImpl = (async (url: string) => {
			asked.push(new URL(url).hostname);
			return url.startsWith('https://de.')
				? respond({ batchcomplete: true })
				: respond({
						query: {
							pages: [
								{ title: 'Egmont (Goethe)', index: 2 },
								{ title: 'Egmont (Beethoven)', index: 1, description: 'incidental music by Beethoven' }
							]
						}
					});
		}) as typeof fetch;
		// In the search's order, with the description as plain text.
		expect(await searchWikipedia('Egmont', fetchImpl)).toEqual([
			{ title: 'Egmont (Beethoven)', description: 'incidental music by Beethoven', language: 'en' },
			{ title: 'Egmont (Goethe)', description: '', language: 'en' }
		]);
		expect(asked).toEqual(['de.wikipedia.org', 'en.wikipedia.org']);
	});

	it('reads the introduction with its link, not a disambiguation page', async () => {
		const page = { title: 'Egmont (Beethoven)', extract: 'Erster Absatz.\nZweiter Absatz.\n', fullurl: 'https://de.wikipedia.org/wiki/Egmont_(Beethoven)' };
		expect(await wikipediaArticle('Egmont', 'de', (async () => respond({ query: { pages: [page] } })) as typeof fetch)).toEqual({
			title: 'Egmont (Beethoven)',
			text: 'Erster Absatz.\n\nZweiter Absatz.',
			url: 'https://de.wikipedia.org/wiki/Egmont_(Beethoven)',
			language: 'de'
		});
		const disambiguation = { ...page, pageprops: { disambiguation: '' } };
		expect(await wikipediaArticle('Egmont', 'de', (async () => respond({ query: { pages: [disambiguation] } })) as typeof fetch)).toBeUndefined();
		expect(await wikipediaArticle('Nix', 'de', (async () => respond({ query: { pages: [{ title: 'Nix', missing: true }] } })) as typeof fetch)).toBeUndefined();
	});

	it('says when Wikipedia asks for a pause', async () => {
		await expect(searchWikipedia('Egmont', (async () => respond({}, 429)) as typeof fetch)).rejects.toBeInstanceOf(WikipediaBusyError);
	});

	it('builds a web search for the rest', () => {
		expect(webSearchUrl('Egmont', 'Beethoven')).toBe('https://www.google.com/search?q=Egmont+Beethoven');
	});
});

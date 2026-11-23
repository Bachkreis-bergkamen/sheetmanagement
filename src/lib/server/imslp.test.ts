import { describe, expect, it } from 'vitest';
import { findOnImslp } from './imslp.ts';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const PIECE = { title: 'Brandenburgisches Konzert Nr. 3', composer: 'Johann Sebastian Bach', catalogue: 'BWV 1048' };

describe('the IMSLP lookup (#198)', () => {
	it('finds the work through the search, follows a redirect and reads the parts', async () => {
		const asked: URLSearchParams[] = [];
		const fetchImpl = (async (input: RequestInfo | URL) => {
			const params = new URL(String(input)).searchParams;
			asked.push(params);
			if (params.get('list') === 'search') return json({ query: { search: [{ title: 'Brandenburg Concerto No.3, BWV 1048 (Bach, Johann Sebastian)' }] } });
			return json({ parse: { title: 'Brandenburg Concerto No.3 in G major, BWV 1048 (Bach, Johann Sebastian)', wikitext: { '*': '===Parts===\n|File Description 1=Violin 1\n|File Description 2=Complete Score\n' } } });
		}) as typeof fetch;
		const work = await findOnImslp(PIECE, fetchImpl);
		expect(work).toEqual({
			title: 'Brandenburg Concerto No.3 in G major, BWV 1048 (Bach, Johann Sebastian)',
			url: 'https://imslp.org/wiki/Brandenburg_Concerto_No.3_in_G_major%2C_BWV_1048_(Bach%2C_Johann_Sebastian)',
			parts: ['Violin 1']
		});
		// The catalogue number first: it finds the work whatever the title.
		expect(asked[0].get('srsearch')).toBe('BWV 1048 Bach');
		expect(asked[1].get('redirects')).toBe('1');
	});

	it('gives nothing rather than another work, after trying each search, and says when IMSLP is down', async () => {
		let searches = 0;
		const other = (async () => (searches++, json({ query: { search: [{ title: 'Something, BWV 1048 (Busoni, Ferruccio)' }] } }))) as typeof fetch;
		expect(await findOnImslp(PIECE, other)).toBeNull();
		expect(searches).toBe(3);
		const down = (async () => new Response('busy', { status: 503 })) as typeof fetch;
		await expect(findOnImslp(PIECE, down)).rejects.toThrow('503');
	});
});

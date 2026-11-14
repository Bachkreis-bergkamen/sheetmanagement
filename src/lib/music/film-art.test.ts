import { describe, expect, it } from 'vitest';
import { isLogoFile, candidatePicture, candidateQuery, candidateStill, composedBy, commonsFile, FILM_KINDS, filmQuery, iconTerms, iconUrl, MUSICAL_KINDS, pickIcon, rankCandidates, readCandidates, type Candidate } from './film-art.ts';

describe('film pictures (#312)', () => {
	it('finds the film in an arrangement title', () => {
		expect(filmQuery('Themes from Jurassic Park')).toBe('Jurassic Park');
		expect(filmQuery('Der König der Löwen (Medley)')).toBe('Der König der Löwen');
		expect(filmQuery('Music from The Lion King')).toBe('The Lion King');
		expect(filmQuery('Star Wars – Main Title')).toBe('Star Wars');
		expect(filmQuery('Pirates of the Caribbean: Highlights')).toBe('Pirates of the Caribbean');
		expect(filmQuery('Star Wars Suite for Orchestra')).toBe('Star Wars');
		expect(filmQuery('Themes from 007')).toBe('007');
		expect(filmQuery('Medley')).toBe('');
	});

	it('drops phrases of the arrangement before a colon or a dash (#319)', () => {
		expect(filmQuery('Main Title: Interstellar')).toBe('Interstellar');
		expect(filmQuery('Main Theme – How to Train Your Dragon')).toBe('How to Train Your Dragon');
		expect(filmQuery('Star Wars: The Force Awakens')).toBe('Star Wars: The Force Awakens');
		expect(filmQuery('Highlights aus Grease')).toBe('Grease');
	});

	it('asks only for the few facts a picture needs, for valid ids (#318)', () => {
		const query = candidateQuery(['Q6074', 'Q1; DROP', 'Q384426']);
		expect(query).toContain('VALUES ?item { wd:Q6074 wd:Q384426 }');
		expect(query).not.toContain('DROP');
	});

	it('reads the query rows', () => {
		const [film] = readCandidates([
			{
				item: { value: 'http://www.wikidata.org/entity/Q6074' },
				kinds: { value: 'http://www.wikidata.org/entity/Q11424' },
				labels: { value: 'en:Star Wars: Episode VII – The Force Awakens|de:Star Wars: Das Erwachen der Macht' },
				logo: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Star%20Wars%20The%20Force%20Awakens.jpg' },
				subjects: { value: 'space|lightsaber' },
				fame: { value: '70' }
			},
			{ item: { value: 'not an item' } }
		]);
		expect(film).toEqual({
			id: 'Q6074',
			kinds: ['Q11424'],
			labels: { en: 'Star Wars: Episode VII – The Force Awakens', de: 'Star Wars: Das Erwachen der Macht' },
			logo: 'Star Wars The Force Awakens.jpg',
			seriesLogo: undefined,
			franchiseLogo: undefined,
			subjects: ['space', 'lightsaber'],
			fame: 70,
			poster: undefined,
			photo: undefined,
			composers: []
		});
		expect(commonsFile(undefined)).toBeUndefined();
	});

	it('takes hits named like the query, in the order of the classes, else only the first hit', () => {
		const hit = (id: string, label: string, kinds: string[], logo?: string): Candidate => ({ id, kinds, labels: { mul: label }, logo, subjects: [] });
		const remake = hit('Q118904382', 'How to Train Your Dragon', ['Q11424']);
		const franchise = hit('Q3715071', 'How to Train Your Dragon', ['Q196600']);
		const animated = hit('Q373096', 'How to Train Your Dragon', ['Q202866'], 'How to Train Your Dragon logo.svg');
		const other = hit('Q1', 'How to Train Your Dragon 2', ['Q11424'], 'Other.svg');
		const ranked = rankCandidates('How to train your dragon', ['Q3715071', 'Q1', 'Q118904382', 'Q373096'], [franchise, other, remake, animated], FILM_KINDS);
		expect(ranked.map((each) => each.id)).toEqual(['Q118904382', 'Q373096', 'Q3715071']);
		expect(ranked.map((each) => candidatePicture(each)).find(Boolean)).toBe('How to Train Your Dragon logo.svg');
		expect(rankCandidates('Interstellar', ['Q2', 'Q3'], [hit('Q2', 'Interstellar War', ['Q11424']), hit('Q3', 'Interstellar Ella', ['Q5398426'])], FILM_KINDS).map((each) => each.id)).toEqual(['Q2']);
	});

	it("takes the series' logo before anything else", () => {
		const film: Candidate = { id: 'Q102244', kinds: ['Q11424'], labels: { en: 'Harry Potter and the Chamber of Secrets' }, seriesLogo: 'Harry Potter wordmark.svg', franchiseLogo: 'Wizarding World logo.svg', subjects: [] };
		expect(candidatePicture(film)).toBe('Harry Potter wordmark.svg');
		expect(candidatePicture({ ...film, seriesLogo: undefined })).toBeUndefined();
	});

	it("falls back to a poster, and for a musical to a photo of its production", () => {
		const show: Candidate = { id: 'Q19320959', kinds: ['Q58483083'], labels: { en: 'Hamilton' }, photo: 'Lin-Manuel Miranda in Hamilton.jpg', subjects: [] };
		expect(candidateStill(show)).toBe('Lin-Manuel Miranda in Hamilton.jpg');
		expect(candidateStill({ ...show, poster: 'Hamilton poster.jpg' })).toBe('Hamilton poster.jpg');
		// A film's image is a still or an actor: only its poster counts.
		const film: Candidate = { id: 'Q188850', kinds: ['Q11424'], labels: { en: 'Mamma Mia!' }, photo: 'ABBA 2008.jpg', subjects: [] };
		expect(candidateStill(film)).toBeUndefined();
		expect(candidateStill({ ...film, poster: 'Phantom of the opera 1925 poster.jpg' })).toBe('Phantom of the opera 1925 poster.jpg');
	});

	it("knows a musical by its composers' surnames, so a namesake piece doesn't get its picture", () => {
		const cats: Candidate = { id: 'Q337097', kinds: ['Q58483083'], labels: { en: 'Cats' }, composers: ['Andrew Lloyd Webber'], subjects: [] };
		expect(composedBy(cats, 'Andrew Lloyd Webber')).toBe(true);
		expect(composedBy(cats, 'Lloyd Webber, arr. Calvin Custer')).toBe(true);
		expect(composedBy(cats, 'Domenico Scarlatti')).toBe(false);
		expect(composedBy(cats, undefined)).toBe(false);
		expect(composedBy({ ...cats, composers: undefined }, 'Andrew Lloyd Webber')).toBe(false);
	});

	it('matches names without their article, and the better known of two works of one name', () => {
		const hit = (id: string, label: string, kinds: string[], fame = 0): Candidate => ({ id, kinds, labels: { de: label }, subjects: [], fame });
		const phantom = hit('Q1', 'Das Phantom der Oper', ['Q2743']);
		expect(rankCandidates('Phantom der Oper', ['Q1'], [phantom], FILM_KINDS)).toEqual([phantom]);
		const tv = hit('Q2', 'The Avengers', ['Q11424'], 20);
		const marvel = hit('Q3', 'The Avengers', ['Q11424'], 80);
		expect(rankCandidates('Avengers', ['Q2', 'Q3'], [tv, marvel], FILM_KINDS).map((each) => each.id)).toEqual(['Q3', 'Q2']);
	});

	it("takes the search's first hit only if it has all the title's words", () => {
		const cats: Candidate = { id: 'Q4', kinds: ['Q2743'], labels: { en: 'Cats' }, subjects: [] };
		expect(rankCandidates('Andrew Lloyd Webber', ['Q4'], [cats], FILM_KINDS)).toEqual([]);
	});

	it('finds a logo file on Commons only when it is named for the work', () => {
		expect(isLogoFile('File:007 logo (cropped).jpg', '007')).toBe(true);
		expect(isLogoFile('File:The Lord of the Rings logo.svg', 'The Lord of the Rings')).toBe(true);
		expect(isLogoFile('File:Evita Soundtrack Logo.png', 'Evita')).toBe(true);
		expect(isLogoFile('File:Logo skyfall.svg', 'Skyfall')).toBe(true);
		expect(isLogoFile('File:Thunderball-logo.svg', '007')).toBe(false);
		expect(isLogoFile('File:Logo EVA Air.svg', 'Evita')).toBe(false);
		expect(isLogoFile('File:Walk of Fame Europe logo.png', 'Fame')).toBe(false);
		expect(isLogoFile('File:Evita at the Adelphi.jpg', 'Evita')).toBe(false);
	});

	it('looks for icons of things, not of themes', () => {
		expect(iconTerms(['lion', 'parent–child relationship', 'friendship', 'sea piracy', 'Dinosaur'])).toEqual(['lion', 'sea piracy', 'dinosaur']);
	});

	it('takes icons only from the allowed open sets', () => {
		expect(pickIcon(['game-icons:lion', 'fluent-emoji-flat:lion', 'noto:lion'])).toBe('noto:lion');
		expect(pickIcon(['twemoji:lion'])).toBeUndefined();
		expect(iconUrl('noto:lion')).toBe('https://api.iconify.design/noto/lion.svg');
		expect(iconUrl('evil:../x')).toBeNull();
		expect(iconUrl('noto:../x')).toBeNull();
	});
});

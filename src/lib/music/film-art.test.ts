import { describe, expect, it } from 'vitest';
import { filmQuery, iconTerms, iconUrl, logoFile, pickIcon, subjectIds } from './film-art.ts';

describe('film pictures (#312)', () => {
	it('finds the film in an arrangement title', () => {
		expect(filmQuery('Themes from Jurassic Park')).toBe('Jurassic Park');
		expect(filmQuery('Der König der Löwen (Medley)')).toBe('Der König der Löwen');
		expect(filmQuery('Music from The Lion King')).toBe('The Lion King');
		expect(filmQuery('Star Wars – Main Title')).toBe('Star Wars');
		expect(filmQuery('Pirates of the Caribbean: Highlights')).toBe('Pirates of the Caribbean');
		expect(filmQuery('Star Wars Suite for Orchestra')).toBe('Star Wars');
		expect(filmQuery('Medley')).toBe('');
	});

	it('reads the logo and the subjects of a film', () => {
		const entity = { claims: { P154: [{ mainsnak: { datavalue: { value: 'Star Wars Logo.svg' } } }], P921: [{ mainsnak: { datavalue: { value: { id: 'Q140' } } } }, { mainsnak: {} }] } };
		expect(logoFile(entity)).toBe('Star Wars Logo.svg');
		expect(subjectIds(entity)).toEqual(['Q140']);
		expect(logoFile({ claims: {} })).toBeUndefined();
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

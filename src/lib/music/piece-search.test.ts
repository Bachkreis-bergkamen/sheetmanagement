import { describe, expect, it } from 'vitest';
import { excerpt, findPiece, partInstruments, type SearchablePiece } from './piece-search.ts';
import { searchText } from './text.ts';

const words = (query: string) => searchText(query).split(/\s+/).filter(Boolean);

const medley: SearchablePiece = {
	search: searchText('James Bond Medley', 'Barry'),
	instruments: ['Trompete', 'Bariton', 'Viola'],
	notes: ['Enthält: From Russia with Love, Goldfinger, Thunderball, Live and Let Die und Skyfall', 'Sprung von Takt 40 nach 88']
};

describe('piece search', () => {
	it('finds by the title fields without a reason to show', () => {
		expect(findPiece(medley, words('bond barry'))).toEqual({ instruments: [] });
		expect(findPiece(medley, [])).toEqual({ instruments: [] });
	});

	it('finds by an instrument, its label and its other spellings', () => {
		expect(findPiece(medley, words('Bariton'))).toEqual({ instruments: ['Bariton'] });
		expect(findPiece(medley, words('euphonium'))).toEqual({ instruments: ['Bariton'] });
		expect(findPiece(medley, words('Bratsche'))).toEqual({ instruments: ['Bratsche'] });
		expect(findPiece(medley, words('Posaune'))).toBeNull();
	});

	it('finds by a word in the notes and shows where it is', () => {
		expect(findPiece(medley, words('goldfinger'))).toEqual({
			instruments: [],
			note: expect.stringContaining('Goldfinger')
		});
		expect(findPiece(medley, words('Takt 40'))?.note).toBe('Sprung von Takt 40 nach 88');
	});

	it('needs every word, from wherever it comes', () => {
		expect(findPiece(medley, words('bond bariton skyfall'))).toEqual({ instruments: ['Bariton'], note: expect.stringContaining('Skyfall') });
		expect(findPiece(medley, words('bond tuba'))).toBeNull();
	});

	it('lists each instrument with a part once', () => {
		expect(partInstruments([{ instruments: ['Horn'] }, { instruments: ['Horn', 'Tuba'] }, { instruments: [] }])).toEqual(['Horn', 'Tuba']);
	});
});

describe('note excerpt', () => {
	it('keeps short notes whole', () => {
		expect(excerpt('Goldfinger, Skyfall', 'skyfall')).toBe('Goldfinger, Skyfall');
	});

	it('cuts long notes at whole words around the match', () => {
		const text = 'Enthält: From Russia with Love, Goldfinger, Thunderball, Live and Let Die, Moonraker und Skyfall';
		const cut = excerpt(text, 'thunderball', 15);
		expect(cut).toMatch(/^….*Thunderball.*…$/);
		expect(cut).not.toMatch(/… |\s…$/);
		expect(text).toContain(cut.slice(1, -1));
	});

	it('finds words written with accents or ß', () => {
		expect(excerpt('Straße nach Café Müller', 'cafe', 5)).toBe('…nach Café…');
	});
});

import { describe, expect, it } from 'vitest';
import { difficultyOptions, genreOptions, lengthOf, pieceGenres } from './piece-filters.ts';

const genres = ['Barock', 'Klassik', 'Romantik', 'Filmmusik', 'Pop', 'Weihnachten'];

describe('pieceGenres', () => {
	it('reads "Genre" as a list, in the configured spelling', () => {
		expect(pieceGenres({ genre: 'romantik, Filmmusik' }, genres)).toEqual(['Romantik', 'Filmmusik']);
		expect(pieceGenres({ genre: 'Tango' }, genres)).toEqual(['Tango']);
	});

	it('counts a Christmas folder as Weihnachten, once, and keeps other folders as they are', () => {
		expect(pieceGenres({ category: 'Weihnachtsstücke' }, genres)).toEqual(['Weihnachten']);
		expect(pieceGenres({ genre: 'Weihnachten', category: 'Weihnachtsstücke' }, genres)).toEqual(['Weihnachten']);
		expect(pieceGenres({ genre: 'Barock', category: 'Zugaben' }, genres)).toEqual(['Barock', 'Zugaben']);
		expect(pieceGenres({}, genres)).toEqual([]);
	});
});

describe('genreOptions', () => {
	it('lists each genre once: the configured order first, then the rest by name', () => {
		expect(genreOptions(['Weihnachten', 'Zugaben', 'Barock', 'barock', 'Tango', 'Romantik'], genres)).toEqual(['Barock', 'Romantik', 'Weihnachten', 'Tango', 'Zugaben']);
	});
});

describe('length and difficulty', () => {
	it('puts a piece in a length band by its "Dauer"', () => {
		expect([undefined, 0, 240, 300, 301, 600, 900].map(lengthOf)).toEqual([undefined, undefined, 'kurz', 'kurz', 'mittel', 'mittel', 'lang']);
	});

	it('orders difficulties from easy to hard, words or numbers', () => {
		expect(difficultyOptions(['schwer', 'leicht', 'mittel', 'leicht', ' '])).toEqual(['leicht', 'mittel', 'schwer']);
		expect(difficultyOptions(['3', '1', '2,5'])).toEqual(['1', '2,5', '3']);
	});
});

import { describe, expect, it } from 'vitest';
import { composerLine, contentsComposers, manyComposers, parseContents, shortComposers, tidyContents } from './contents.ts';

describe('parseContents', () => {
	it('reads a song per line, its composer after a dash or in brackets', () => {
		expect(parseContents('Habanera – Bizet\nBarcarole (Offenbach)\n\nStar Wars - Main Title - John Williams\nOhne Komponist')).toEqual([
			{ title: 'Habanera', composer: 'Bizet' },
			{ title: 'Barcarole', composer: 'Offenbach' },
			{ title: 'Star Wars - Main Title', composer: 'John Williams' },
			{ title: 'Ohne Komponist' }
		]);
	});

	it('takes one line separated by semicolons, and drops numbers and bullets', () => {
		expect(parseContents('1. Habanera – Bizet; 2) Barcarole – Offenbach')).toEqual([
			{ title: 'Habanera', composer: 'Bizet' },
			{ title: 'Barcarole', composer: 'Offenbach' }
		]);
		expect(parseContents('- Memory – Lloyd Webber')).toEqual([{ title: 'Memory', composer: 'Lloyd Webber' }]);
	});

	it('keeps hyphens inside words', () => {
		expect(parseContents('Can-Can')).toEqual([{ title: 'Can-Can' }]);
	});
});

describe('contentsComposers', () => {
	it('lists each composer once, also those writing together', () => {
		expect(contentsComposers('A – Bizet\nB – Offenbach\nC – Bizet\nD – Lennon, McCartney')).toBe('Bizet, Offenbach, Lennon, McCartney');
	});

	it('is undefined without composers', () => {
		expect(contentsComposers('A\nB')).toBeUndefined();
		expect(contentsComposers(undefined)).toBeUndefined();
	});
});

describe('composerLine', () => {
	it('shows two names in full', () => {
		expect(composerLine('Mozart, Haydn')).toBe('Mozart, Haydn');
		expect(shortComposers('Mozart, Haydn').more).toBe(0);
		expect(manyComposers('Mozart, Haydn')).toBe(false);
	});

	it('shortens more to the first two and "und mehr"', () => {
		expect(composerLine('Bizet, Offenbach, Strauss, Lehár')).toBe('Bizet, Offenbach und mehr');
		expect(shortComposers('Bizet, Offenbach, Strauss, Lehár')).toEqual({ names: ['Bizet', 'Offenbach'], more: 2 });
		expect(manyComposers('Bizet, Offenbach, Strauss')).toBe(true);
	});

	it('is undefined without a composer', () => {
		expect(composerLine('')).toBeUndefined();
	});
});

it('tidyContents drops empty lines and spaces', () => {
	expect(tidyContents('  A – Bizet \r\n\r\n B – Offenbach\n')).toBe('A – Bizet\nB – Offenbach');
});

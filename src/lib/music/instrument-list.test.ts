import { describe, expect, it } from 'vitest';
import { bachkreis } from '#lib/config/presets/bachkreis.ts';
import { foldFamily, searchInstruments } from './instrument-list.ts';

const info = new Map(bachkreis.instruments.map((instrument) => [instrument.name, instrument]));
const names = bachkreis.instruments.map((instrument) => instrument.name);
const common = new Set(bachkreis.instruments.filter((instrument) => instrument.common).map((instrument) => instrument.name));
const search = (query: string) => searchInstruments(names, query, info, common);

describe('searchInstruments', () => {
	it('puts the usual instruments first, not the many small percussion ones', () => {
		expect(search('b').slice(0, 2)).toEqual(['Bassklarinette', 'Viola']);
		const k = search('k');
		expect(k.indexOf('Kontrabass')).toBeLessThan(k.indexOf('Kuhglocke'));
		expect(k.indexOf('Klarinette')).toBeLessThan(k.indexOf('Snare Drum'));
		expect(search('pau')[0]).toBe('Pauke');
	});

	it('finds rarer ones by their own name and other spellings', () => {
		expect(search('tri')[0]).toBe('Triangel');
		expect(search('snare')[0]).toBe('Snare Drum');
		expect(search('kleine trommel')[0]).toBe('Snare Drum');
		expect(search('vibes')).toEqual(['Vibraphon']);
		expect(search('becken').slice(0, 2)).toEqual(['Becken', 'Crash-Becken']);
	});

	it('lists everything when nothing is typed', () => {
		expect(search('  ')).toEqual(names);
	});
});

describe('foldFamily', () => {
	const family = (f: string) => bachkreis.instruments.filter((instrument) => instrument.family === f).map((instrument) => instrument.name);

	it('folds the rare percussion away, but not what is chosen', () => {
		const { shown, folded } = foldFamily(family('schlagwerk'), common, (name) => name === 'Triangel');
		expect([...shown].sort()).toEqual(['Mallet Percussion', 'Pauke', 'Schlagwerk', 'Triangel']);
		expect(folded).toContain('Marimba');
	});

	it('folds even two rare ones, but a single one stays; one without usual instruments folds entirely', () => {
		expect(foldFamily(family('blech'), common, () => false).folded).toContain('Bariton');
		expect(foldFamily(['Geige', 'E-Bass'], common, () => false).folded).toEqual([]);
		expect(foldFamily(family('gesang'), common, () => false).shown).toEqual([]);
		expect(foldFamily(family('gesang'), common, (name) => name === 'Chor').shown).toEqual(['Chor']);
	});

	it('shows the usual winds: bass clarinet and alto sax', () => {
		const { shown } = foldFamily(family('holz'), common, () => false);
		expect(shown).toEqual(expect.arrayContaining(['Bassklarinette', 'Alt-Saxophon']));
	});
});

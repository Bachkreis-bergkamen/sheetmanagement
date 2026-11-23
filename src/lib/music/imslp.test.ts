import { describe, expect, it } from 'vitest';
import { config } from '#lib/config/index.ts';
import { hasCompleteParts, imslpCatalogue, mayBeOnImslp, searchQueries, imslpHas, imslpVoices, partDescriptions, pickWork, searchUrl, searchWords, surname, workUrl } from './imslp.ts';

/** Shaped like IMSLP's page of Brandenburg Concerto No.3, shortened. */
const WIKITEXT = `{{#fte:imslppage
|*****FILES*****=
===Full Scores===
{{#fte:imslpfile
|File Name 1=PMLP82079-Bach_BWV1048.pdf
|File Description 1=Complete Score
}}
===Parts===
{{#fte:imslpfile
|File Name 1=PMLP82079-v1.pdf
|File Description 1=Violin 1
|File Description 2=Violin 2
|File Description 3=Viola 1
|File Description 4=Cello 1
|File Description 5=Violone (Double Bass)
|File Description 6=Continuo (Harpsichord)
}}
{{#fte:imslpfile
|File Description 1=Complete Parts
|File Description 2=Engraving files (.mxl)
}}
===Arrangements and Transcriptions===
====Complete====
{{#fte:imslpfile
|File Description 1=Clarinet 1 (B{{flat}})
}}
}}`;

const BACH = { title: 'Brandenburgisches Konzert Nr. 3', composer: 'Johann Sebastian Bach', catalogue: 'BWV 1048' };
const results = [
	{ title: 'Brandenburg Concerto No.3 in G major, BWV 1048 (Bach, Johann Sebastian)' },
	{ title: 'Brandenburg Concerto No.3, BWV 10480 (Bach, Johann Sebastian)' },
	{ title: 'Brandenburg Concerto No.3 in G major, BWV 1048 (Busoni, Ferruccio)' }
];

describe('IMSLP (#198)', () => {
	it('is offered only where IMSLP can help: old music, not film, musicals, jazz, pop or arrangements', () => {
		expect(mayBeOnImslp({ composer: 'Bach', genre: 'Barock' })).toBe(true);
		expect(mayBeOnImslp({ composer: 'Händel', genre: 'Weihnachten' })).toBe(true);
		expect(mayBeOnImslp({ composer: 'Beethoven' })).toBe(true);
		expect(mayBeOnImslp({ composer: 'John Williams', genre: 'Filmmusik' })).toBe(false);
		expect(mayBeOnImslp({ composer: 'Andrew Lloyd Webber', genre: 'Musical' })).toBe(false);
		expect(mayBeOnImslp({ composer: 'Queen', genre: 'Pop, Rock' })).toBe(false);
		expect(mayBeOnImslp({ composer: 'Glenn Miller', genre: 'Jazz' })).toBe(false);
		expect(mayBeOnImslp({ composer: 'Beethoven', arranger: 'Sebastian Schmidt' })).toBe(false);
		expect(mayBeOnImslp({ composer: '', genre: 'Klassik' })).toBe(false);
	});

	it('asks by title, catalogue number and surname', () => {
		expect(surname('Johann Sebastian Bach')).toBe('Bach');
		expect(surname('Bach, Johann Sebastian; Gounod')).toBe('Bach');
		expect(searchWords(BACH)).toBe('Brandenburgisches Konzert Nr. 3 BWV 1048 Bach');
		// Not twice when the title holds it.
		expect(searchWords({ title: 'Orchestersuite Nr. 3, BWV 1068', composer: 'Bach', catalogue: 'BWV 1068' })).toBe('Orchestersuite Nr. 3, BWV 1068 Bach');
		expect(searchUrl(BACH)).toContain('search=Brandenburgisches+Konzert+Nr.+3+BWV+1048+Bach');
		expect(workUrl(results[0].title)).toBe('https://imslp.org/wiki/Brandenburg_Concerto_No.3_in_G_major%2C_BWV_1048_(Bach%2C_Johann_Sebastian)');
	});

	it('writes catalogue numbers as IMSLP does and searches by them first', () => {
		expect(imslpCatalogue('Op. 84')).toBe('Op.84');
		expect(imslpCatalogue('op. 64 Nr. 2')).toBe('Op.64 No.2');
		expect(imslpCatalogue('KV 525')).toBe('K.525');
		expect(imslpCatalogue('BWV 147')).toBe('BWV 147');
		expect(searchQueries({ title: 'Egmont Ouvertüre', composer: 'Ludwig van Beethoven', catalogue: 'Op. 84' })).toEqual([
			'Op.84 Beethoven',
			'Egmont Ouvertüre Op. 84 Beethoven',
			'Egmont Beethoven'
		]);
		// Without a catalogue number: the title, then its own words.
		expect(searchQueries({ title: 'Sinfonie Nr. 9 „Aus der neuen Welt“', composer: 'Dvořák' })).toEqual(['Sinfonie Nr. 9 „Aus der neuen Welt“ Dvořák', 'neuen Welt Dvořák']);
	});

	it('picks the work of the composer with the catalogue number, or none', () => {
		expect(pickWork(results, BACH)).toBe(results[0].title);
		expect(pickWork(results, { ...BACH, catalogue: 'BWV 1049' })).toBeNull();
		expect(pickWork(results, { ...BACH, composer: 'Mozart' })).toBeNull();
		expect(pickWork(results, { ...BACH, composer: undefined })).toBeNull();
		// Without a catalogue number: every longer word of the title.
		expect(pickWork([{ title: 'Eine kleine Nachtmusik, K.525 (Mozart, Wolfgang Amadeus)' }], { title: 'Eine kleine Nachtmusik', composer: 'W. A. Mozart' })).toContain('Nachtmusik');
		expect(pickWork([{ title: 'Serenade No.13, K.525 (Mozart, Wolfgang Amadeus)' }], { title: 'Nachtmusik', composer: 'Mozart', catalogue: 'KV 525' })).toContain('K.525');
	});

	it('reads the parts section only, without scores and engraving files', () => {
		const parts = partDescriptions(WIKITEXT);
		expect(parts).toEqual(['Violin 1', 'Violin 2', 'Viola 1', 'Cello 1', 'Violone (Double Bass)', 'Continuo (Harpsichord)', 'Complete Parts']);
		expect(hasCompleteParts(parts)).toBe(true);
		expect(partDescriptions('no parts here')).toEqual([]);
		// A numbered movement's files are songs or scenes, not instruments.
		expect(partDescriptions('===Parts===\n|File Description 1=1. Lied: Die Trommel gerühret\n|File Description 2=Timpani\n')).toEqual(['Timpani']);
	});

	it('knows which missing parts IMSLP has', () => {
		const available = imslpVoices(['Violin 1', 'Violin 2', 'Viola', 'Clarinet 1 (B♭)'], config);
		const instrument = (english: string) => imslpVoices([english], config)[0]!.instrument;
		const violin = instrument('Violin');
		expect(imslpHas([{ instrument: violin, numbers: [2] }], available)).toBe(true);
		expect(imslpHas([{ instrument: violin, numbers: [3] }], available)).toBe(false);
		// A viola part without a number serves every viola.
		expect(imslpHas([{ instrument: instrument('Viola'), numbers: [2] }], available)).toBe(true);
		expect(imslpHas([{ instrument: instrument('Clarinet'), numbers: [1] }], available)).toBe(true);
		expect(imslpHas([{ instrument: instrument('Flute'), numbers: [] }], available)).toBe(false);
		expect(imslpHas([], available)).toBe(false);
		// One part for two instruments: "Cellos/Basses".
		const low = imslpVoices(['Cellos/Basses'], config);
		expect(imslpHas([{ instrument: instrument('Double Bass'), numbers: [] }], low)).toBe(true);
	});
});

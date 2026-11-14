import { describe, expect, it } from 'vitest';
import { glyphOf, instrumentGlyph, partGlyph } from './instrument-glyph.ts';

describe('instrumentGlyph', () => {
	it('goes by the name first', () => {
		expect(instrumentGlyph('Geige', 'streicher')).toBe('violin');
		expect(instrumentGlyph('Kontrabass', 'streicher')).toBe('contrabass');
		expect(instrumentGlyph('Violoncello', 'streicher')).toBe('cello');
		expect(instrumentGlyph('E-Bass', 'streicher')).toBe('electricBass');
		expect(instrumentGlyph('Synthesizer', 'tasten')).toBe('synth');
		expect(instrumentGlyph('Harfe', 'tasten')).toBe('harp');
		expect(instrumentGlyph('Fagott', 'holz')).toBe('bassoon');
		expect(instrumentGlyph('Orgel', 'tasten')).toBe('organ');
		expect(instrumentGlyph('Bassklarinette', 'holz')).toBe('bassClarinet');
		expect(instrumentGlyph('Kontrabassklarinette', 'holz')).toBe('contrabassClarinet');
		expect(instrumentGlyph('Es-Klarinette', 'holz')).toBe('clarinet');
		expect(instrumentGlyph('Alt-Saxophon', 'holz')).toBe('sax');
		expect(instrumentGlyph('Tenor-Blockflöte', 'holz')).toBe('recorder');
		expect(instrumentGlyph('Piccolo', 'holz')).toBe('piccolo');
		expect(instrumentGlyph('Bassposaune', 'blech')).toBe('trombone');
		expect(instrumentGlyph('Bass Drum', 'schlagwerk')).toBe('bassDrum');
		expect(instrumentGlyph('Xylophon', 'schlagwerk')).toBe('mallets');
	});

	it('keeps the Englischhorn among the woodwinds', () => {
		expect(instrumentGlyph('Englischhorn', 'holz')).toBe('oboe');
		expect(instrumentGlyph('Flügelhorn', 'blech')).toBe('trumpet');
		expect(instrumentGlyph('Horn', 'blech')).toBe('horn');
	});

	it('falls back to the family, then to a part', () => {
		expect(instrumentGlyph('Alphorn', 'blech')).toBe('horn');
		expect(instrumentGlyph('Laute', 'streicher')).toBe('violin');
		expect(instrumentGlyph('Clavichord', 'tasten')).toBe('keys');
		expect(instrumentGlyph('Wagnertuba', 'blech')).toBe('wagnerTuba');
		expect(instrumentGlyph('Sopran-Saxophon', 'holz')).toBe('sopranoSax');
		expect(instrumentGlyph('Kontrafagott', 'holz')).toBe('contrabassoon');
		expect(instrumentGlyph('Bassetthorn', 'holz')).toBe('bassetHorn');
		expect(instrumentGlyph('Tenorhorn', 'blech')).toBe('tuba');
		expect(instrumentGlyph('B-Stimmen', 'sonstige')).toBe('score');
		expect(instrumentGlyph('Tröte', undefined)).toBe('score');
	});

	it('knows the orchestra’s instruments by name and by label', () => {
		expect(glyphOf('Viola')).toBe('violin');
		expect(glyphOf('Bratsche')).toBe('violin');
		expect(glyphOf('Cello')).toBe('cello');
		expect(glyphOf('Pauke')).toBe('timpani');
	});

	it('gives each percussion instrument a drawing of its own', () => {
		const cases: [string, string][] = [
			['Snare Drum', 'snare'],
			['Trommel', 'fieldDrum'],
			['Hi-Hat', 'hiHat'],
			['Crash-Becken', 'suspendedCymbal'],
			['Hängendes Becken', 'suspendedCymbal'],
			['Becken', 'clashCymbals'],
			['Tamtam', 'gong'],
			['Tempelblocks', 'templeBlocks'],
			['Holzblock', 'woodBlock'],
			['Glockenspiel', 'glockenspiel'],
			['Marimba', 'vibraphone'],
			['Röhrenglocken', 'tubularBells'],
			['Kuhglocke', 'cowbell'],
			['Tamburin', 'tambourine'],
			['Konzerttoms', 'toms'],
			['Drumset', 'drum'],
			['Schlagwerk', 'drum'],
			['Kastagnetten', 'castanets'],
			['Klatschen', 'claps'],
			['Body Percussion', 'claps'],
			['Schnipsen', 'snap'],
			['Stampfen', 'stomp'],
			['Pfeife', 'whistle'],
			['Sandblocks', 'sandBlocks'],
			['Sandpapier', 'sandpaper'],
			['Schreibmaschine', 'typewriter']
		];
		for (const [name, glyph] of cases) expect(instrumentGlyph(name, 'schlagwerk'), name).toBe(glyph);
	});

	it('draws a file by its first instrument', () => {
		expect(partGlyph({ instruments: ['Horn', 'Trompete'], family: 'blech' })).toBe('horn');
		expect(partGlyph({ instruments: [] })).toBe('score');
	});
});

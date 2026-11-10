import { describe, expect, it } from 'vitest';
import { bachkreis } from '#lib/config/presets/bachkreis.ts';
import { createInstrumentMatcher, parsePartName } from './part-name.ts';
import { sharedPrefix } from './text.ts';

const matcher = createInstrumentMatcher(bachkreis.instruments);
const parse = (name: string, prefix = '', mimeType = 'application/pdf') =>
	parsePartName(name, mimeType, bachkreis.naming, matcher, prefix);

describe('parsePartName', () => {
	it.each([
		// The orchestra's own convention
		['BWV 147 - Geige II.pdf', 'Geige II', 'stimme'],
		['@BWV 147 - Partitur.pdf', 'Partitur', 'partitur'],
		['@BWV 147 - Klavierauszug.pdf', 'Klavierauszug', 'partitur'],
		['@Egmont - Streicherauszug.pdf', 'Streicherauszug', 'partitur'],
		['Sword Dance - Trompete I in B.pdf', 'Trompete I in B', 'stimme'],
		['Fame - Geige III / Viola.pdf', 'Geige III / Bratsche', 'sammelstimme'],
		['Fame - Pauke & Schlagwerk.pdf', 'Pauke & Schlagwerk', 'sammelstimme'],
		['Fame - Blech III in hoch B.pdf', 'Blech III in hoch B', 'stimme'],
		['Fame - C-Stimmen in Es.pdf', 'C-Stimmen in Es', 'stimme'],
		// Older styles
		['1. Violine.pdf', 'Geige I', 'stimme'],
		['2.Flöte.pdf', 'Flöte II', 'stimme'],
		['Horn in F 2.pdf', 'Horn II in F', 'stimme'],
		['Saxophon Eb 1+2.pdf', 'Saxophon I & II in Es', 'sammelstimme'],
		['Trompete 1-3.pdf', 'Trompete I–III', 'sammelstimme'],
		['Klarinette 1 & 2 B.pdf', 'Klarinette I & II in B', 'sammelstimme'],
		['Querfl”Te 1 & 2.pdf', 'Flöte I & II', 'sammelstimme'],
		['1. Trompete-1. Klarinette.pdf', 'Trompete I & Klarinette I', 'sammelstimme'],
		['Part 1 Violin.pdf', 'Stimme 1: Geige', 'stimme'],
		['Thriller - Part 4 + 5 Cello.pdf', 'Stimme 4 & 5: Cello', 'sammelstimme'],
		['Stimme 3 in B.pdf', 'Stimme 3 in B', 'stimme'],
		['Bariton B.C..pdf', 'Bariton', 'stimme'],
		['Kontrabass / Stringbass.pdf', 'Kontrabass', 'stimme'],
		['barbie-girl-HornI-and-HornII.pdf', 'Horn I & II', 'sammelstimme'],
		// English ordinals and keys before the instrument (#87)
		['Polar_Express_2nd-Bassoon.pdf', 'Fagott II', 'stimme'],
		['LOTR-4th-Horn.pdf', 'Horn IV', 'stimme'],
		['Phantom-1st-Violin.pdf', 'Geige I', 'stimme'],
		['The Best of Green Day 1st F Horn- .pdf', 'Horn I in F', 'stimme'],
		['The Best of Green Day 1st F Horn-  (1).pdf', 'Horn I in F', 'stimme'],
		['Lord of the Dance 1. und 2. F Horn.pdf', 'Horn I & II in F', 'sammelstimme'],
		['Sleepers Wake F Horn.pdf', 'Horn in F', 'stimme'],
		['The Best of Green Day 2nd B-flat Trumpet- .pdf', 'Trompete II in B', 'stimme'],
		['The Best of Green Day B-flat Bass Clarinet- .pdf', 'Bassklarinette in B', 'stimme'],
		// "Bass" only means the double bass when nothing longer matches
		['Last-Christmas_Bass-Guitar.pdf', 'E-Bass', 'stimme'],
		['Christmas_Memories-E-Bass.pdf', 'E-Bass', 'stimme'],
		['Fame - Bass-Klarinette.pdf', 'Bassklarinette', 'stimme'],
		['Fame - Bass-Posaune.pdf', 'Bassposaune', 'stimme'],
		['Feuerwerksmusik-Cello_und_Bass.pdf', 'Cello & Kontrabass', 'sammelstimme'],
		['Barcarolle-Bass-Clarinet-Trombone.pdf', 'Bassklarinette & Posaune', 'sammelstimme'],
		['Thriller - Part 5 Trombone Baritone BC Bassoonpdf.pdf', 'Stimme 5: Posaune & Bariton & Fagott', 'sammelstimme'],
		['Viva_la_Vida-Pianopdf.pdf', 'Klavier', 'stimme'],
		// A reduction of the score is a score, not the piano or string part
		['Messiah-Piano-Reduction.pdf', 'Klavierauszug', 'partitur'],
		['Messiah Vocal Score.pdf', 'Klavierauszug', 'partitur'],
		['Egmont_String_Reduction.pdf', 'Streicherauszug', 'partitur'],
		// Clefs written "BC"/"TC", before or after the instrument
		['Phantom-BC-Baritone.pdf', 'Bariton', 'stimme'],
		['SEVEN NATION ARMY-BaritoneTC.pdf', 'Bariton', 'stimme'],
		// Small percussion without a part of its own goes to "Percussion"; a common misspelling of the cello
		['Ode_to_Joy-Agogo_Bells.pdf', 'Percussion', 'stimme'],
		['Ode_to_Joy-Guiro.pdf', 'Güiro', 'stimme'],
		['Ode_to_Joy-Low_Drum.pdf', 'Percussion', 'stimme'],
		['Ode_to_Joy-Triangle.pdf', 'Triangel', 'stimme'],
		['Ode_to_Joy-Violincello.pdf', 'Cello', 'stimme'],
		['Ode_to_Joy-Wood_Block.pdf', 'Holzblock', 'stimme'],
		['Ode_to_Joy-Sleigh_Bells.pdf', 'Schellen', 'stimme'],
		['Ode_to_Joy-Marimba.pdf', 'Marimba', 'stimme'],
		['Ode_to_Joy-Vibraphone.pdf', 'Vibraphon', 'stimme'],
		['Ode_to_Joy-Tubular_Bells.pdf', 'Mallet Percussion', 'stimme'],
		['Ode_to_Joy-Bells.pdf', 'Glockenspiel', 'stimme'],
		['Ode_to_Joy-Suspended_Cymbal.pdf', 'Hängendes Becken', 'stimme'],
		['Ode_to_Joy-Bass_Drum.pdf', 'Große Trommel', 'stimme'],
		['Ode_to_Joy-Snare_Drum.pdf', 'Kleine Trommel', 'stimme'],
		['Ode_to_Joy-Male_Choir.pdf', 'Männerchor', 'stimme'],
		['Ode_to_Joy-Alto.pdf', 'Alt', 'stimme'],
		['Ode_to_Joy-Bass.pdf', 'Kontrabass', 'stimme'],
		['Ode_to_Joy-Bass_Voice.pdf', 'Bass', 'stimme'],
		['Ode_to_Joy-Crash_Cymbal.pdf', 'Crash-Becken', 'stimme'],
		['Ode_to_Joy-Timpani.pdf', 'Pauke', 'stimme'],
		// A generic part names what it holds, after a colon or as written before
		['Fame - Percussion I: Triangel & Becken.pdf', 'Percussion I: Triangel & Becken', 'stimme'],
		['Fame - Percussion I - Triangel, Becken.pdf', 'Percussion I: Triangel & Becken', 'stimme'],
		['Fame - Triangel & Schlagwerk II.pdf', 'Schlagwerk II: Triangel', 'stimme'],
		['Fame - Percussion: Marimba & Vibraphon.pdf', 'Percussion: Marimba & Vibraphon', 'stimme'],
		['Fame - Chor: Sopran & Alt.pdf', 'Chor: Sopran & Alt', 'stimme'],
		['Fame - Männerchor: Tenor & Bass Voice.pdf', 'Männerchor: Tenor & Bass', 'stimme'],
		// Not something a generic part holds: two parts in one file
		['Fame - Pauke & Percussion.pdf', 'Pauke & Percussion', 'sammelstimme']
	])('%s → %s', (fileName, label, kind) => {
		const part = parse(fileName);
		expect(part.label).toBe(label);
		expect(part.kind).toBe(kind);
	});

	it('strips the title shared by all files of a piece', () => {
		const files = ['Best_of_Bach-ViolinII.pdf', 'Best_of_Bach-ClarinetI.pdf', 'Best_of_Bach-Bass.pdf'];
		const prefix = sharedPrefix(files);
		expect(prefix).toBe('Best_of_Bach-');
		expect(files.map((f) => parse(f, prefix).label)).toEqual(['Geige II', 'Klarinette I', 'Kontrabass']);
		expect(parse('Sheeps-ClarinetI+II-Bb.pdf', 'Sheeps-').label).toBe('Klarinette I & II in B');
	});

	it('reads movements, flexible voices and voice parts', () => {
		expect(parse('Dvorak_9-4_Viola.pdf', 'Dvorak_9-')).toMatchObject({ label: 'Bratsche', fileLabel: 'Viola', notes: ['Satz 4'] });
		expect(parse('Te_Deum-3Es.pdf', 'Te_Deum-').label).toBe('Stimme 3 in Es');
		expect(parse('Te_Deum-1C.pdf', 'Te_Deum-').label).toBe('Stimme 1 in C');
		expect(parse('Transeamus-Gesang-SA.pdf', 'Transeamus-').label).toBe('Gesang SA');
		expect(parse('Section II ViolineII.pdf').label).toBe('Geige II');
	});

	it('reads status words, notes and featured parts', () => {
		expect(parse('Sword Dance - Partitur - FEHLT', '', 'application/vnd.google-apps.document')).toMatchObject({
			label: 'Partitur',
			status: 'missing'
		});
		expect(parse('Elegie - Viola - LEER.pdf').status).toBe('empty');
		expect(parse('Phantom-Synth-incomplete.pdf', 'Phantom-')).toMatchObject({ label: 'Synthesizer', status: 'incomplete' });
		expect(parse('Elegie - Viola vereinfacht.pdf').notes).toEqual(['vereinfacht']);
		expect(parse('Phantom-BC-Baritone.pdf', 'Phantom-')).toMatchObject({ notes: ['B.C.'], unrecognized: [] });
		expect(parse('Thriller - Part 4 Trombone Bassoon Baritone BC.pdf', 'Thriller - ')).toMatchObject({
			label: 'Stimme 4: Posaune & Fagott & Bariton',
			notes: ['B.C.'],
			unrecognized: []
		});
		// A lone "BC" is left alone: elsewhere it may mean bass clarinet.
		expect(parse('Phantom-BC.pdf', 'Phantom-').kind).toBe('sonstiges');
		expect(parse('Fame - Geige I - Duplikat.pdf')).toMatchObject({ label: 'Geige I', notes: ['Duplikat'] });
		expect(parse('@No Time to Die - Gesang.pdf')).toMatchObject({ kind: 'solo', featured: true });
		expect(parse('Barcarolle-Solo.pdf', 'Barcarolle-')).toMatchObject({ label: 'Solo', kind: 'solo' });
	});

	it('keeps unknown files readable and sorts the score first', () => {
		expect(parse('Avicii Medley - Klatschen.pdf')).toMatchObject({ label: 'Avicii Medley – Klatschen', kind: 'sonstiges' });
		expect(parse('Aufnahme.mp3', '', 'audio/mpeg').kind).toBe('audio');

		const order = ['Geige I.pdf', '@Partitur.pdf', 'Flöte II.pdf', 'Flöte I.pdf', 'Notizen.pdf']
			.map((name) => parse(name))
			.sort((a, b) => a.order - b.order)
			.map((part) => part.label);
		expect(order).toEqual(['Partitur', 'Flöte I', 'Flöte II', 'Geige I', 'Notizen']);
	});
});

describe('versions of a string part', () => {
	it.each([
		// By difficulty, not by key: strings don't transpose (Russian Sailors Dance).
		['Russian Sailors Dance - Geige I A.pdf', 'Geige I', ['A']],
		['Russian Sailors Dance - Geige I B.pdf', 'Geige I', ['B']],
		['Russian Sailors Dance - Geige I Fortgeschritten.pdf', 'Geige I', ['Fortgeschritten']],
		['Geige I advanced.pdf', 'Geige I', ['Fortgeschritten']],
		// A written-out key still counts, for strings too.
		['Last-Christmas_Bass-Es.pdf', 'Kontrabass in Es', []],
		['Geige in D.pdf', 'Geige in D', []],
		// Wind instruments keep their keys.
		['Klarinette I B.pdf', 'Klarinette I in B', []]
	])('%s', (name, label, notes) => {
		const part = parse(name, /^(Russian Sailors Dance - |Last-Christmas_)/.exec(name)?.[0]);
		expect({ label: part.label, notes: part.notes, unrecognized: part.unrecognized }).toEqual({ label, notes, unrecognized: [] });
	});
});

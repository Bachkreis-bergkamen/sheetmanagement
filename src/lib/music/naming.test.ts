import { describe, expect, it } from 'vitest';
import { bachkreis } from '#lib/config/presets/bachkreis.ts';
import { checkSection, classicalShortTitle, guessShortTitle, placeholderName, shortenTitle, type NamingFile } from './naming.ts';
import { createInstrumentMatcher } from './part-name.ts';

const matcher = createInstrumentMatcher(bachkreis.instruments);
const naming = bachkreis.naming;
let n = 0;
const pdf = (name: string, mimeType = 'application/pdf'): NamingFile => ({ id: `f${++n}`, name, mimeType });
const check = (names: (string | NamingFile)[], short: string) =>
	checkSection(
		names.map((name) => (typeof name === 'string' ? pdf(name) : name)),
		short,
		naming,
		matcher
	).map((c) => [c.name, c.state, c.suggested]);

describe('guessShortTitle', () => {
	it('takes the title most files already use', () => {
		const files = ['Symph Reflections - Geige I.pdf', 'Symph Reflections - Viola.pdf', '@Symph Reflections - Partitur.pdf', 'SR-Cello.pdf'].map((x) => pdf(x));
		expect(guessShortTitle(files, 'Symphonic Reflections', naming)).toBe('Symph Reflections');
	});

	it('falls back to the piece title, without brackets or commas and short enough for a phone', () => {
		const files = ['Best_of_Bach-ViolinII.pdf', 'Best_of_Bach-Bass.pdf'].map((x) => pdf(x));
		expect(guessShortTitle(files, 'Sternendreher, Herbergssuche (Medley)', naming)).toBe('Sternendreher');
		expect(guessShortTitle(files, 'Sleigh Ride', naming)).toBe('Sleigh Ride');
	});
});

describe('checkSection', () => {
	it('leaves names that follow the convention alone', () => {
		expect(check(['Fame - Geige I.pdf', '@Fame - Partitur.pdf', 'Fame - Trompete I in B - UNVOLLSTÄNDIG.pdf'], 'Fame')).toEqual([
			['Fame - Geige I.pdf', 'ok', undefined],
			['@Fame - Partitur.pdf', 'ok', undefined],
			['Fame - Trompete I in B - UNVOLLSTÄNDIG.pdf', 'ok', undefined]
		]);
	});

	it('renames old English names into the convention', () => {
		expect(
			check(['LOTR-1st-Violin.pdf', 'LOTR-2nd-Bassoon.pdf', 'LOTR-Score.pdf', 'LOTR-Bass-Clarinet.pdf'], 'The Lord of the Rings')
		).toEqual([
			['LOTR-1st-Violin.pdf', 'rename', 'The Lord of the Rings - Geige I.pdf'],
			['LOTR-2nd-Bassoon.pdf', 'rename', 'The Lord of the Rings - Fagott II.pdf'],
			['LOTR-Score.pdf', 'rename', '@The Lord of the Rings - Partitur.pdf'],
			['LOTR-Bass-Clarinet.pdf', 'rename', 'The Lord of the Rings - Bassklarinette.pdf']
		]);
	});

	it('names the reductions like the score, with the "@" prefix', () => {
		expect(check(['LOTR-1st-Violin.pdf', 'LOTR-Piano-Reduction.pdf', 'LOTR-String-Reduction.pdf'], 'The Lord of the Rings')).toEqual([
			['LOTR-1st-Violin.pdf', 'rename', 'The Lord of the Rings - Geige I.pdf'],
			['LOTR-Piano-Reduction.pdf', 'rename', '@The Lord of the Rings - Klavierauszug.pdf'],
			['LOTR-String-Reduction.pdf', 'rename', '@The Lord of the Rings - Streicherauszug.pdf']
		]);
	});

	it('keeps status words, notes, movements and Google Doc placeholders', () => {
		expect(
			check(
				[
					pdf('Superman Returns - Tuba - FEHLT', 'application/vnd.google-apps.document'),
					'Superman Returns - Viola easy.pdf',
					'Superman Returns - Satz 2 - Violine 2.pdf',
					'Superman Returns - Posaune incomplete.pdf'
				],
				'Superman Returns'
			)
		).toEqual([
			['Superman Returns - Tuba - FEHLT', 'ok', undefined],
			['Superman Returns - Viola easy.pdf', 'rename', 'Superman Returns - Viola vereinfacht.pdf'],
			['Superman Returns - Satz 2 - Violine 2.pdf', 'rename', 'Superman Returns - Satz 2 - Geige II.pdf'],
			['Superman Returns - Posaune incomplete.pdf', 'rename', 'Superman Returns - Posaune - UNVOLLSTÄNDIG.pdf']
		]);
	});

	it('drops brackets and copy suffixes, and marks a second copy as a duplicate', () => {
		expect(check(['Good Omens - Oboe.pdf', 'Good Omens - Oboe (1).pdf', 'Good Omens - (Flöte).pdf'], 'Good Omens')).toEqual([
			['Good Omens - Oboe.pdf', 'ok', undefined],
			['Good Omens - Oboe (1).pdf', 'rename', 'Good Omens - Oboe Duplikat.pdf'],
			['Good Omens - (Flöte).pdf', 'rename', 'Good Omens - Flöte.pdf']
		]);
	});

	it('leaves names with unknown words to a person and skips recordings', () => {
		const result = checkSection([pdf('Phantom-BC.pdf'), pdf('Phantom-Kontrabass.pdf'), pdf('Phantom.mp3', 'audio/mpeg')], 'Phantom', naming, matcher);
		expect(result.map((c) => c.state)).toEqual(['unclear', 'rename', 'skip']);
		expect(result[0].unrecognized).toContain('bc');
	});
});

describe('clefs', () => {
	it('keeps the clef and never ends in two dots', () => {
		expect(check(['Phantom-BC-Baritone.pdf', 'Phantom-Kontrabass.pdf'], 'Phantom der Oper')[0][2]).toBe('Phantom der Oper - Bariton B.C.pdf');
	});
});

describe('copies', () => {
	it('keeps the plain name for the original, whichever comes first', () => {
		expect(check(['Lord of the Dance 2. Geige (1).pdf', 'Lord of the Dance 2. Geige.pdf'], 'Lord of the Dance')).toEqual([
			['Lord of the Dance 2. Geige (1).pdf', 'rename', 'Lord of the Dance - Geige II Duplikat.pdf'],
			['Lord of the Dance 2. Geige.pdf', 'rename', 'Lord of the Dance - Geige II.pdf']
		]);
	});
});

describe('short titles', () => {
	it('uses composer and number for classical works, BWV for Bach', () => {
		expect(guessShortTitle([pdf('Dvorak_9-4_ViolinI.pdf')], 'Sinfonie Nr. 9 Aus der neuen Welt', naming, { composer: 'Dvorak', catalogue: 'Op. 95' })).toBe('Dvorak 9');
		expect(guessShortTitle([pdf('Air-Bass.pdf'), pdf('Air-Viola.pdf')], 'Air', naming, { composer: 'Bach', catalogue: 'BWV 1068' })).toBe('BWV 1068');
	});

	it('never puts the separator inside a short title', () => {
		expect(check(['Figaro_ViolinI.pdf'], 'Le nozze di Figaro - Overture')[0][2]).toBe('Le nozze di Figaro Overture - Geige I.pdf');
	});

	it('reads the head before the part, movement and status', () => {
		const files = ['Schumann - Klavierkonzert op. 54 - Kontrabass.pdf', 'Schumann - Klavierkonzert op. 54 - Viola - LEER.pdf'].map((x) => pdf(x));
		expect(guessShortTitle(files, 'Klavierkonzert', naming)).toBe('Schumann op. 54');
	});
});

describe('shortenTitle', () => {
	it.each([
		['Kleine Nachtmusik', 'Kleine Nachtmusik'],
		['Eine kleine Nachtmusik', 'Kleine Nachtmusik'],
		['Themes from 007', 'Themes from 007'],
		['Themes from Harry Potter', 'Harry Potter'],
		['Jesu bleibet meine Freude', 'Jesu bleibet'],
		['The Phantom of the Opera', 'Phantom'],
		['Le nozze di Figaro - Overture', 'Nozze di Figaro'],
		['Sternendreher, Herbergssuche (Medley)', 'Sternendreher'],
		['Pirates of the Caribbean', 'Pirates'],
		['Donaudampfschiffahrtsgesellschaftswalzer', 'Donaudampfschiffah']
	])('%s → %s', (title, short) => {
		expect(shortenTitle(title, naming)).toBe(short);
	});

	it('keeps a known name rather than a catalogue number', () => {
		expect(shortenTitle('Eine kleine Nachtmusik', naming, { composer: 'Mozart', catalogue: 'KV 525' })).toBe('Kleine Nachtmusik');
	});

	it('uses composer and catalogue number when only one word would be left', () => {
		expect(shortenTitle('Konzert für Klarinette und Orchester A-Dur', naming, { composer: 'Wolfgang Amadeus Mozart', catalogue: 'KV 622' })).toBe('Mozart KV 622');
	});

	it('follows the configured limit', () => {
		expect(shortenTitle('Jesu bleibet meine Freude', { ...naming, maxShortTitle: 30 })).toBe('Jesu bleibet meine Freude');
	});
});

describe('placeholderName', () => {
	it('uses the folder short title, the part and FEHLT', () => {
		const files = ['Fame - Geige I.pdf', 'Fame - Viola.pdf'].map((x) => pdf(x));
		expect(placeholderName(files, 'Fame', 'Trompete II', naming)).toBe('Fame - Trompete II - FEHLT');
		expect(placeholderName([], 'Sinfonie Nr. 9 Aus der neuen Welt', 'Horn III', naming, { composer: 'Dvorak' })).toBe('Dvorak 9 - Horn III - FEHLT');
	});
});

describe('classicalShortTitle with several composers', () => {
	it('takes the first composer of a list', () => {
		expect(classicalShortTitle('Sinfonie Nr. 9', { composer: 'Antonín Dvořák, Smetana' })).toBe('Dvořák 9');
		expect(classicalShortTitle('Sinfonie Nr. 9', { composer: 'Dvořák' })).toBe('Dvořák 9');
	});
});

describe('names from the archive that needed a person (#271)', () => {
	const run = (names: string[], short: string, titles: string[] = []) =>
		checkSection(names.map((name) => pdf(name)), short, naming, matcher, { titles }).map((c) => c.suggested ?? c.state);

	it('names small percussion after the instrument, so the parts stay apart', () => {
		expect(run(['Ode_to_Joy-Low_Drum.pdf', 'Ode_to_Joy-Triangle.pdf', 'Ode_to_Joy-Agogo_Bells.pdf'], 'Ode to Joy', ['Ode to Joy'])).toEqual([
			'Ode to Joy - Percussion Low Drum.pdf',
			'Ode to Joy - Triangel.pdf',
			'Ode to Joy - Agogo Bells.pdf'
		]);
		// Named that way, they stay.
		expect(check(['Ode to Joy - Percussion Low Drum.pdf'], 'Ode to Joy')).toEqual([['Ode to Joy - Percussion Low Drum.pdf', 'ok', undefined]]);
		// Agogo bells have parts of their own now (#317).
		expect(check(['Ode to Joy - Percussion Agogo Bells.pdf'], 'Ode to Joy')).toEqual([
			['Ode to Joy - Percussion Agogo Bells.pdf', 'rename', 'Ode to Joy - Agogo Bells.pdf']
		]);
		// Older names of percussion that now has parts of its own mean that instrument alone.
		expect(check(['Ode to Joy - Percussion Triangle.pdf'], 'Ode to Joy')).toEqual([['Ode to Joy - Percussion Triangle.pdf', 'rename', 'Ode to Joy - Triangel.pdf']]);
	});

	it('reads a subfolder name before the part as title', () => {
		const files = ['Sections II Baritonsax & Klarinette.pdf', 'Sections II Trompete 1.pdf', 'Section II Violine.pdf', 'Section II Violoncello.pdf'];
		expect(run(files, 'Sections', ['Sections', 'Section II'])).toEqual([
			'Sections - Bariton-Saxophon & Klarinette.pdf',
			'Sections - Trompete I.pdf',
			'Sections - Geige.pdf',
			'Sections - Violoncello.pdf'
		]);
		expect(run(['Sections III Klarinette Zusatzstimme.pdf'], 'Sections', ['Sections', 'Section III'])).toEqual([
			'Sections - Klarinette Zusatzstimme.pdf'
		]);
		// Without it, numbers on both sides of the part are left to a person.
		expect(run(['II Trompete 1.pdf'], 'Sections')).toEqual(['unclear']);
	});

	it('reads keys, sources and spellings it missed', () => {
		const files = ['@Schubert8_Partitur-IMSLP.pdf', 'Schubert8_Clarinets-inA+B.pdf', 'Schubert8_TrumpetI-E.pdf', 'Schubert8_TrumpetII-E.pdf'];
		expect(run(files, 'Schubert 8')).toEqual([
			'@Schubert 8 - Partitur.pdf',
			'Schubert 8 - Klarinette in A & B.pdf',
			'Schubert 8 - Trompete I in E.pdf',
			'Schubert 8 - Trompete II in E.pdf'
		]);
		expect(run(['Sleepers Wake C Flöte.pdf'], 'Sleepers Wake', ['Sleepers Wake'])).toEqual(['Sleepers Wake - Flöte in C.pdf']);
		expect(run(['SEVEN NATION ARMY-Alt_Saxophone.pdf'], 'Seven Nation Army', ['Seven Nation Army'])).toEqual([
			'Seven Nation Army - Alt-Saxophon.pdf'
		]);
		expect(run(['Star_Trek-Mallet_Perc.pdf', 'Star_Trek-Roland_SP700.pdf'], 'Star Trek', ['Star Trek'])).toEqual([
			'Star Trek - Mallet Percussion.pdf',
			'Star Trek - Synthesizer.pdf'
		]);
	});
});

import { describe, expect, it } from 'vitest';
import { config } from '#lib/config/index.ts';
import {
	choicesFromForm,
	commonInstruments,
	coverage,
	formatInstrument,
	formatInstruments,
	foldIntoSets,
	formatPlays,
	matchParts,
	mergedFileName,
	parseInstrument,
	parseInstruments,
	playableInstruments,
	playedParts,
	programInstruments,
	setsFor
} from './my-parts.ts';
import { createInstrumentMatcher, parsePartName } from './part-name.ts';
import type { Part } from './types.ts';

const matcher = createInstrumentMatcher(config.instruments);
let next = 0;
/** A part as the catalog builds it from a file name. */
function part(fileName: string, section = ''): Part {
	const parsed = parsePartName(fileName, 'application/pdf', config.naming, matcher);
	return {
		id: `f${next++}`,
		fileName,
		label: parsed.label,
		kind: parsed.kind,
		family: parsed.family,
		instruments: parsed.instruments,
		voices: parsed.voices,
		notes: parsed.notes,
		status: parsed.status,
		mimeType: 'application/pdf',
		section,
		order: parsed.order
	};
}
const labels = (parts: Part[]) => parts.map((p) => p.label);

describe('parseInstrument', () => {
	it.each([
		['Geige 2', { instrument: 'Geige', numbers: [2] }],
		['2. Violine', { instrument: 'Geige', numbers: [2] }],
		['Violin II', { instrument: 'Geige', numbers: [2] }],
		['Cello', { instrument: 'Violoncello', numbers: [] }],
		['Klarinette in B', { instrument: 'Klarinette', numbers: [] }],
		['Dirigent', { instrument: 'Partitur', numbers: [] }],
		['Tröte', null],
		['', null]
	])('%j → %j', (text, expected) => {
		expect(parseInstrument(text, config)).toEqual(expected);
	});

	it('formats a choice like a part name', () => {
		expect(formatInstrument({ instrument: 'Geige', numbers: [2] })).toBe('Geige II');
		expect(formatInstrument({ instrument: 'Viola', numbers: [] })).toBe('Bratsche');
	});
});

describe('parseInstruments', () => {
	it.each([
		['Geige I & II, Viola', [{ instrument: 'Geige', numbers: [1, 2] }, { instrument: 'Viola', numbers: [] }]],
		['Flöte, Oboe II', [{ instrument: 'Flöte', numbers: [] }, { instrument: 'Oboe', numbers: [2] }]],
		['Trompete I & III', [{ instrument: 'Trompete', numbers: [1, 3] }]],
		['Violoncello & Kontrabass', [{ instrument: 'Violoncello', numbers: [] }, { instrument: 'Kontrabass', numbers: [] }]],
		// The same instrument twice: its numbers together, or every part if one entry has none.
		['Geige II; Geige I', [{ instrument: 'Geige', numbers: [1, 2] }]],
		['Geige II, Geige', [{ instrument: 'Geige', numbers: [] }]],
		['Tröte, Cello', [{ instrument: 'Violoncello', numbers: [] }]],
		['', []]
	])('%j', (text, expected) => {
		expect(parseInstruments(text, config)).toEqual(expected);
	});

	it('round-trips through the stored notation', () => {
		for (const text of ['Geige I & II, Bratsche', 'Flöte, Oboe II', 'Trompete I–III']) {
			expect(formatInstruments(parseInstruments(text, config))).toBe(text);
		}
	});
});

describe('choicesFromForm', () => {
	const form = (entries: [string, string][]) => {
		const data = new FormData();
		for (const [name, value] of entries) data.append(name, value);
		return data;
	};
	const allowed = playableInstruments(config);

	it('reads one row per instrument with its numbers', () => {
		const data = form([
			['instrument', 'Geige'],
			['number', '0:2'],
			['number', '0:1'],
			['instrument', 'Viola'],
			['instrument', '']
		]);
		expect(choicesFromForm(data, allowed)).toEqual([
			{ instrument: 'Geige', numbers: [1, 2] },
			{ instrument: 'Viola', numbers: [] }
		]);
	});

	it('drops unknown instruments and numbers, and merges duplicates', () => {
		const data = form([
			['instrument', 'Tröte'],
			['number', '0:1'],
			['instrument', 'Horn'],
			['number', '1:9'],
			['number', '1:3'],
			['instrument', 'Horn'],
			['number', '2:1']
		]);
		expect(choicesFromForm(data, allowed)).toEqual([{ instrument: 'Horn', numbers: [1, 3] }]);
	});
});

describe('commonInstruments', () => {
	it('offers the usual orchestra instruments first', () => {
		expect(commonInstruments(config)).toContain('Geige');
		expect(commonInstruments(config)).not.toContain('Blockflöte');
	});

	it('offers every instrument when the config marks none', () => {
		const plain = { ...config, instruments: config.instruments.map(({ common: _, ...instrument }) => instrument) };
		expect(commonInstruments(plain)).toHaveLength(config.instruments.length);
	});
});

describe('matchParts', () => {
	const parts = [
		part('Bolero - Partitur.pdf'),
		part('Bolero - Geige I.pdf'),
		part('Bolero - Geige II.pdf'),
		part('Bolero - Violoncello & Kontrabass.pdf'),
		part('Bolero - Klarinette I & II in B.pdf'),
		part('Bolero - B-Stimmen.pdf'),
		part('Bolero - C-Stimmen.pdf'),
		part('Bolero - Aufnahme.mp3')
	];

	it('finds the part with the right number', () => {
		expect(labels(matchParts(parts, { instrument: 'Geige', numbers: [2] }, config).own)).toEqual(['Geige II']);
	});

	it('gives every part of the instrument when no number is known', () => {
		expect(labels(matchParts(parts, { instrument: 'Geige', numbers: [] }, config).own)).toEqual(['Geige I', 'Geige II']);
	});

	it('finds every numbered part a member plays', () => {
		expect(labels(matchParts(parts, { instrument: 'Geige', numbers: [1, 2] }, config).own)).toEqual(['Geige I', 'Geige II']);
		expect(labels(matchParts(parts, { instrument: 'Geige', numbers: [1, 3] }, config).own)).toEqual(['Geige I']);
	});

	it('finds combined parts and the shared parts for the instrument', () => {
		const clarinet = matchParts(parts, { instrument: 'Klarinette', numbers: [2] }, config);
		expect(labels(clarinet.own)).toEqual(['Klarinette I & II in B']);
		expect(labels(clarinet.shared)).toEqual(['B-Stimmen']);
		expect(labels(matchParts(parts, { instrument: 'Kontrabass', numbers: [] }, config).own)).toEqual(['Cello & Kontrabass']);
	});

	it('prefers the numbered part over a plain one, and leaves out the soloist', () => {
		// As in the archive: "Lets_get_Loud-Violin.pdf" next to "…-ViolinII.pdf", and a solo violin.
		const loud = [part('Loud - Violin.pdf'), part('Loud - Violin II.pdf'), part('Loud - Violin III.pdf'), part('@Loud - Violine Solo.pdf')];
		expect(labels(matchParts(loud, { instrument: 'Geige', numbers: [2] }, config).own)).toEqual(['Geige II']);
		// Without "Geige IV", the plain part is the best there is.
		expect(labels(matchParts(loud, { instrument: 'Geige', numbers: [4] }, config).own)).toEqual(['Geige']);
		expect(labels(matchParts([part('Loud - Violine Solo.pdf')], { instrument: 'Geige', numbers: [2] }, config).own)).toEqual(['Geige']);
	});

	it('gives the conductor the score', () => {
		expect(labels(matchParts(parts, { instrument: 'Partitur', numbers: [] }, config).own)).toEqual(['Partitur']);
	});

	it('gives the conductor the reductions too, and the pianist the piano reduction', () => {
		const reduced = [...parts, part('@Bolero - Klavierauszug.pdf'), part('@Bolero - Streicherauszug.pdf'), part('Bolero - Klavier.pdf')];
		const conductor = matchParts(reduced, { instrument: 'Partitur', numbers: [] }, config);
		expect(labels(conductor.own)).toEqual(['Partitur']);
		expect(labels(conductor.shared)).toEqual(['Klavierauszug', 'Streicherauszug']);
		const pianist = matchParts(reduced, { instrument: 'Klavier', numbers: [] }, config);
		expect(labels(pianist.own)).toEqual(['Klavier']);
		expect(labels(pianist.shared)).toEqual(['C-Stimmen', 'Klavierauszug']);
		// Only a reduction: the conductor still has something to read.
		expect(coverage([part('@Bolero - Klavierauszug.pdf')], 'Partitur', config)).toBe('shared');
	});

	it('finds nothing for an instrument the piece lacks', () => {
		expect(matchParts(parts, { instrument: 'Tuba', numbers: [] }, config)).toEqual({ own: [], shared: [] });
	});

	it('only uses the section that is played', () => {
		const detail = {
			sections: [{ key: 'played' }, { key: 'complete' }] as never,
			parts: [part('Sinfonie - Geige I.pdf', 'played'), part('Sinfonie - Geige I.pdf', 'complete'), part('Sinfonie - Aufnahme.mp3', 'played')]
		};
		expect(playedParts(detail).map((p) => p.section)).toEqual(['played']);
	});
});

describe('instrumentation check', () => {
	const parts = [
		part('Elegie - Geige I.pdf'),
		part('Elegie - Viola - FEHLT.pdf'),
		part('Elegie - B-Stimmen.pdf'),
		part('Elegie - Violoncello.pdf')
	];

	it.each([
		['Geige', 'own'],
		['Trompete', 'shared'],
		['Viola', 'problem'],
		['Tuba', 'none']
	])('%s → %s', (instrument, expected) => {
		expect(coverage(parts, instrument, config)).toBe(expected);
	});

	it('lists the instruments of a programme in the configured order, without group parts', () => {
		const other = [part('Bolero - Partitur.pdf'), part('@Bolero - Klavierauszug.pdf'), part('Bolero - Flöte.pdf'), part('Bolero - Schlagwerk.pdf'), part('Bolero - Holz.pdf')];
		expect(programInstruments([parts, other], config)).toEqual(['Flöte', 'Schlagwerk', 'Geige', 'Viola', 'Violoncello']);
	});
});

describe('mergedFileName', () => {
	it('names the merged PDF after concert and instrument, without spaces or umlauts', () => {
		expect(mergedFileName('Herbstkonzert', 'Violoncello')).toBe('herbstkonzert-komplett-violoncello.pdf');
		expect(mergedFileName('1. Weihnachtskonzert 2026', 'Flöte II')).toBe('1-weihnachtskonzert-2026-komplett-floete-ii.pdf');
		expect(mergedFileName('Konzert', 'Alt-Saxophon')).toBe('konzert-komplett-alt-saxophon.pdf');
	});
});

describe('a percussionist’s setup', () => {
	const sets = config.instrumentSets!;
	const parts = [
		part('Fame - Schlagwerk.pdf'),
		part('Fame - Percussion.pdf'),
		part('Fame - Percussion I: Triangel & Becken.pdf'),
		part('Fame - Percussion II: Glockenspiel.pdf'),
		part('Fame - Snare Drum.pdf'),
		part('Fame - Triangel.pdf'),
		part('Fame - Marimba.pdf'),
		part('Fame - Crash Cymbal.pdf'),
		part('Fame - Pauke.pdf')
	];
	const got = (text: string) => {
		const { own, shared } = matchParts(parts, parseInstruments(text, config)[0], config);
		return labels([...own, ...shared]).sort();
	};

	it('names only real instruments in its sets', () => {
		const names = new Set(config.instruments.map((instrument) => instrument.name));
		expect(Object.values(sets).flat().filter((name) => !names.has(name))).toEqual([]);
	});

	it('reads sets, "ohne" and single instruments, and writes them back as briefly', () => {
		const [choice] = parseInstruments('Schlagwerk (Trommeln, Stabspiele ohne Marimba & Vibraphon, Kuhglocke)', config);
		expect(choice.instrument).toBe('Schlagwerk');
		expect(choice.plays).toEqual([...sets.Trommeln, ...sets.Stabspiele.filter((name) => name !== 'Marimba' && name !== 'Vibraphon'), 'Kuhglocke']);
		expect(formatPlays(choice.plays!, config)).toBe('Trommeln, Stabspiele ohne Marimba & Vibraphon, Kuhglocke');
		expect(formatInstruments([choice, { instrument: 'Pauke', numbers: [] }], config)).toBe(
			'Schlagwerk (Trommeln, Stabspiele ohne Marimba & Vibraphon, Kuhglocke), Pauke'
		);
		// The short label stays short.
		expect(formatInstruments([choice])).toBe('Schlagwerk');
	});

	it('keeps the commas of a setup apart from the next instrument', () => {
		expect(parseInstruments('Schlagwerk (Trommeln, Pauken), Klavier', config).map((choice) => choice.instrument)).toEqual(['Schlagwerk', 'Klavier']);
	});

	it('gives a plain percussionist every part, as before', () => {
		expect(got('Schlagwerk')).toEqual(labels(parts).sort().filter((label) => label !== 'Pauke'));
	});

	it('gives a setup only the parts of what is played', () => {
		expect(got('Schlagwerk (Trommeln, Kleinpercussion)')).toEqual(['Percussion', 'Percussion I: Triangel & Becken', 'Schlagwerk', 'Snare Drum', 'Triangel']);
		expect(got('Schlagwerk (Stabspiele, Pauken)')).toEqual(['Marimba', 'Pauke', 'Percussion', 'Percussion II: Glockenspiel', 'Schlagwerk']);
		expect(got('Schlagwerk (Stabspiele ohne Marimba)')).not.toContain('Marimba');
	});

	it('reads a setup from the profile form', () => {
		const data = new FormData();
		data.append('instrument', 'Schlagwerk');
		for (const name of ['Snare Drum', 'Pauke', 'Unbekannt']) data.append('plays', `0:${name}`);
		expect(choicesFromForm(data, playableInstruments(config))).toEqual([{ instrument: 'Schlagwerk', numbers: [], plays: ['Snare Drum', 'Pauke'] }]);
	});

	it('folds what the sets hold into the percussion, as the profile picks it now', () => {
		const fold = (text: string) => formatInstruments(foldIntoSets(parseInstruments(text, config), config), config);
		expect(fold('Pauke, Marimba, Geige')).toBe('Schlagwerk (Pauken, Marimba), Geige');
		expect(fold('Mallet Percussion')).toBe('Schlagwerk (Mallet Percussion)');
		expect(fold('Schlagwerk (Trommeln), Pauke')).toBe('Schlagwerk (Trommeln, Pauken)');
		// Every percussion part already: nothing to add.
		expect(fold('Schlagwerk, Pauke')).toBe('Schlagwerk');
		expect(fold('Geige II')).toBe('Geige II');
	});

	it('offers the percussion sets to percussionists only', () => {
		expect(setsFor('Schlagwerk', config).map((set) => set.name)).toEqual(expect.arrayContaining(['Stabspiele', 'Pauken']));
		expect(setsFor('Geige', config)).toEqual([]);
		expect(setsFor('Chor', config)).toEqual([]);
	});
});

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
	movementsOf,
	playedParts,
	playedSections,
	playingAt,
	programInstruments,
	sectionsOf,
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

describe('a piece kept as a folder per movement (#361)', () => {
	const section = (movement: number) => ({ key: `s${movement}`, label: `${movement}. Satz`, kind: 'movement' as const, movement, folderId: `s${movement}`, partCount: 2 });
	const detail = {
		sections: [section(1), section(2), section(4), { key: 'k', label: 'Komplett', kind: 'complete' as const, folderId: 'k', partCount: 1 }],
		parts: [
			part('Dvorak 9 - Geige I.pdf', 's1'),
			part('Dvorak 9 - Geige II.pdf', 's1'),
			part('Dvorak 9 - Viola.pdf', 's1'),
			part('Dvorak 9 - Geige.pdf', 's2'),
			part('Dvorak 9 - Viola.pdf', 's2'),
			part('Dvorak 9 - Geige II.pdf', 's4'),
			part('Dvorak 9 - Viola - FEHLT.pdf', 's4'),
			part('Dvorak 9 - Viola.pdf', 'k')
		]
	};

	it('plays every movement, not only the first, and never the complete work beside them', () => {
		expect(playedSections(detail).map((s) => s.label)).toEqual(['1. Satz', '2. Satz', '4. Satz']);
		expect(movementsOf(detail)).toEqual([1, 2, 4]);
		expect(new Set(playedParts(detail).map((p) => p.section))).toEqual(new Set(['s1', 's2', 's4']));
	});

	it('plays only the movements a programme names, where the piece has them', () => {
		expect(playedSections(detail, [2]).map((s) => s.label)).toEqual(['2. Satz']);
		expect(playedSections(detail, [4, 1]).map((s) => s.label)).toEqual(['1. Satz', '4. Satz']);
		// A movement the folder doesn't have: the whole piece, not nothing.
		expect(playedSections(detail, [3]).map((s) => s.label)).toEqual(['1. Satz', '2. Satz', '4. Satz']);
		expect(labels(playedParts(detail, [2]))).toEqual(['Geige · 2. Satz', 'Bratsche · 2. Satz']);
	});

	it('gives a player their part of each movement', () => {
		const viola = matchParts(playedParts(detail), { instrument: 'Viola', numbers: [] }, config);
		expect(labels(viola.own)).toEqual(['Bratsche · 1. Satz', 'Bratsche · 2. Satz', 'Bratsche · 4. Satz']);
		// A second violin: "Geige II" where there is one, the plain "Geige" where there is only that.
		const second = matchParts(playedParts(detail), { instrument: 'Geige', numbers: [2] }, config);
		expect(labels(second.own)).toEqual(['Geige II · 1. Satz', 'Geige · 2. Satz', 'Geige II · 4. Satz']);
	});

	it('counts the movement covered worst in the instrumentation check', () => {
		expect(coverage(playedParts(detail), 'Viola', config)).toBe('problem');
		expect(coverage(playedParts(detail, [1, 2]), 'Viola', config)).toBe('own');
		expect(coverage(playedParts(detail), 'Geige', config)).toBe('own');
	});

	it('leaves a piece with its parts directly in the folder as it was', () => {
		const plain = { sections: [{ key: '', label: '', kind: 'played' as const, folderId: 'f', partCount: 1 }], parts: [part('Fame - Viola.pdf')] };
		expect(playedSections(plain, [2])).toEqual(plain.sections);
		expect(movementsOf(plain)).toEqual([]);
		expect(playedParts(plain)).toEqual(plain.parts);
	});
});

describe('a piece kept as folders "Section II", "Section III"', () => {
	const section = (label: string, movement: number) => ({ key: label, label, kind: 'movement' as const, movement, folderId: label, partCount: 1 });
	const detail = {
		sections: [section('Section II', 2), section('Section III', 3)],
		parts: [part('Sections - Viola.pdf', 'Section II'), part('Sections - Viola.pdf', 'Section III')]
	};

	it('plays both, or the one a programme names', () => {
		expect(labels(playedParts(detail))).toEqual(['Bratsche · Section II', 'Bratsche · Section III']);
		expect(labels(playedParts(detail, [3]))).toEqual(['Bratsche · Section III']);
		expect(movementsOf(detail)).toEqual([2, 3]);
	});
});

describe('the part played at one concert', () => {
	const violins = parseInstruments('Geige I & II, Viola', config);
	const piece = [part('Violine 1.pdf'), part('Violine 2.pdf'), part('Viola.pdf'), part('Partitur.pdf')];
	const ownParts = (choices: ReturnType<typeof parseInstruments>) => choices.flatMap((choice) => labels(matchParts(piece, choice, config).own));

	it('lists each of someone’s parts on its own to pick from', () => {
		expect(sectionsOf(violins)).toEqual(['Geige I', 'Geige II', 'Bratsche']);
		expect(sectionsOf(parseInstruments('Cello', config))).toHaveLength(1);
	});

	it('shows only the part given with the answer, not every part in the profile', () => {
		expect(ownParts(violins)).toEqual(['Geige I', 'Geige II', 'Bratsche']);
		expect(ownParts(playingAt(violins, parseInstruments('Geige II', config)))).toEqual(['Geige II']);
		expect(ownParts(playingAt(violins, parseInstruments('Viola', config)))).toEqual(['Bratsche']);
	});

	it('keeps everything without an answer', () => {
		expect(playingAt(violins, [])).toBe(violins);
	});

	it('keeps a percussionist’s setup when the answer just says the instrument', () => {
		const [percussion] = parseInstruments('Schlagwerk (Pauke)', config);
		expect(percussion.plays).toBeDefined();
		const [played] = playingAt([percussion], parseInstruments('Schlagwerk', config));
		expect(played.plays).toEqual(percussion.plays);
	});
});

import { describe, expect, it } from 'vitest';
import { concertPartners, onlyGuests, performerNames, readEnsembles, withGuests } from './ensembles.ts';
import { reportGaps, reportRows } from './music-report.ts';
import { programLabel, programScopes, rowOrchestra } from './orchestras.ts';
import { buildRepertoire } from './sheet.ts';

const row = (values: Partial<Record<'shortName' | 'name' | 'kind' | 'conductor' | 'website' | 'logo', string>>) => ({
	shortName: '',
	name: '',
	kind: '',
	conductor: '',
	website: '',
	logo: '',
	...values
});

describe('readEnsembles', () => {
	it('keeps one row per short name, and only safe links', () => {
		const ensembles = readEnsembles([
			row({ shortName: 'KCH', name: 'Kammerchor Unna', kind: 'Chor', conductor: 'Anna Müller', website: 'https://kch.example.org', logo: 'https://kch.example.org/logo.png' }),
			row({ shortName: 'kch', name: 'Zweiter Eintrag' }),
			row({ name: 'Posaunenchor Kamen', website: 'javascript:alert(1)', logo: 'http://example.org/logo.png' }),
			row({})
		]);
		expect(ensembles).toEqual([
			{ shortName: 'KCH', name: 'Kammerchor Unna', kind: 'Chor', conductor: 'Anna Müller', website: 'https://kch.example.org/', logo: 'https://kch.example.org/logo.png' },
			// No short name: the full name is both; a logo only over https.
			{ shortName: 'Posaunenchor Kamen', name: 'Posaunenchor Kamen' }
		]);
	});

	it('finds partners by short or full name, and keeps names it doesn’t know', () => {
		const ensembles = readEnsembles([row({ shortName: 'KCH', name: 'Kammerchor Unna' })]);
		expect(concertPartners('kch, Kammerchor Unna; Jugendchor Bergkamen', ensembles)).toEqual([
			{ shortName: 'KCH', name: 'Kammerchor Unna' },
			{ shortName: 'KCH', name: 'Kammerchor Unna' },
			{ shortName: 'Jugendchor Bergkamen', name: 'Jugendchor Bergkamen' }
		]);
	});
});

describe('performers', () => {
	const partners = [{ shortName: 'KCH', name: 'Kammerchor Unna' }];

	it('names guests in full and ours as we write them', () => {
		expect(performerNames('EO, KCH', partners)).toEqual(['EO', 'Kammerchor Unna']);
		expect(withGuests('EO, kch', partners)).toBe(true);
		expect(withGuests('EO', partners)).toBe(false);
		expect(onlyGuests('KCH', partners)).toBe(true);
		expect(onlyGuests('EO, KCH', partners)).toBe(false);
		expect(onlyGuests(undefined, partners)).toBe(false);
	});

	it('gives guests their own tabs and one for everybody together', () => {
		expect(programScopes(['EO'], ['KCH'])).toEqual(['EO', 'KCH', 'EO, KCH']);
		expect(programScopes(['EO', 'A'], ['KCH'])).toEqual(['EO', 'A', 'KCH', 'EO, A', 'EO, A, KCH']);
		// A concert naming none of ours has one programme, guests or not.
		expect(programScopes([], ['KCH'])).toEqual([]);
		expect(rowOrchestra('kch, eo', ['EO'], ['KCH'])).toBe('EO, KCH');
		// A row naming nobody is ours, never the guests'.
		expect(rowOrchestra('', ['EO'], ['KCH'])).toBe('EO');
		expect(programLabel('EO, KCH', (short) => performerNames(short, partners)[0])).toBe('Gemeinsam: EO + Kammerchor Unna');
		expect(programLabel('KCH', (short) => performerNames(short, partners)[0])).toBe('Programm Kammerchor Unna');
	});
});

describe('a concert with a guest choir in the sheet', () => {
	const repertoire = buildRepertoire({
		pieces: [
			['Titel', 'Komponist', 'Komponist (voll)', 'Verlag', 'Dauer'],
			['Egmont Ouvertüre', 'Beethoven', 'Ludwig van Beethoven', 'Breitkopf', '8:30']
		],
		concerts: [
			['Datum', 'Anlass', 'Orchester', 'Mitwirkende', 'Veranstalter'],
			['2026-11-22', 'Herbstkonzert', 'EO', 'KCH', ''],
			['2026-12-20', 'Adventskonzert', 'EO', 'KCH, Posaunenchor Kamen', 'KCH']
		],
		program: [
			['Konzert', 'Nr.', 'Stück', 'Orchester', 'Komponist', 'Verlag', 'Dauer'],
			['Herbstkonzert', '1', 'Abendlied', 'KCH', 'Josef Rheinberger', 'Carus', '3:10'],
			['Herbstkonzert', '1', 'Egmont Ouvertüre', '', '', '', ''],
			['Herbstkonzert', '2', 'Halleluja', 'kch, eo', 'Georg Friedrich Händel', '', ''],
			['Herbstkonzert', '2', 'Unbekannt', '', '', '', '']
		],
		ensembles: [
			['Kurzname', 'Name', 'Art', 'Leitung', 'Website', 'Logo'],
			['KCH', 'Kammerchor Unna', 'Chor', 'Anna Müller', 'https://kch.example.org', '']
		]
	});
	const [herbst, advent] = repertoire.concerts;

	it('reads the guests and who organises it', () => {
		expect(repertoire.ensembles.map((e) => e.name)).toEqual(['Kammerchor Unna']);
		expect(herbst.partners.map((p) => p.name)).toEqual(['Kammerchor Unna']);
		expect(herbst.organizer).toBeUndefined();
		expect(advent.partners.map((p) => p.name)).toEqual(['Kammerchor Unna', 'Posaunenchor Kamen']);
		expect(advent.organizer?.name).toBe('Kammerchor Unna');
	});

	it('puts ours first, then the guests, then what we play together', () => {
		expect(herbst.program.map((entry) => [entry.pieceName, entry.orchestra])).toEqual([
			['Egmont Ouvertüre', 'EO'],
			['Unbekannt', 'EO'],
			['Abendlied', 'KCH'],
			['Halleluja', 'EO, KCH']
		]);
		expect(herbst.program.find((entry) => entry.pieceName === 'Abendlied')).toMatchObject({ composer: 'Josef Rheinberger', publisher: 'Carus', duration: 190 });
	});

	it('doesn’t report guest pieces as missing from "Stücke", only ours', () => {
		const unknown = repertoire.problems.filter((problem) => problem.kind === 'unknown-piece').map((problem) => problem.value);
		expect(unknown).toEqual(['Unbekannt']);
	});

	it('also reads a sheet without the new columns and tab', () => {
		const old = buildRepertoire({
			pieces: [['Titel']],
			concerts: [['Datum', 'Anlass', 'Orchester'], ['2026-11-22', 'Herbstkonzert', 'EO']],
			program: [['Konzert', 'Nr.', 'Stück', 'Orchester'], ['Herbstkonzert', '1', 'Bolero', '']]
		});
		expect(old.ensembles).toEqual([]);
		expect(old.concerts[0].partners).toEqual([]);
		const missing = old.problems.filter((problem) => problem.kind === 'missing-column').map((problem) => `${problem.tab}: ${problem.value}`);
		for (const column of ['Konzerte: Mitwirkende', 'Konzerte: Veranstalter', 'Programm: Komponist', 'Programm: Verlag', 'Programm: Dauer']) expect(missing).not.toContain(column);
	});
});

describe('the music list of a concert with guests', () => {
	const pieces = [
		{ title: 'Egmont Ouvertüre', composer: 'Beethoven', composerFull: 'Ludwig van Beethoven', publisher: 'Breitkopf', duration: 510, performers: 'EO' },
		{ title: 'Abendlied', composer: 'Josef Rheinberger', composerFull: 'Josef Rheinberger', publisher: 'Carus', duration: 190, performers: 'Kammerchor Unna' }
	];

	it('says who performs each piece, last', () => {
		const rows = reportRows(pieces);
		expect(rows[0].at(-1)).toBe('Ausführende');
		expect(rows[2]).toEqual(['2', 'Abendlied', 'Josef Rheinberger', '', 'Carus', '3:10', 'Kammerchor Unna']);
		expect(reportGaps(pieces)).toEqual([]);
	});

	it('has no such column without guests', () => {
		expect(reportRows([{ title: 'Bolero' }])[0]).not.toContain('Ausführende');
	});
});

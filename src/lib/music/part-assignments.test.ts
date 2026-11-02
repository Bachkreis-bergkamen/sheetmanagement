import { describe, expect, it } from 'vitest';
import { config } from '#lib/config/index.ts';
import { LAYOUT } from '#lib/repertoire/sheet.ts';
import { parseInstruments } from './my-parts.ts';
import { buildPartAssignments, checkAssignment, choicesAt, type PartAssignment } from './part-assignments.ts';

const header = Object.values(LAYOUT.partAssignments.columns);

let row = 2;
const assignment = (who: string, part: string, pieceName = '', concert = ''): PartAssignment => ({
	row: row++,
	id: `a${row}`,
	who,
	part,
	pieceName,
	concert,
	by: 'David',
	at: '2026-11-01'
});
const sax = { email: 'sven@example.org', choices: parseInstruments('Alt-Saxophon', config) };
const anna = { email: 'Anna@Example.org', choices: parseInstruments('Geige II, Viola', config) };
const shown = (choices: ReturnType<typeof choicesAt>) => choices.map((choice) => `${choice.instrument}${choice.numbers.join('&')}${choice.assigned ? '*' : ''}`);

describe('buildPartAssignments', () => {
	it('reads assignments and skips rows without who or part', () => {
		const { assignments } = buildPartAssignments([
			header,
			['Alt-Saxophon', 'Fagott', '', 'Herbstkonzert', 'David', '2026-11-01', 'a1'],
			['Alt-Saxophon', '', '', '', 'David', '2026-11-01', 'a2'],
			['', 'Fagott', '', '', '', '', 'a3']
		]);
		expect(assignments).toEqual([
			{ row: 2, id: 'a1', who: 'Alt-Saxophon', part: 'Fagott', pieceName: '', concert: 'Herbstkonzert', by: 'David', at: '2026-11-01' }
		]);
	});
});

describe('choicesAt', () => {
	it('keeps a player on their own instruments without an assignment', () => {
		expect(shown(choicesAt(sax, [], { piece: 'Egmont' }, config))).toEqual(['Alt-Saxophon']);
	});

	it('gives every player of an instrument the assigned part instead', () => {
		const all = [assignment('Alt-Saxophon', 'Fagott II')];
		expect(shown(choicesAt(sax, all, { piece: 'Egmont' }, config))).toEqual(['Fagott2*']);
		expect(shown(choicesAt(anna, all, { piece: 'Egmont' }, config))).toEqual(['Geige2', 'Viola']);
	});

	it('replaces only the instrument it names of someone playing several', () => {
		const all = [assignment('Viola', 'Geige III')];
		expect(shown(choicesAt(anna, all, { piece: 'Egmont' }, config))).toEqual(['Geige3*', 'Geige2']);
	});

	it('replaces all of a member’s instruments, found by address in any case', () => {
		const all = [assignment('anna@example.org', 'Violoncello')];
		expect(shown(choicesAt(anna, all, { piece: 'Egmont' }, config))).toEqual(['Violoncello*']);
	});

	it('gives a member without an instrument the assigned part', () => {
		const conductor = { email: 'david@example.org', choices: [] };
		expect(shown(choicesAt(conductor, [assignment('david@example.org', 'Pauken')], { piece: 'Egmont' }, config))).toEqual(['Pauke*']);
	});

	it('holds for one piece and one concert only when it says so', () => {
		const all = [assignment('Alt-Saxophon', 'Fagott', 'Egmont Ouvertüre', 'Herbstkonzert 2026')];
		expect(shown(choicesAt(sax, all, { piece: 'egmont ouverture', concerts: ['Herbstkonzert 2026'] }, config))).toEqual(['Fagott*']);
		expect(shown(choicesAt(sax, all, { piece: 'Morgenstimmung', concerts: ['Herbstkonzert 2026'] }, config))).toEqual(['Alt-Saxophon']);
		expect(shown(choicesAt(sax, all, { piece: 'Egmont Ouvertüre', concerts: ['Sommerkonzert 2027'] }, config))).toEqual(['Alt-Saxophon']);
		expect(shown(choicesAt(sax, all, { piece: 'Egmont Ouvertüre' }, config))).toEqual(['Alt-Saxophon']);
	});

	it('lets the narrowest assignment win', () => {
		const all = [
			assignment('Alt-Saxophon', 'Fagott'),
			assignment('Alt-Saxophon', 'Klarinette', '', 'Herbstkonzert'),
			assignment('sven@example.org', 'Violoncello', 'Egmont')
		];
		expect(shown(choicesAt(sax, all, { piece: 'Morgenstimmung' }, config))).toEqual(['Fagott*']);
		expect(shown(choicesAt(sax, all, { piece: 'Morgenstimmung', concerts: ['Herbstkonzert'] }, config))).toEqual(['Klarinette*']);
		expect(shown(choicesAt(sax, all, { piece: 'Egmont', concerts: ['Herbstkonzert'] }, config))).toEqual(['Violoncello*']);
	});

	it('gives all parts of equally narrow assignments', () => {
		const all = [assignment('Alt-Saxophon', 'Fagott'), assignment('Alt-Saxophon', 'Violoncello')];
		expect(shown(choicesAt(sax, all, { piece: 'Egmont' }, config))).toEqual(['Fagott*', 'Violoncello*']);
	});

	it('keeps the own instrument when the assigned part can’t be read', () => {
		expect(shown(choicesAt(sax, [assignment('Alt-Saxophon', 'Gedöns')], { piece: 'Egmont' }, config))).toEqual(['Alt-Saxophon']);
	});
});

describe('checkAssignment', () => {
	const offered = { who: ['Alt-Saxophon', 'sven@example.org'], concerts: ['Herbstkonzert'] };

	it('accepts what the page offered and a part the app can read', () => {
		expect(checkAssignment({ who: 'Alt-Saxophon', part: ' Fagott II ', concert: 'Herbstkonzert' }, offered, config)).toEqual({
			values: { who: 'Alt-Saxophon', part: 'Fagott II', concert: 'Herbstkonzert' }
		});
		expect(checkAssignment({ who: 'sven@example.org', part: 'Cello', concert: '' }, offered, config)).toEqual({
			values: { who: 'sven@example.org', part: 'Cello', concert: '' }
		});
	});

	it('refuses anything else', () => {
		expect(checkAssignment({ who: 'Tuba', part: 'Fagott', concert: '' }, offered, config)).toEqual({ problem: 'who' });
		expect(checkAssignment({ who: 'Alt-Saxophon', part: 'Gedöns', concert: '' }, offered, config)).toEqual({ problem: 'part' });
		expect(checkAssignment({ who: 'Alt-Saxophon', part: 'Fagott', concert: 'Neujahr' }, offered, config)).toEqual({ problem: 'concert' });
	});
});

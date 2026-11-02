import { describe, expect, it } from 'vitest';
import { archiveGaps, doneFileIds, isDone, parsePriority, planMissingParts, priorityRank, reportedGaps, scanTasks, type Gap } from './missing-parts.ts';

const HEADER = ['Stück', 'Stimme', 'Status', 'Datei-ID', 'erledigt'];
const gap = (fileId: string, status: Gap['status'] = 'missing', piece = 'Bolero', part = `Stimme ${fileId}`): Gap => ({
	fileId,
	piece,
	part,
	status
});
const row = (g: Gap, done = '') => [g.piece, g.part, { missing: 'fehlt', empty: 'leer', incomplete: 'Seiten fehlen' }[g.status], g.fileId, done];

describe('archiveGaps', () => {
	it('lists missing, empty and incomplete parts, but not recordings or other files', () => {
		const gaps = archiveGaps(
			[
				{
					id: 'p1',
					title: 'Bolero',
					parts: [
						{ id: 'a', label: 'Flöte', status: 'missing', kind: 'stimme' },
						{ id: 'b', label: 'Oboe', status: 'ok', kind: 'stimme' },
						{ id: 'c', label: 'Aufnahme', status: 'missing', kind: 'audio' },
						{ id: 'd', label: 'Notizen', status: 'empty', kind: 'sonstiges' },
						{ id: 'e', label: 'Horn', status: 'incomplete', kind: 'stimme' }
					]
				}
			],
			(id) => (id === 'p1' ? 'Boléro' : undefined)
		);
		expect(gaps).toEqual([
			{ fileId: 'a', piece: 'Boléro', part: 'Flöte', status: 'missing' },
			{ fileId: 'e', piece: 'Boléro', part: 'Horn', status: 'incomplete' }
		]);
	});
});

describe('isDone', () => {
	it('reads checkboxes in English and German sheets and typed marks', () => {
		for (const value of ['TRUE', 'WAHR', 'x', ' ja ', 'erledigt']) expect(isDone(value)).toBe(true);
		for (const value of ['', 'FALSE', 'FALSCH', 'nein']) expect(isDone(value)).toBe(false);
	});
});

describe('planMissingParts', () => {
	it('fills an empty tab', () => {
		const plan = planMissingParts([HEADER], [gap('a'), gap('b', 'empty')]);
		expect(plan.changed).toBe(true);
		expect(plan.added.map((g) => g.fileId)).toEqual(['a', 'b']);
		expect(plan.removed).toEqual([]);
		expect(plan.body).toEqual([
			['Bolero', 'Stimme a', 'fehlt', 'a', false],
			['Bolero', 'Stimme b', 'leer', 'b', false]
		]);
	});

	it('changes nothing when the tab already matches', () => {
		const gaps = [gap('a'), gap('b')];
		const plan = planMissingParts([HEADER, row(gaps[0], 'TRUE'), row(gaps[1])], gaps);
		expect(plan.changed).toBe(false);
		expect(plan.kept.map((k) => [k.row, k.done])).toEqual([
			[2, true],
			[3, false]
		]);
		expect(plan.done).toEqual(['a']);
	});

	it('removes fixed gaps, appends new ones and keeps "erledigt" on rows that stay', () => {
		const [a, b, c, d] = [gap('a'), gap('b'), gap('c'), gap('d')];
		const e = gap('e');
		const plan = planMissingParts([HEADER, row(a, 'TRUE'), row(b, 'TRUE'), row(c, 'WAHR'), row(e)], [c, a, d]);
		expect(plan.removed).toEqual([3, 5]);
		expect(plan.added).toEqual([d]);
		expect(plan.kept.map((k) => k.gap.fileId)).toEqual(['a', 'c']);
		expect(plan.done).toEqual(['a', 'c']);
		// Kept rows stay in sheet order, the new one follows, and the last row is cleared.
		expect(plan.body).toEqual([
			['Bolero', 'Stimme a', 'fehlt', 'a', true],
			['Bolero', 'Stimme c', 'fehlt', 'c', true],
			['Bolero', 'Stimme d', 'fehlt', 'd', false],
			['', '', '', '', '']
		]);
	});

	it('clears the whole tab when every gap is fixed', () => {
		const plan = planMissingParts([HEADER, row(gap('a')), [], row(gap('b'))], []);
		expect(plan.changed).toBe(true);
		expect(plan.removed).toEqual([2, 4]);
		expect(plan.body).toEqual(Array(3).fill(['', '', '', '', '']));
	});

	it('updates a row whose status or piece name changed', () => {
		const plan = planMissingParts([HEADER, row(gap('a', 'missing'), 'TRUE')], [gap('a', 'incomplete', 'Boléro')]);
		expect(plan.changed).toBe(true);
		expect(plan.added).toEqual([]);
		expect(plan.removed).toEqual([]);
		expect(plan.body).toEqual([['Boléro', 'Stimme a', 'Seiten fehlen', 'a', true]]);
	});

	it('drops rows without a file id and repeated file ids', () => {
		const a = gap('a');
		const plan = planMissingParts([HEADER, ['von Hand', '', '', '', ''], row(a), row(a, 'TRUE')], [a]);
		expect(plan.removed).toEqual([2, 4]);
		expect(plan.kept.map((k) => k.row)).toEqual([3]);
	});

	it('follows the columns wherever they are and keeps extra columns with their row', () => {
		const header = ['Datei-ID', 'erledigt', 'Notiz', 'Stück', 'Stimme', 'Status'];
		const [a, b] = [gap('a'), gap('b')];
		const plan = planMissingParts(
			[header, ['b', '', 'kommt bald', b.piece, b.part, 'fehlt'], ['x', 'TRUE', 'weg', 'Alt', 'Alt', 'fehlt']],
			[a, b]
		);
		expect(plan.body).toEqual([
			['b', false, 'kommt bald', 'Bolero', 'Stimme b', 'fehlt'],
			['a', false, '', 'Bolero', 'Stimme a', 'fehlt']
		]);
	});

	it('keeps the planned scan with its row, and syncs a tab without those columns', () => {
		const header = [...HEADER, 'Priorität', 'Wer scannt'];
		const [a, b] = [gap('a'), gap('b')];
		const plan = planMissingParts([header, [...row(a), 'hoch', 'nora@example.org'], [...row(gap('x')), 'mittel', 'tom@example.org']], [a, b]);
		expect(plan.ok).toBe(true);
		expect(plan.body).toEqual([
			['Bolero', 'Stimme a', 'fehlt', 'a', false, 'hoch', 'nora@example.org'],
			['Bolero', 'Stimme b', 'fehlt', 'b', false, '', '']
		]);
		expect(planMissingParts([HEADER], [a]).ok).toBe(true);
	});

	it('writes nothing when a column is missing', () => {
		const plan = planMissingParts([['Stück', 'Stimme', 'Status', 'erledigt']], [gap('a')]);
		expect(plan.ok).toBe(false);
		expect(plan.changed).toBe(false);
	});
});

describe('doneFileIds', () => {
	it('reads the ticked rows as they are', () => {
		expect(doneFileIds([HEADER, row(gap('a'), 'TRUE'), row(gap('b')), ['', '', '', '', 'TRUE']])).toEqual(['a']);
		expect(doneFileIds([])).toEqual([]);
	});
});

describe('reportedGaps', () => {
	const report = (id: string, fileId: string, kind: 'missing' | 'scan' | 'pages' | 'wrong' | 'recording' | 'other', marked?: Gap['status']) => ({
		id,
		part: fileId ? `Stimme ${fileId}` : '',
		fileId,
		kind,
		comment: '',
		marked
	});

	it('leaves out a reported Hörbeispiel: it is no gap in the parts', () => {
		expect(reportedGaps([], [report('r1', '', 'recording')])).toEqual([]);
	});

	it('counts app-only reports with the status their kind stands for', () => {
		const gaps = reportedGaps([], [report('r1', 'a', 'missing'), report('r2', 'b', 'pages'), report('r3', 'c', 'scan')]);
		expect(gaps.map((g) => [g.id, g.status])).toEqual([
			['r1', 'missing'],
			['r2', 'incomplete'],
			['r3', 'incomplete']
		]);
	});

	it('leaves out reports on parts whose file name already marks a gap', () => {
		expect(reportedGaps(['a'], [report('r1', 'a', 'missing'), report('r2', 'b', 'wrong')]).map((g) => g.id)).toEqual(['r2']);
	});

	it('counts several reports on one file once, but every whole-piece report', () => {
		const gaps = reportedGaps([], [report('r1', 'a', 'scan'), report('r2', 'a', 'missing'), report('r3', '', 'missing'), report('r4', '', 'other')]);
		expect(gaps.map((g) => g.id)).toEqual(['r1', 'r3', 'r4']);
	});

	it('uses the word the app put in the file name when the archive index has not caught up yet', () => {
		expect(reportedGaps([], [report('r1', 'a', 'missing', 'empty')])[0].status).toBe('empty');
	});
});

describe('scan jobs', () => {
	it('reads priorities in German and English, and nothing else', () => {
		expect(['hoch', ' Hoch ', 'high'].map(parsePriority)).toEqual(['high', 'high', 'high']);
		expect(parsePriority('niedrig')).toBe('low');
		expect(parsePriority('')).toBeUndefined();
		expect(parsePriority('sofort')).toBeUndefined();
	});

	it('sorts high first and no priority last', () => {
		const sorted = [undefined, 'low', 'high', 'medium'].sort((a, b) => priorityRank(a as never) - priorityRank(b as never));
		expect(sorted).toEqual(['high', 'medium', 'low', undefined]);
	});

	it('reads the planned scans by file id, e-mails as e-mails', () => {
		const header = [...HEADER, 'Priorität', 'Wer scannt'];
		const tasks = scanTasks([
			header,
			[...row(gap('a'), 'TRUE'), 'hoch', ' Nora@Example.org '],
			[...row(gap('b')), '', ''],
			[...row(gap('c')), '', 'tom@example.org']
		]);
		expect([...tasks]).toEqual([
			['a', { priority: 'high', assignee: 'nora@example.org', done: true }],
			['c', { priority: undefined, assignee: 'tom@example.org', done: false }]
		]);
		expect(scanTasks([HEADER, row(gap('a'))]).size).toBe(0);
	});
});

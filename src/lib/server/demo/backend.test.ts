import { beforeEach, describe, expect, it } from 'vitest';
import { buildRepertoire, LAYOUT } from '#lib/repertoire/sheet.ts';
import { buildRehearsalPlan } from '#lib/rehearsals/plan.ts';
import { insertEvent, listEvents } from '../google/calendar.ts';
import { downloadFile, getFile, listChildren } from '../google/drive.ts';
import { appendRows, batchUpdate, getTabs, getValues, tabRange, updateValues } from '../google/sheets.ts';
import { demoClient, parseRange, resetDemo } from './backend.ts';
import { DEMO_IDS, demoSheet } from './data.ts';

const client = demoClient();
const sheet = DEMO_IDS.sheet;
const read = async (tab: string) => (await getValues(client, sheet, [tabRange(tab)]))[tabRange(tab)];

beforeEach(() => resetDemo());

describe('parseRange', () => {
	it.each([
		["'Stücke'", { tab: 'Stücke', row: 0, column: 0 }],
		["'Stücke'!1:1", { tab: 'Stücke', row: 0, column: 0, rows: 1 }],
		["'O''Brien'!C5", { tab: "O'Brien", row: 4, column: 2 }],
		["'Proben'!AA2:AC9", { tab: 'Proben', row: 1, column: 26 }]
	])('reads %s', (range, expected) => {
		expect(parseRange(range)).toEqual(expected);
	});
});

describe('the sample sheet', () => {
	it('reads without problems', () => {
		const values = demoSheet(Date.now());
		const repertoire = buildRepertoire({
			pieces: values.get(LAYOUT.pieces.tab)!,
			concerts: values.get(LAYOUT.concerts.tab)!,
			program: values.get(LAYOUT.program.tab)!,
			ensembles: values.get(LAYOUT.ensembles.tab)
		});
		expect(repertoire.problems).toEqual([]);
		// The 2nd Christmas concert plays the 1st one's programme.
		expect(repertoire.concertsByEvent.get('demo-weihnacht-2')?.program.length).toBe(5);
		// … with its guest choir, whose pieces aren't in "Stücke" and aren't problems.
		expect(repertoire.concertsByEvent.get('demo-weihnacht-2')?.partners.map((partner) => partner.name)).toEqual(['Kammerchor Musterstadt']);
		expect(buildRehearsalPlan(values.get(LAYOUT.rehearsals.tab)!).byEvent.get('demo-probe-3')?.length).toBe(2);
	});
});

describe('the fake Sheets API', () => {
	it('appends, updates and deletes rows like Google', async () => {
		const tab = LAYOUT.rehearsals.tab;
		const before = await read(tab);
		await appendRows(client, sheet, tabRange(tab), [['Probe', 'Bolero', '', 'demo-probe-4']]);
		expect((await read(tab)).at(-1)).toEqual(['Probe', 'Bolero', '', 'demo-probe-4']);

		await updateValues(client, sheet, [{ range: tabRange(tab, 'C2'), values: [['Notiz']] }]);
		expect((await read(tab))[1][2]).toBe('Notiz');

		const { sheetId } = (await getTabs(client, sheet)).find((t) => t.title === tab)!;
		await batchUpdate(client, sheet, [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 } } }]);
		expect(await read(tab)).toHaveLength(before.length);
	});

	it('adds tabs and reads just the header row', async () => {
		await batchUpdate(client, sheet, [{ addSheet: { properties: { title: 'Neu' } } }]);
		expect((await getTabs(client, sheet)).some((t) => t.title === 'Neu')).toBe(true);
		const header = tabRange(LAYOUT.pieces.tab, '1:1');
		expect((await getValues(client, sheet, [header]))[header]).toHaveLength(1);
	});

	it('starts over after a reset', async () => {
		await appendRows(client, sheet, tabRange(LAYOUT.wishes.tab), [['x']]);
		const changed = (await read(LAYOUT.wishes.tab)).length;
		resetDemo();
		expect(await read(LAYOUT.wishes.tab)).toHaveLength(changed - 1);
	});
});

describe('the fake Drive and Calendar', () => {
	it('lists folders, serves PDFs and events', async () => {
		const pieces = await listChildren(client, [DEMO_IDS.archive]);
		expect(pieces.map((f) => f.name)).toContain('Mozart KV 525 - Eine kleine Nachtmusik');
		const parts = await listChildren(client, ['demo-nachtmusik']);
		expect(parts.map((f) => f.name)).toContain('Eine kleine Nachtmusik - Geige II.pdf');
		expect((await getFile(client, parts[0].id)).name).toBe(parts[0].name);

		const pdf = await (await downloadFile(client, 'demo-nachtmusik-2')).text();
		expect(pdf.startsWith('%PDF-1.4')).toBe(true);
		expect(pdf).toContain('(Geige II)');

		const events = await listEvents(client, DEMO_IDS.calendar, { from: new Date(Date.now() - 365 * 86_400_000) });
		expect(events.map((e) => e.title)).toContain('Herbstkonzert');
	});
});

describe('demo calendar', () => {
	beforeEach(() => resetDemo());

	it('keeps an added event in memory, like Google would', async () => {
		const day = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
		const created = await insertEvent(client, DEMO_IDS.calendar, {
			summary: 'Probe Frühlingskonzert',
			location: 'Aula',
			start: { dateTime: `${day}T10:00:00`, timeZone: 'Europe/Berlin' },
			end: { dateTime: `${day}T13:00:00`, timeZone: 'Europe/Berlin' }
		});
		expect(created).toMatchObject({ title: 'Probe Frühlingskonzert', start: `${day}T10:00:00`, allDay: false, location: 'Aula' });
		const events = await listEvents(client, DEMO_IDS.calendar, { from: new Date() });
		expect(events.map((event) => event.id)).toContain(created.id);
	});
});

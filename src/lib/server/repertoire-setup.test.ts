import { describe, expect, it } from 'vitest';
import { MEMBER_STATUSES, RIGHTS } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import type { GoogleClient } from './google/client.ts';
import { columnLetter } from './google/sheets.ts';
import { setUpSheet } from './repertoire-setup.ts';

interface FakeTab {
	sheetId: number;
	title: string;
	values: string[][];
	protections: string[];
}

/** A tiny in-memory stand-in for the Sheets API calls setup makes. */
function fakeSheets(tabs: FakeTab[]) {
	const requests: Record<string, unknown>[] = [];
	const valueWrites: { range: string; values: string[][] }[] = [];
	const tabOf = (range: string) => tabs.find((tab) => range.startsWith(`'${tab.title}'`));

	const client = {
		async request(url: string, { method = 'GET', body }: { method?: string; body?: any } = {}) {
			const target = new URL(url);
			if (method === 'GET' && target.pathname.endsWith('values:batchGet')) {
				const ranges = target.searchParams.getAll('ranges');
				return {
					valueRanges: ranges.map((range) => {
						const values = tabOf(range)?.values ?? [];
						return { values: range.endsWith('!1:1') ? values.slice(0, 1) : values };
					})
				};
			}
			if (method === 'GET') {
				return {
					sheets: tabs.map((tab) => ({
						properties: { sheetId: tab.sheetId, title: tab.title },
						protectedRanges: tab.protections.map((description) => ({ description }))
					}))
				};
			}
			if (target.pathname.endsWith('values:batchUpdate')) {
				for (const write of body.data) {
					valueWrites.push(write);
					const tab = tabOf(write.range)!;
					const [, start, row] = write.range.match(/!([A-Z]+)(\d+)$/)!;
					const offset = [...Array(26).keys()].find((i) => columnLetter(i) === start)!;
					write.values.forEach((cells: string[], r: number) => {
						const at = Number(row) - 1 + r;
						tab.values[at] = [...(tab.values[at] ?? [])];
						cells.forEach((value, i) => (tab.values[at][offset + i] = value));
					});
				}
				return {};
			}
			for (const request of body.requests) {
				requests.push(request);
				if (request.addSheet) {
					tabs.push({ sheetId: 100 + tabs.length, title: request.addSheet.properties.title, values: [], protections: [] });
				}
				if (request.deleteSheet) tabs.splice(tabs.findIndex((tab) => tab.sheetId === request.deleteSheet.sheetId), 1);
				if (request.addProtectedRange) {
					const range = request.addProtectedRange.protectedRange;
					tabs.find((tab) => tab.sheetId === range.range.sheetId)!.protections.push(range.description);
				}
			}
			return { replies: [] };
		}
	} as unknown as GoogleClient;
	return { client, tabs, requests, valueWrites };
}

const kinds = (requests: Record<string, unknown>[]) => requests.map((request) => Object.keys(request)[0]);

const labels = (values: Record<string, string>) => Object.values(values).map((value) => ({ userEnteredValue: value }));

describe('setUpSheet', () => {
	it('turns a new, empty spreadsheet into all tabs', async () => {
		const fake = fakeSheets([{ sheetId: 0, title: 'Tabellenblatt1', values: [], protections: [] }]);
		const result = await setUpSheet(fake.client, 'sheet', { orchestras: ['EO', 'A'] });

		const all = [
			'Stücke',
			'Konzerte',
			'Programm',
			'Ensembles',
			'Mitglieder',
			'Gruppen',
			'Rechte',
			'Zugangsanfragen',
			'Meldungen',
			'Wünsche',
			'Fehlende Stimmen',
			'Instrumentgruppen',
			'Anmeldungen',
			'Proben',
			'Leihmaterial',
			'Anwesenheit',
			'Hinweise',
			'Probennotizen',
			'Instrumente',
			'Einstellungen'
		];
		expect(result).toEqual({ createdTabs: all, addedColumns: [], removedTab: 'Tabellenblatt1' });
		expect(fake.tabs.map((tab) => tab.title)).toEqual(all);
		expect(fake.tabs[1].values[0]).toEqual(['Datum', 'Anlass', 'Ort', 'Orchester', 'Programm wie', 'Kalender-Event-ID', 'Mitwirkende', 'Veranstalter']);
		expect(fake.tabs[2].values[0]).toEqual(['Konzert', 'Nr.', 'Stück', 'Notiz', 'Orchester', 'Komponist', 'Arrangeur', 'Verlag', 'Dauer']);
		expect(fake.tabs[3].values[0]).toEqual(['Kurzname', 'Name', 'Art', 'Leitung', 'Website', 'Logo']);

		const dropdowns = fake.requests.filter((r) => 'setDataValidation' in r) as any[];
		expect(dropdowns.map((r) => r.setDataValidation.rule.condition.values)).toEqual([
			[{ userEnteredValue: "='Konzerte'!$B$2:$B" }],
			[{ userEnteredValue: "='Stücke'!$A$2:$A" }],
			[{ userEnteredValue: "='Konzerte'!$B$2:$B" }],
			[{ userEnteredValue: "='Ensembles'!$A$2:$A" }],
			labels(t.sheetValues.ensembleKinds),
			[{ userEnteredValue: "='Stücke'!$A$2:$A" }],
			RIGHTS.map((right) => ({ userEnteredValue: right })),
			MEMBER_STATUSES.map((status) => ({ userEnteredValue: status })),
			labels(t.feedbackValues.reportKind),
			labels(t.feedbackValues.reportStatus),
			labels(t.feedbackValues.wishKind),
			labels(t.feedbackValues.wishStatus),
			undefined,
			undefined,
			labels(t.signups.answerValues),
			[{ userEnteredValue: "='Stücke'!$A$2:$A" }],
			undefined,
			undefined,
			[{ userEnteredValue: "='Stücke'!$A$2:$A" }],
			[{ userEnteredValue: "='Konzerte'!$B$2:$B" }],
			[{ userEnteredValue: 'EO' }, { userEnteredValue: 'A' }, { userEnteredValue: 'EO, A' }],
			[{ userEnteredValue: 'EO' }, { userEnteredValue: 'A' }, { userEnteredValue: 'EO, A' }]
		]);
		expect(fake.tabs[10].values[0]).toEqual(['Stück', 'Stimme', 'Status', 'Datei-ID', 'erledigt']);
		// "erledigt" is a checkbox column.
		const checkbox = dropdowns.find((r) => r.setDataValidation.rule.condition.type === 'BOOLEAN');
		expect(checkbox.setDataValidation.range).toMatchObject({ sheetId: fake.tabs[10].sheetId, startColumnIndex: 4 });

		expect(fake.tabs[11].values[0]).toEqual(['Stimme', 'Gespielt von', 'Gegenseitig', 'Notiz']);

		const protections = (fake.requests as any[]).filter((r) => r.addProtectedRange).map((r) => r.addProtectedRange.protectedRange);
		// Drive folder id, event id, report id, wish id, file id, the sign-ups', rehearsals' and attendance's event ids, note id and rehearsal note event id …
		expect(protections.filter((p) => p.description === 'sheetmanagement: id column')).toHaveLength(10);
		// … and piece, part and status of "Fehlende Stimmen", all warning only.
		const generated = protections.filter((p) => p.description === 'sheetmanagement: generated column');
		expect(generated.map((p) => p.range.startColumnIndex)).toEqual([0, 1, 2]);
		expect(protections.every((p) => p.warningOnly)).toBe(true);
	});

	it('only adds what is missing when run again, and keeps other tabs', async () => {
		const fake = fakeSheets([
			{ sheetId: 0, title: 'Notizen', values: [['etwas']], protections: [] },
			{ sheetId: 1, title: 'Stücke', values: [['Drive-Ordner-ID', 'Titel'], ['abc', 'Bolero']], protections: [] }
		]);
		await setUpSheet(fake.client, 'sheet', { orchestras: ['EO'] });
		const first = fake.requests.length;
		const result = await setUpSheet(fake.client, 'sheet', { orchestras: ['EO'] });

		expect(result.createdTabs).toEqual([]);
		expect(result.addedColumns).toEqual([]);
		expect(fake.tabs.map((tab) => tab.title).slice(0, 4)).toEqual(['Notizen', 'Stücke', 'Konzerte', 'Programm']);
		// Existing columns stay where they are; missing ones follow.
		expect(fake.tabs[1].values[0].slice(0, 3)).toEqual(['Drive-Ordner-ID', 'Titel', 'Komponist']);
		expect(fake.tabs[1].values[1]).toEqual(['abc', 'Bolero']);
		// The dropdown follows the title column wherever it is.
		const pieceDropdown = (fake.requests as any[]).find(
			(r) => r.setDataValidation?.rule.condition.values[0].userEnteredValue?.includes('Stücke')
		);
		expect(pieceDropdown.setDataValidation.rule.condition.values[0].userEnteredValue).toBe("='Stücke'!$B$2:$B");
		// No second protection, no deleted tab.
		const second = fake.requests.slice(first);
		expect(kinds(second)).not.toContain('addProtectedRange');
		expect(kinds(fake.requests)).not.toContain('deleteSheet');
	});
});

describe('setUpSheet: instrument groups', () => {
	it('fills a new "Instrumentgruppen" tab with the preset groups, but never an existing one', async () => {
		const fake = fakeSheets([{ sheetId: 0, title: 'Tabellenblatt1', values: [], protections: [] }]);
		await setUpSheet(fake.client, 'sheet', { orchestras: ['EO'], sharedParts: { 'B-Stimmen': ['Klarinette', 'Trompete'] } });
		const tab = fake.tabs.find((t) => t.title === 'Instrumentgruppen')!;
		expect(tab.values.slice(0, 2)).toEqual([
			['Stimme', 'Gespielt von', 'Gegenseitig', 'Notiz'],
			['B-Stimmen', 'Klarinette, Trompete', '', '']
		]);

		const writes = fake.valueWrites.length;
		await setUpSheet(fake.client, 'sheet', { orchestras: ['EO'], sharedParts: { 'B-Stimmen': ['Klarinette'] } });
		expect(fake.valueWrites.length).toBe(writes);
	});
});

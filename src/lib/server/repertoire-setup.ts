import { MEMBER_STATUSES, RIGHTS } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { defaultRows, type SharedParts } from '#lib/music/instrument-groups.ts';
import { orchestraChoices } from '#lib/repertoire/orchestras.ts';
import { ALL_ON, FEATURE_TABS, type Features } from '#lib/features.ts';
import { LAYOUT, normalize, type TabKey } from '#lib/repertoire/sheet.ts';
import type { GoogleClient } from './google/client.ts';
import { batchUpdate, columnLetter, getTabs, getValues, tabRange, updateValues } from './google/sheets.ts';

/** Marks the protection the app puts on id columns, so setup doesn't add it twice. */
const ID_PROTECTION = 'sheetmanagement: id column';
/** Same for the columns the app rewrites on every sync. */
const GENERATED_PROTECTION = 'sheetmanagement: generated column';
const ALL_TABS = Object.keys(LAYOUT) as TabKey[];
const ID_COLUMNS: Partial<Record<TabKey, string>> = {
	pieces: 'driveFolderId',
	concerts: 'eventId',
	reports: 'id',
	wishes: 'id',
	missingParts: 'fileId',
	signups: 'eventId',
	rehearsals: 'eventId',
	attendance: 'eventId',
	pieceNotes: 'id',
	rehearsalNotes: 'eventId'
};
/** Filled by the app; edits there are overwritten, so they get a warning. */
const GENERATED_COLUMNS: Partial<Record<TabKey, string[]>> = {
	missingParts: ['piece', 'part', 'status']
};
const TEXT_COLUMNS: Partial<Record<TabKey, string[]>> = {
	// "7:30" would otherwise become a time of day.
	pieces: ['reviewedAt', 'duration'],
	concerts: ['date'],
	program: ['duration'],
	members: ['pausedUntil'],
	requests: ['requestedAt'],
	reports: ['reportedAt'],
	wishes: ['submittedAt', 'votes'],
	signups: ['answeredAt'],
	loans: ['borrowedAt', 'dueAt'],
	pieceNotes: ['at'],
	rehearsalNotes: ['at']
};
const WIDTHS: Record<string, number> = {
	title: 280,
	concert: 240,
	piece: 280,
	notes: 240,
	position: 60,
	players: 320,
	date: 110,
	comment: 280,
	description: 320,
	answer: 240,
	rehearsal: 280,
	sameProgramAs: 240,
	partners: 240,
	organizer: 200,
	website: 240,
	logo: 240,
	from: 200,
	event: 240,
	duration: 80,
	note: 320,
	done: 280,
	practise: 280,
	next: 280
};

const HEADER_BACKGROUND = { red: 0.93, green: 0.94, blue: 0.96 };
const ID_TEXT = { red: 0.6, green: 0.6, blue: 0.6 };

export interface SetupResult {
	createdTabs: string[];
	addedColumns: string[];
	removedTab?: string;
}

/**
 * Prepares the Repertoire sheet: adds missing tabs and header columns, then formats
 * headers, greys out and protects id columns (warning only), protects generated
 * columns (warning only) and adds the dropdowns and checkboxes.
 * Safe to run again at any time: it never removes or overwrites data.
 */
export async function setUpSheet(
	client: GoogleClient,
	spreadsheetId: string,
	{ orchestras, sharedParts, features = ALL_ON }: { orchestras: string[]; sharedParts?: SharedParts; features?: Features }
): Promise<SetupResult> {
	const before = await getTabs(client, spreadsheetId);
	const exists = (key: TabKey) => before.some((tab) => tab.title === LAYOUT[key].tab);
	// A tab that's already there is kept and formatted even when its feature is off.
	const TAB_KEYS = ALL_TABS.filter((key) => {
		const feature = FEATURE_TABS[key];
		return !feature || features[feature] || exists(key);
	});
	const missingTabs = TAB_KEYS.filter((key) => !exists(key));
	await batchUpdate(
		client,
		spreadsheetId,
		missingTabs.map((key) => ({
			addSheet: { properties: { title: LAYOUT[key].tab, gridProperties: { frozenRowCount: 1 } } }
		}))
	);
	const tabs = missingTabs.length ? await getTabs(client, spreadsheetId) : before;
	const tabOf = (key: TabKey) => tabs.find((tab) => tab.title === LAYOUT[key].tab)!;

	// A brand-new spreadsheet has one empty default tab ("Tabellenblatt1"); it goes.
	const lone = before.length === 1 && missingTabs.length === TAB_KEYS.length ? before[0] : undefined;
	const ranges = [...TAB_KEYS.map((key) => tabRange(LAYOUT[key].tab, '1:1')), ...(lone ? [tabRange(lone.title)] : [])];
	const values = await getValues(client, spreadsheetId, ranges);

	// Header columns: missing ones are added after the existing ones.
	const addedColumns: string[] = [];
	const writes: { range: string; values: string[][] }[] = [];
	const indexes = {} as Record<TabKey, Record<string, number>>;
	for (const [i, key] of TAB_KEYS.entries()) {
		const header = (values[ranges[i]][0] ?? []).map((cell) => normalize(String(cell)));
		const columns = LAYOUT[key].columns as Record<string, string>;
		const missing = Object.entries(columns).filter(([, name]) => !header.includes(normalize(name)));
		if (missing.length) {
			writes.push({
				range: tabRange(LAYOUT[key].tab, `${columnLetter(header.length)}1`),
				values: [missing.map(([, name]) => name)]
			});
			if (!missingTabs.includes(key)) addedColumns.push(...missing.map(([, name]) => `${LAYOUT[key].tab}: ${name}`));
		}
		const final = [...header, ...missing.map(([, name]) => normalize(name))];
		indexes[key] = Object.fromEntries(Object.entries(columns).map(([column, name]) => [column, final.indexOf(normalize(name))]));
	}
	// A new "Instrumentgruppen" starts with the preset's groups, so there's something to edit.
	const groupRows = defaultRows(sharedParts);
	if (missingTabs.includes('instrumentGroups') && groupRows.length) {
		writes.push({ range: tabRange(LAYOUT.instrumentGroups.tab, 'A2'), values: groupRows });
	}
	if (writes.length) await updateValues(client, spreadsheetId, writes);

	const requests: object[] = [];
	const column = (key: TabKey, name: string) => {
		const index = indexes[key][name];
		return { sheetId: tabOf(key).sheetId, startRowIndex: 1, startColumnIndex: index, endColumnIndex: index + 1 };
	};
	const letter = (key: TabKey, name: string) => columnLetter(indexes[key][name]);

	for (const key of TAB_KEYS) {
		const { sheetId } = tabOf(key);
		const width = Math.max(...Object.values(indexes[key])) + 1;
		requests.push(
			{
				updateSheetProperties: {
					properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
					fields: 'gridProperties.frozenRowCount'
				}
			},
			{
				repeatCell: {
					range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: width },
					cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: HEADER_BACKGROUND } },
					fields: 'userEnteredFormat(textFormat.bold,backgroundColor)'
				}
			}
		);

		const idColumn = ID_COLUMNS[key];
		if (idColumn) {
			requests.push({
				repeatCell: {
					range: column(key, idColumn),
					cell: { userEnteredFormat: { textFormat: { foregroundColor: ID_TEXT } } },
					fields: 'userEnteredFormat.textFormat.foregroundColor'
				}
			});
			if (!tabOf(key).protections.includes(ID_PROTECTION)) {
				requests.push({
					addProtectedRange: {
						protectedRange: { range: column(key, idColumn), description: ID_PROTECTION, warningOnly: true }
					}
				});
			}
		}

		const generated = GENERATED_COLUMNS[key] ?? [];
		if (generated.length && !tabOf(key).protections.includes(GENERATED_PROTECTION)) {
			for (const name of generated) {
				requests.push({
					addProtectedRange: {
						protectedRange: { range: column(key, name), description: GENERATED_PROTECTION, warningOnly: true }
					}
				});
			}
		}

		// Dates stay text, so "1957" or "1957-12" aren't turned into numbers or full dates.
		for (const name of TEXT_COLUMNS[key] ?? []) {
			requests.push({
				repeatCell: {
					range: column(key, name),
					cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
					fields: 'userEnteredFormat.numberFormat'
				}
			});
		}

		if (missingTabs.includes(key)) {
			for (const [name, index] of Object.entries(indexes[key])) {
				requests.push({
					updateDimensionProperties: {
						range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
						properties: { pixelSize: WIDTHS[name] ?? (name === idColumn ? 180 : 140) },
						fields: 'pixelSize'
					}
				});
			}
		}
	}

	const list = (labels: Record<string, string>) => ({
		type: 'ONE_OF_LIST',
		values: Object.values(labels).map((label) => ({ userEnteredValue: label }))
	});
	// Dropdowns. Not strict, so a name can be typed before its row exists.
	const fromColumn = (key: TabKey, name: string) => ({
		type: 'ONE_OF_RANGE',
		values: [{ userEnteredValue: `=${tabRange(LAYOUT[key].tab, `$${letter(key, name)}$2:$${letter(key, name)}`)}` }]
	});
	const dropdowns: [TabKey, string, object][] = [
		['program', 'concert', fromColumn('concerts', 'title')],
		['program', 'piece', fromColumn('pieces', 'title')],
		['concerts', 'sameProgramAs', fromColumn('concerts', 'title')],
		['concerts', 'organizer', fromColumn('ensembles', 'shortName')],
		['ensembles', 'kind', list(t.sheetValues.ensembleKinds)],
		['rehearsals', 'piece', fromColumn('pieces', 'title')],
		['rights', 'right', { type: 'ONE_OF_LIST', values: RIGHTS.map((right) => ({ userEnteredValue: right })) }],
		['members', 'status', { type: 'ONE_OF_LIST', values: MEMBER_STATUSES.map((status) => ({ userEnteredValue: status })) }],
		['reports', 'kind', list(t.feedbackValues.reportKind)],
		['reports', 'status', list(t.feedbackValues.reportStatus)],
		['wishes', 'kind', list(t.feedbackValues.wishKind)],
		['wishes', 'status', list(t.feedbackValues.wishStatus)],
		['missingParts', 'done', { type: 'BOOLEAN' }],
		['instrumentGroups', 'mutual', { type: 'BOOLEAN' }],
		['signups', 'answer', list(t.signups.answerValues)],
		['loans', 'piece', fromColumn('pieces', 'title')],
		['loans', 'returned', { type: 'BOOLEAN' }],
		['attendance', 'present', { type: 'BOOLEAN' }],
		['pieceNotes', 'piece', fromColumn('pieces', 'title')],
		['pieceNotes', 'concert', fromColumn('concerts', 'title')]
	];
	if (orchestras.length) {
		// Each orchestra and the combinations ("EO, A"): concerts and pieces they play together.
		const values = orchestraChoices(orchestras).map((name) => ({ userEnteredValue: name }));
		dropdowns.push(['concerts', 'orchestra', { type: 'ONE_OF_LIST', values }]);
		dropdowns.push(['program', 'orchestra', { type: 'ONE_OF_LIST', values }]);
	}
	for (const [key, name, condition] of dropdowns) {
		if (!TAB_KEYS.includes(key)) continue;
		requests.push({
			setDataValidation: { range: column(key, name), rule: { condition, strict: false, showCustomUi: true } }
		});
	}

	let removedTab: string | undefined;
	if (lone && (values[tabRange(lone.title)] ?? []).length === 0) {
		requests.push({ deleteSheet: { sheetId: lone.sheetId } });
		removedTab = lone.title;
	}

	await batchUpdate(client, spreadsheetId, requests);
	return { createdTabs: missingTabs.map((key) => LAYOUT[key].tab), addedColumns, removedTab };
}

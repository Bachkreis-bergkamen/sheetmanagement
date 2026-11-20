import type { Texts } from '../types.ts';

export const setup: Texts['setup'] = {
	title: 'Set up the repertoire sheet',
	lead: 'Creates the “Pieces”, “Concerts” and “Programme” tabs with headers and dropdowns in the repertoire sheet.',
	notConfigured: 'REPERTOIRE_SHEET_ID is not set. Create an empty Google sheet first and enter its ID.',
	share: (email: string) => `Share the sheet with ${email} as an editor.`,
	failed: "The sheet couldn't be accessed.",
	sheet: 'Sheet',
	open: 'Open in Google Sheets',
	tabs: 'Tabs',
	present: 'there',
	absent: 'missing',
	off: 'not needed, turned off',
	ready: 'All set up. New pieces from Drive and concerts from the calendar are added automatically.',
	run: 'Set up now',
	rerun: 'Renew formatting',
	safe: 'Only missing tabs and columns are added. Existing entries stay as they are.',
	done: 'Done.',
	created: (tabs: string) => `Created: ${tabs}.`,
	addedColumns: (columns: string) => `Added columns: ${columns}.`,
	database: (migrations: string) => `Database: applied ${migrations}.`,
	removed: (tab: string) => `The empty tab “${tab}” was removed.`,
	problems: 'Notes on the sheet',
	problem: {
		'missing-column': 'Column missing',
		'duplicate-piece': 'Piece twice',
		'duplicate-concert': 'Concert twice',
		'unknown-piece': 'Piece not in “Pieces”',
		'unknown-concert': 'Concert not in “Concerts”',
		'ambiguous-concert': 'Several concerts have this name: please add the date, e.g. “Christmas concert (21.12.1957)”',
		'bad-date': "Date can't be read",
		'duplicate-member': 'Member twice',
		'unknown-right': 'Unknown right'
	},
	row: (n: number) => `Row ${n}`,
	counts: (pieces: number, concerts: number, entries: number) => `${pieces} pieces · ${concerts} concerts · ${entries} programme entries`
};

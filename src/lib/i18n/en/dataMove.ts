import type { Texts } from '../types.ts';

/** Moving the data from the sheet into D1 and back (#186). */
export const dataMove: Texts['dataMove'] = {
	title: 'Database',
	lead: 'Where the data you maintain lives: pieces, concerts, programmes, members, rights, sign-ups, rentals, notes and settings.',
	sourceSheet: 'The Google Sheet is the source. Every page reads it, every change goes into it.',
	sourceD1: 'The database (D1) is the source. The sheet is a copy written again every night; changes made there are lost at the next export.',
	noD1: 'Without a D1 database the sheet stays the source. Add the DB binding in wrangler.toml, see the README.',
	preview: 'What would be taken over',
	previewLead: 'Read from the sheet just now. Nothing changes until you take it over.',
	tabRows: (tab: string, rows: number) => `${tab}: ${rows === 1 ? '1 row' : `${rows} rows`}`,
	unknown: (columns: string) => `Columns the app doesn't know and won't take over: ${columns}`,
	missing: (columns: string) => `Missing columns, empty afterwards: ${columns}`,
	total: (rows: number, tabs: number) => `${rows} rows from ${tabs} tabs.`,
	importButton: 'Take over from the sheet',
	importConfirm: 'Take all data from the sheet into the database? Afterwards the sheet is only a copy; changes made there are lost.',
	imported: (rows: number, tabs: number) => `Taken over: ${rows} rows from ${tabs} tabs. The database is the source now.`,
	exportButton: 'Write to the sheet now',
	exported: (rows: number, tabs: number) => `Written to the sheet: ${rows} rows in ${tabs} tabs.`,
	backButton: 'Back to the sheet',
	backConfirm: 'Make the sheet the source again? Everything in the database is written into it first.',
	back: 'The sheet is the source again.',
	download: 'Download everything (JSON)',
	restoreTitle: 'Restore from a backup',
	restoreLead: 'A file from “Download everything” or a backup from Drive. Replaces everything in the database and makes it the source.',
	restoreFile: 'Backup (JSON)',
	restoreButton: 'Restore',
	restoreConfirm: 'Replace everything in the database with this backup? Changes made since are lost.',
	restoreNoFile: 'Please choose a backup file.',
	restoreTooLarge: 'The file is too large for a backup of this app.',
	restoreNotBackup: 'This is not a backup of this app.',
	restored: (rows: number, tabs: number, skipped: number) =>
		`Restored: ${rows} rows from ${tabs} tabs${skipped ? `; ${skipped} ${skipped === 1 ? 'row did not fit and is missing' : 'rows did not fit and are missing'}` : ''}. The database is the source.`,
	failed: (message: string) => `That didn't work: ${message}`,
	backup: 'Backup: D1 can be restored to any point in the last 30 days (Time Travel), every night the sheet is a copy outside Cloudflare, and with DRIVE_BACKUP_FOLDER_ID a file with everything goes to Drive every week (the last 8 are kept).',
	statusD1: (rows: number) => `Source: database, ${rows} rows; the sheet is a copy`,
	exportSheetOff: 'The sheet is the source; nothing to export.',
	exportUnchanged: 'Nothing changed since the last export; the sheet is up to date.',
	backupSheetSource: 'The sheet is the source; Drive keeps its versions itself.',
	backupOff: 'DRIVE_BACKUP_FOLDER_ID is not set; no backup to Drive.',
	backupNoAccount: 'No Drive account to write with: connect the Drive account on Status, or DRIVE_WRITE for a shared drive.',
	backedUp: (name: string, rows: number, trashed: number) =>
		`Backed up ${name} with ${rows} rows to Drive${trashed ? `; ${trashed} old ${trashed === 1 ? 'backup' : 'backups'} moved to the bin` : ''}.`,
	/** Why the database refused a save (#186). */
	refused: {
		link: (tab: string, column: string, value: string) => `${tab}, ${column}: “${value}” doesn’t exist. Add it first, then enter it here.`,
		unique: (tab: string, column: string, value: string) => `${tab}, ${column}: ${value ? `“${value}”` : 'That'} exists already.`,
		required: (tab: string, column: string) => `${tab}: ${column} is missing.`,
		used: (tab: string) => `${tab}: This is still in use, e.g. in a programme. Remove it there first.`
	},
	skippedTitle: 'Not taken over',
	skippedLead: 'The app ignores these rows already; they stay in the sheet but don’t go into the database.',
	skipped: {
		link: (tab: string, row: number, column: string, value: string) => `${tab}, row ${row}: ${column} “${value}” doesn’t exist`,
		unique: (tab: string, row: number, column: string, value: string) => `${tab}, row ${row}: ${column} “${value}” twice`,
		required: (tab: string, row: number, column: string) => `${tab}, row ${row}: ${column} missing`,
		used: (tab: string, row: number) => `${tab}, row ${row}: still in use`
	}
};

import { isHttpError } from '@sveltejs/kit';
import { config, PRESET_INSTRUMENTS, useInstrumentOverrides, type InstrumentOverride, type OrchestraConfig } from '#lib/config/index.ts';
import { joinList } from '#lib/repertoire/lists.ts';
import { linkSources, planSync, toSheetRow, type CalendarConcert, type DrivePiece, type Links } from '#lib/repertoire/link.ts';
import { ACCESS_TABS, buildAccessList, type AccessList, type AccessValues } from '#lib/access/access.ts';
import { buildFeedback, FEEDBACK_TABS, type Feedback, type FeedbackValues } from '#lib/feedback/feedback.ts';
import { readInstrumentGroups, type InstrumentGroups } from '#lib/music/instrument-groups.ts';
import type { PieceDetail } from '#lib/music/types.ts';
import { archiveGaps, doneFileIds, planMissingParts } from '#lib/repertoire/missing-parts.ts';
import { buildSignups, type Signups } from '#lib/signups/signups.ts';
import { buildRehearsalPlan, type RehearsalPlan } from '#lib/rehearsals/plan.ts';
import { buildLoans, type Loans } from '#lib/loans/loans.ts';
import { buildAttendance, type Attendance } from '#lib/attendance/attendance.ts';
import { buildPieceNotes, type PieceNotes } from '#lib/notes/piece-notes.ts';
import { buildPartAssignments, type PartAssignments } from '#lib/music/part-assignments.ts';
import { buildRehearsalNotes, type RehearsalNotes } from '#lib/notes/rehearsal-notes.ts';
import { buildRepertoire, LAYOUT, readTable, REPERTOIRE_TABS, type Repertoire, type SheetValues, type TabKey } from '#lib/repertoire/sheet.ts';
import { readInstrumentOverrides, readSettings, type StoredSettings } from '#lib/settings.ts';
import { cached } from './cache.ts';
import { getCatalog } from './catalog.ts';
import { appEnv, runInBackground, useStoredSettings } from './env.ts';
import type { GoogleClient } from './google/client.ts';
import { appendRows, getSpreadsheetInfo, getValues, tabRange } from './google/sheets.ts';
import { getSchedule } from './schedule.ts';
import { getGoogle, NotConfiguredError, requireSetting } from './services.ts';
import { appendRecords, replaceRows } from './sheet-writes.ts';
import { dataState, gridOf, usingD1 } from './data-source.ts';
import { getStore } from './db/index.ts';

/** People edit the sheet by hand, so changes should show up quickly. */
const SHEET_MAX_AGE_MS = 60 * 1000;

/** The sheet exists but /setup hasn't created the repertoire tabs yet. */
export class SheetNotSetUpError extends Error {
	constructor(readonly missingTabs: string[]) {
		super(`Missing tabs: ${missingTabs.join(', ')}`);
		this.name = 'SheetNotSetUpError';
	}
}

/** The tabs the app reads besides the repertoire; each only when present, so an older sheet keeps working. */
export const OPTIONAL_TABS = [...ACCESS_TABS, ...FEEDBACK_TABS, 'missingParts', 'instrumentGroups', 'signups', 'rehearsals', 'loans', 'attendance', 'settings', 'instruments', 'pieceNotes', 'partAssignments', 'rehearsalNotes', 'ensembles'] as const;

/** Every tab the sheet has, as raw values with the header row, in one request. */
export async function readSheetGrids(client: GoogleClient, spreadsheetId: string): Promise<Partial<Record<TabKey, string[][]>>> {
	const info = await getSpreadsheetInfo(client, spreadsheetId);
	const missing = REPERTOIRE_TABS.map((key) => LAYOUT[key].tab).filter((tab) => !info.tabs.includes(tab));
	if (missing.length) throw new SheetNotSetUpError(missing);
	const keys = [...REPERTOIRE_TABS, ...OPTIONAL_TABS.filter((key) => info.tabs.includes(LAYOUT[key].tab))];
	const ranges = keys.map((key) => tabRange(LAYOUT[key].tab));
	const result = await getValues(client, spreadsheetId, ranges);
	return Object.fromEntries(keys.map((key, i) => [key, result[ranges[i]]]));
}

/** The tabs grouped as the builders take them. The repertoire tabs are required, the rest read when present. */
function rawFromGrids(grids: Partial<Record<TabKey, string[][]>>) {
	const missing = REPERTOIRE_TABS.filter((key) => !grids[key]).map((key) => LAYOUT[key].tab);
	if (missing.length) throw new SheetNotSetUpError(missing);
	const { pieces, concerts, program, ensembles, reports, wishes, missingParts, instrumentGroups, signups, rehearsals, loans, attendance, settings, instruments, pieceNotes, partAssignments, rehearsalNotes, ...access } = grids as Record<TabKey, string[][]>;
	return {
		values: { pieces, concerts, program, ensembles } as SheetValues,
		access: access as AccessValues,
		feedback: { reports, wishes } as FeedbackValues,
		missingParts: missingParts as string[][] | undefined,
		instrumentGroups: instrumentGroups as string[][] | undefined,
		signups: signups as string[][] | undefined,
		rehearsals: rehearsals as string[][] | undefined,
		loans: loans as string[][] | undefined,
		attendance: attendance as string[][] | undefined,
		settings: settings as string[][] | undefined,
		instruments: instruments as string[][] | undefined,
		pieceNotes: pieceNotes as string[][] | undefined,
		partAssignments: partAssignments as string[][] | undefined,
		rehearsalNotes: rehearsalNotes as string[][] | undefined
	};
}

/** Reads all tabs in one request. */
export async function readSheet(client: GoogleClient, spreadsheetId: string) {
	return rawFromGrids(await readSheetGrids(client, spreadsheetId));
}

/** All tabs from D1 (#186), as grids like the sheet's. */
async function readD1Sheet() {
	const data = await getStore().readData();
	return rawFromGrids(Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, gridOf(key as TabKey, rows ?? [])])));
}

export interface Sources {
	drivePieces: DrivePiece[];
	calendarConcerts: CalendarConcert[];
}

/** Drive pieces and calendar concerts as far as they load; a failing source is just empty. */
async function loadSources(): Promise<Sources & { complete: boolean; archive: PieceDetail[] | null; snapshot: object | null }> {
	const [catalog, schedule] = await Promise.all([getCatalog(), getSchedule()]);
	return {
		complete: catalog.ok && schedule.ok,
		archive: catalog.ok ? catalog.catalog.pieces : null,
		drivePieces: catalog.ok
			? catalog.catalog.pieces.map(({ id, title, composer, catalogue, folderName }) => ({ id, title, composer, catalogue, folderName }))
			: [],
		calendarConcerts: schedule.ok ? schedule.events.filter((event) => event.type === 'konzert') : [],
		snapshot: schedule.ok ? schedule.snapshot : null
	};
}

/** Links per sheet, archive and calendar snapshot: the same objects for the same sources. */
const linked = new WeakMap<Repertoire, { archive: unknown; snapshot: unknown; links: Links }>();

function linksOf(repertoire: Repertoire, sources: Awaited<ReturnType<typeof loadSources>>): Links {
	const hit = linked.get(repertoire);
	if (hit && hit.archive === sources.archive && hit.snapshot === sources.snapshot) return hit.links;
	const links = linkSources(repertoire, sources.drivePieces, sources.calendarConcerts, config.timeZone);
	linked.set(repertoire, { archive: sources.archive, snapshot: sources.snapshot, links });
	return links;
}

/**
 * Appends rows for new Drive folders and calendar concerts. Only adds, never changes
 * or removes rows. Returns whether anything was written.
 */
async function syncSheet(client: GoogleClient, spreadsheetId: string, repertoire: Repertoire, sources: Sources) {
	const links = linkSources(repertoire, sources.drivePieces, sources.calendarConcerts, config.timeZone);
	const plan = planSync(repertoire, links, sources.drivePieces, sources.calendarConcerts, {
		timeZone: config.timeZone,
		// A concert in the calendar is played by all orchestras together unless the sheet says otherwise.
		orchestra: joinList(config.orchestras) || undefined
	});
	const { pieces, concerts } = repertoire.tables;
	// Without its id column a tab can't be synced: the next run would add everything again.
	const canWrite = (table: { missing: string[] }, id: string) => !table.missing.includes(id);
	let wrote = false;
	if (await usingD1()) {
		// One at a time: a folder or concert D1 refuses (its title is taken) stays out, the others come in.
		let added = 0;
		const add = async (key: 'pieces' | 'concerts', table: typeof pieces | typeof concerts, record: Record<string, string>) => {
			try {
				await appendRecords(key, table as never, [record]);
				added++;
			} catch (cause) {
				if (!isHttpError(cause, 409)) throw cause;
				console.warn(`Not added from Drive or the calendar: ${cause.body.message}`);
			}
		};
		for (const record of plan.pieces) await add('pieces', pieces, record);
		for (const record of plan.concerts) await add('concerts', concerts, record);
		return added > 0;
	}
	if (plan.pieces.length && canWrite(pieces, 'driveFolderId')) {
		await appendRows(client, spreadsheetId, tabRange(LAYOUT.pieces.tab), plan.pieces.map((row) => toSheetRow(row, pieces.indexes)));
		wrote = true;
	}
	if (plan.concerts.length && canWrite(concerts, 'eventId')) {
		await appendRows(client, spreadsheetId, tabRange(LAYOUT.concerts.tab), plan.concerts.map((row) => toSheetRow(row, concerts.indexes)));
		wrote = true;
	}
	return wrote;
}

/**
 * Mirrors the archive's gaps into "Fehlende Stimmen": one write, only when something
 * changed. Returns whether anything was written.
 */
async function syncMissingParts(values: string[][], archive: PieceDetail[], links: Links): Promise<boolean> {
	const gaps = archiveGaps(archive, (id) => links.pieceByFolder.get(id)?.title);
	const plan = planMissingParts(values, gaps);
	if (!plan.ok || !plan.changed) return false;
	await replaceRows('missingParts', plan.body);
	return true;
}

export type RepertoireResult =
	| { ok: true; repertoire: Repertoire; links: Links; storedAt: number }
	| { ok: false; reason: 'not-configured' | 'not-set-up' | 'failed'; missingTabs?: string[] };

type RawSheet = ReturnType<typeof rawFromGrids>;

interface SheetSnapshot {
	repertoire: Repertoire;
	access: AccessList;
	feedback: Feedback;
	/** File ids ticked "erledigt" in "Fehlende Stimmen". */
	missingPartsDone: string[];
	/** null: the tab is missing or empty, so the preset's groups apply. */
	instrumentGroups: InstrumentGroups | null;
	/** null: the "Anmeldungen" tab is missing. */
	signups: Signups | null;
	/** null: the "Proben" tab is missing. */
	rehearsals: RehearsalPlan | null;
	/** null: the "Leihmaterial" tab is missing. */
	loans: Loans | null;
	/** null: the "Anwesenheit" tab is missing. */
	attendance: Attendance | null;
	/** From "Einstellungen"; empty when the tab is missing. */
	settings: StoredSettings;
	/** From "Instrumente" (#143); empty when the tab is missing. */
	instruments: Record<string, InstrumentOverride>;
	/** From "Hinweise" (#125); empty when the tab is missing. */
	pieceNotes: PieceNotes;
	/** From "Stimmenzuteilung" (#262); empty when the tab is missing. */
	partAssignments: PartAssignments;
	/** From "Probennotizen" (#145); empty when the tab is missing. */
	rehearsalNotes: RehearsalNotes;
}

/**
 * The sheet as read, in memory and KV. KV lets a new Worker instance check who's a
 * member without waiting for Google, which matters most right after signing in. It's
 * only written when the sheet changed, so the free tier's 1,000 writes a day last.
 */
async function loadRawSheet(force: boolean): Promise<{ value: RawSheet; storedAt: number }> {
	if (await usingD1()) return loadD1Sheet(force);
	const spreadsheetId = requireSetting('REPERTOIRE_SHEET_ID');
	const { client } = getGoogle();
	return cached<RawSheet>({
		key: `sheet:v1:${spreadsheetId}`,
		maxAgeMs: SHEET_MAX_AGE_MS,
		build: () => readSheet(client, spreadsheetId),
		kv: appEnv().CACHE,
		waitUntil: runInBackground,
		force
	});
}

/**
 * From D1 the whole data is read again only when its version changed (#186): one small query
 * per request instead of the sheet's minute-old copy, so a change shows up everywhere at once.
 */
let d1Sheet: { version: number; value: RawSheet; storedAt: number } | undefined;

async function loadD1Sheet(force: boolean): Promise<{ value: RawSheet; storedAt: number }> {
	const { version } = await dataState({ force });
	if (!force && d1Sheet?.version === version) return d1Sheet;
	d1Sheet = { version, value: await readD1Sheet(), storedAt: Date.now() };
	return d1Sheet;
}

// Built once per sheet snapshot and Worker instance, not on every request.
const snapshots = new WeakMap<RawSheet, SheetSnapshot>();

async function loadSheet(force: boolean): Promise<{ value: SheetSnapshot; sheet: RawSheet; storedAt: number }> {
	const { value: sheet, storedAt } = await loadRawSheet(force);
	let snapshot = snapshots.get(sheet);
	if (!snapshot) {
		snapshot = {
			repertoire: buildRepertoire(sheet.values),
			access: buildAccessList(sheet.access),
			feedback: buildFeedback(sheet.feedback),
			missingPartsDone: doneFileIds(sheet.missingParts ?? []),
			instrumentGroups: readInstrumentGroups(
				sheet.instrumentGroups,
				config.instruments.map((instrument) => instrument.name)
			),
			signups: sheet.signups ? buildSignups(sheet.signups) : null,
			rehearsals: sheet.rehearsals ? buildRehearsalPlan(sheet.rehearsals) : null,
			loans: sheet.loans ? buildLoans(sheet.loans) : null,
			attendance: sheet.attendance ? buildAttendance(sheet.attendance) : null,
			settings: readSettings(readTable(sheet.settings ?? [], LAYOUT.settings.columns).rows),
			instruments: readInstrumentOverrides(
				readTable(sheet.instruments ?? [], LAYOUT.instruments.columns).rows,
				PRESET_INSTRUMENTS.map((instrument) => instrument.name)
			),
			pieceNotes: buildPieceNotes(sheet.pieceNotes ?? []),
			partAssignments: buildPartAssignments(sheet.partAssignments ?? []),
			rehearsalNotes: buildRehearsalNotes(sheet.rehearsalNotes ?? [])
		};
		snapshots.set(sheet, snapshot);
	}
	return { value: snapshot, sheet, storedAt };
}

/** Adding new pieces and concerts runs this often at most, per Worker instance. */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
/** After a failed write (probably read-only access to the sheet), wait longer. */
const SYNC_BACKOFF_MS = 30 * 60 * 1000;
let nextSync = 0;

/**
 * Adds new Drive folders and calendar concerts to the sheet and mirrors the archive's
 * gaps into "Fehlende Stimmen". Runs after the response, so no page waits for writes.
 */
function syncInBackground() {
	if (Date.now() < nextSync) return;
	nextSync = Date.now() + SYNC_INTERVAL_MS;
	const sync = async () => {
		// Syncing needs both sources, otherwise rows the sheet already has look new.
		const sources = await loadSources();
		if (!sources.complete) return;
		// A fresh read: in a cached copy, rows added meanwhile would look missing and be added twice.
		const {
			value: { repertoire },
			sheet: { missingParts }
		} = await loadSheet(true);
		const { client } = getGoogle();
		const spreadsheetId = requireSetting('REPERTOIRE_SHEET_ID');
		let wrote = await syncSheet(client, spreadsheetId, repertoire, sources);
		// Without the archive every row would look gone, so it waits for Drive.
		if (missingParts && sources.archive) {
			const links = linkSources(repertoire, sources.drivePieces, sources.calendarConcerts, config.timeZone);
			wrote = (await syncMissingParts(missingParts, sources.archive, links)) || wrote;
		}
		if (wrote) await loadRawSheet(true);
	};
	runInBackground(
		sync().catch((error) => {
			nextSync = Date.now() + SYNC_BACKOFF_MS;
			console.error('Updating the sheet from Drive and the calendar failed:', error);
		})
	);
}

export async function getRepertoire({ force = false } = {}): Promise<RepertoireResult> {
	try {
		const [{ value, storedAt }, sources] = await Promise.all([loadSheet(force), loadSources()]);
		syncInBackground();
		const links = linksOf(value.repertoire, sources);
		return { ok: true, repertoire: value.repertoire, links, storedAt };
	} catch (error) {
		if (error instanceof NotConfiguredError) return { ok: false, reason: 'not-configured' };
		if (error instanceof SheetNotSetUpError) return { ok: false, reason: 'not-set-up', missingTabs: error.missingTabs };
		console.error('Loading the Repertoire sheet failed:', error);
		return { ok: false, reason: 'failed' };
	}
}

/** Members, groups, rights and access requests; null when the sheet can't be read. */
export async function getAccessList({ force = false } = {}): Promise<AccessList | null> {
	return (await readAccessList({ force })).list;
}

/** Like getAccessList, but tells a sheet that isn't set up apart from one that failed to load. */
export async function readAccessList({ force = false } = {}): Promise<{ list: AccessList | null; failed: boolean }> {
	try {
		return { list: (await loadSheet(force)).value.access, failed: false };
	} catch (error) {
		if (error instanceof NotConfiguredError || error instanceof SheetNotSetUpError) return { list: null, failed: false };
		console.error('Loading the member list failed:', error);
		return { list: null, failed: true };
	}
}

/** The groups from "Instrumentgruppen"; null when the tab is missing, empty or unreadable. */
export async function getInstrumentGroups({ force = false } = {}): Promise<InstrumentGroups | null> {
	try {
		return (await loadSheet(force)).value.instrumentGroups;
	} catch {
		// getLibrary already logs why the sheet failed.
		return null;
	}
}

/** The config with the orchestra's own instrument groups from the sheet, if it has any. */
export async function getMusicConfig(): Promise<OrchestraConfig> {
	const groups = await getInstrumentGroups();
	return groups ? { ...config, sharedParts: groups.sharedParts } : config;
}

/** File ids ticked "erledigt" in "Fehlende Stimmen"; empty when the sheet can't be read. */
export async function getMissingPartsDone(): Promise<Set<string>> {
	try {
		return new Set((await loadSheet(false)).value.missingPartsDone);
	} catch {
		// getLibrary already logs why the sheet failed.
		return new Set();
	}
}

/** Problem reports and wishes; null when the sheet can't be read. */
export async function getFeedback({ force = false } = {}): Promise<Feedback | null> {
	try {
		return (await loadSheet(force)).value.feedback;
	} catch (error) {
		if (!(error instanceof NotConfiguredError) && !(error instanceof SheetNotSetUpError)) {
			console.error('Loading reports and wishes failed:', error);
		}
		return null;
	}
}

/** Sign-ups for rehearsals and concerts; null when the tab is missing or the sheet can't be read. */
export async function getSignups({ force = false } = {}): Promise<Signups | null> {
	try {
		return (await loadSheet(force)).value.signups;
	} catch {
		// getLibrary already logs why the sheet failed.
		return null;
	}
}

/** The rehearsal plan; null when the tab is missing or the sheet can't be read. */
export async function getRehearsalPlan({ force = false } = {}): Promise<RehearsalPlan | null> {
	try {
		return (await loadSheet(force)).value.rehearsals;
	} catch {
		// getLibrary already logs why the sheet failed.
		return null;
	}
}

/** Rented and borrowed music; null when the tab is missing or the sheet can't be read. */
export async function getLoans({ force = false } = {}): Promise<Loans | null> {
	try {
		return (await loadSheet(force)).value.loans;
	} catch {
		// getLibrary already logs why the sheet failed.
		return null;
	}
}

/** Who came to which rehearsal; null when the tab is missing or the sheet can't be read. */
export async function getAttendance({ force = false } = {}): Promise<Attendance | null> {
	try {
		return (await loadSheet(force)).value.attendance;
	} catch {
		// getLibrary already logs why the sheet failed.
		return null;
	}
}

/** Who plays which part instead of their own (#262); empty when the tab is missing or the sheet can't be read. */
export async function getPartAssignments({ force = false } = {}): Promise<PartAssignments> {
	try {
		return (await loadSheet(force)).value.partAssignments;
	} catch {
		// getLibrary already logs why the sheet failed.
		return buildPartAssignments([]);
	}
}

/** Notes on pieces (#125); empty when the tab is missing or the sheet can't be read. */
export async function getPieceNotes({ force = false } = {}): Promise<PieceNotes> {
	try {
		return (await loadSheet(force)).value.pieceNotes;
	} catch {
		// getLibrary already logs why the sheet failed.
		return buildPieceNotes([]);
	}
}

/** Notes after rehearsals (#145); empty when the tab is missing or the sheet can't be read. */
export async function getRehearsalNotes({ force = false } = {}): Promise<RehearsalNotes> {
	try {
		return (await loadSheet(force)).value.rehearsalNotes;
	} catch {
		// getLibrary already logs why the sheet failed.
		return buildRehearsalNotes([]);
	}
}

/**
 * Brings the settings from "Einstellungen" and "Instrumente" up to date for this request (#75, #134); the hook
 * runs it first, so colours and features are known everywhere. Without the sheet nothing changes.
 */
export async function refreshStoredSettings(): Promise<void> {
	try {
		const { settings, instruments } = (await loadSheet(false)).value;
		useStoredSettings(settings);
		useInstrumentOverrides(instruments);
	} catch {
		// Not configured, not set up or failing: the variables and the preset apply.
	}
}

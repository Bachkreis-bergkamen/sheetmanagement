import { config } from '#lib/config/index.ts';
import { cached, patchCached, type CachedResult } from './cache.ts';
import { buildDriveIndex, INDEX_VERSION, updateDriveIndex, type DriveIndex, type IndexedPiece } from './drive-index.ts';
import { demoClient } from './demo/backend.ts';
import { DEMO_IDS } from './demo/data.ts';
import { appEnv, isDemo, runInBackground } from './env.ts';
import { createTokenProvider, parseServiceAccountKey, scopesFor } from './google/auth.ts';
import { GoogleClient } from './google/client.ts';

/**
 * How soon changes made directly in Drive show up (the app's own are patched in at once). An
 * update reads only Drive's changes list, so every run of the cron job (each 10 minutes) does one.
 */
const INDEX_MAX_AGE_MS = 5 * 60 * 1000;

export class NotConfiguredError extends Error {
	constructor(readonly variable: string) {
		super(`${variable} is not set`);
		this.name = 'NotConfiguredError';
	}
}

let google: { json: string; scopes: string; client: GoogleClient; email: string } | null = null;

/**
 * Whether the app may change files in Drive (DRIVE_WRITE=true). Off by default: reading needs
 * no more. The demo's Drive is in memory, so renaming and placeholders can be tried there.
 */
export function driveWriteEnabled(): boolean {
	if (isDemo()) return true;
	return switchedOn(appEnv().DRIVE_WRITE);
}

/**
 * Whether the app may add events to the calendar (CALENDAR_WRITE=true): asks Google for the
 * calendar.events scope, and needs the calendar shared with the service account with "Make
 * changes to events". Off by default. The demo's calendar is in memory, so it's always on there.
 */
export function calendarWriteEnabled(): boolean {
	if (isDemo()) return true;
	return switchedOn(appEnv().CALENDAR_WRITE);
}

const switchedOn = (value: string | undefined) => ['true', '1', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());

/** The Google client for this deployment. Token caching lives as long as the Worker instance. */
export function getGoogle(): { client: GoogleClient; serviceAccountEmail: string } {
	if (isDemo()) return { client: demoClient(), serviceAccountEmail: 'demo@example.org' };
	const json = appEnv().GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
	if (!json) throw new NotConfiguredError('GOOGLE_SERVICE_ACCOUNT_JSON');
	const scopes = scopesFor({ drive: driveWriteEnabled(), calendar: calendarWriteEnabled() });
	if (google?.json !== json || google.scopes !== scopes.join(' ')) {
		const key = parseServiceAccountKey(json);
		const tokens = createTokenProvider(key, scopes);
		google = { json, scopes: scopes.join(' '), client: new GoogleClient(tokens), email: key.client_email };
	}
	return { client: google.client, serviceAccountEmail: google.email };
}

export function requireSetting(
	name: 'CALENDAR_ID' | 'DRIVE_ARCHIVE_FOLDER_ID' | 'DRIVE_CURRENT_PROGRAM_FOLDER_ID' | 'REPERTOIRE_SHEET_ID'
): string {
	if (isDemo()) return { CALENDAR_ID: DEMO_IDS.calendar, DRIVE_ARCHIVE_FOLDER_ID: DEMO_IDS.archive, DRIVE_CURRENT_PROGRAM_FOLDER_ID: DEMO_IDS.program, REPERTOIRE_SHEET_ID: DEMO_IDS.sheet }[name];
	const value = appEnv()[name]?.trim();
	if (!value) throw new NotConfiguredError(name);
	return value;
}

/**
 * Current-programme folders: DRIVE_CURRENT_PROGRAM_FOLDER_ID, one id or several separated
 * by commas (or full folder links). Optional.
 */
export function programFolderIds(): string[] {
	if (isDemo()) return [DEMO_IDS.program];
	return (appEnv().DRIVE_CURRENT_PROGRAM_FOLDER_ID ?? '')
		.split(/[,;\s]+/)
		.map((value) => value.match(/folders\/([\w-]+)/)?.[1] ?? value)
		.filter((id) => /^[\w-]{10,}$/.test(id));
}

/**
 * The archive index, served from cache. Building it walks the whole archive in Drive, far
 * beyond the free plan's 10 ms CPU, so a visitor's request never builds or refreshes it
 * (Error 1102, and a 20 s wait that ended in CacheTimeoutError): the cron job does (`build`),
 * and after the app's own changes `force` does, or patchCached puts them in. With nothing
 * cached yet it throws CacheMissError. The demo has no KV and a small archive, so it builds.
 *
 * With an index cached, both only update it from Drive's changes list (updateDriveIndex),
 * which reads just what changed; `full` reads the whole archive again ("Archiv neu einlesen").
 */
export function getArchiveIndex({ force = false, build = false, full = false } = {}): Promise<CachedResult<DriveIndex>> {
	const archiveFolderId = requireSetting('DRIVE_ARCHIVE_FOLDER_ID');
	const programs = programFolderIds();
	const { client } = getGoogle();
	const kv = appEnv().CACHE;
	const options = {
		archiveFolderId,
		categoryFolderPattern: config.naming.categoryFolderPattern,
		programFolderIds: programs,
		programFolderPattern: config.naming.programFolderPattern,
		// The demo's Drive is in memory and has no changes list.
		trackChanges: !isDemo()
	};
	return cached({
		readOnly: !build && !isDemo() && !!kv,
		waitForRefresh: build,
		key: archiveIndexKey(archiveFolderId, programs),
		maxAgeMs: INDEX_MAX_AGE_MS,
		build: (previous) =>
			previous?.version === INDEX_VERSION && !full && !isDemo()
				? updateDriveIndex(client, previous, options)
				: buildDriveIndex(client, options),
		kv,
		waitUntil: runInBackground,
		force
	});
}

const archiveIndexKey = (archiveFolderId: string, programs: string[]) => `drive-index:v${INDEX_VERSION}:${[archiveFolderId, ...programs].join(',')}`;

/**
 * Writes new file names into the cached archive index, by file id. Much faster than
 * crawling the whole archive again after a rename; the regular refresh still follows.
 */
export async function renameInArchiveIndex(names: Map<string, string>): Promise<boolean> {
	if (!names.size) return true;
	const rename = <F extends { id: string; name: string }>(file: F): F => {
		const name = names.get(file.id);
		return name === undefined ? file : { ...file, name };
	};
	return patchCached<DriveIndex>({
		key: archiveIndexKey(requireSetting('DRIVE_ARCHIVE_FOLDER_ID'), programFolderIds()),
		kv: appEnv().CACHE,
		waitUntil: runInBackground,
		update: (index) => ({
			...index,
			pieces: index.pieces.map((piece) => ({ ...piece, files: piece.files.map(rename) })),
			categoryFiles: index.categoryFiles.map((group) => ({ ...group, files: group.files.map(rename) }))
		})
	});
}

/**
 * Puts one piece folder into the cached archive index as it is now: a folder just made, or
 * one with new files (#193). Like renameInArchiveIndex, much faster than a new crawl.
 */
export async function putInArchiveIndex(piece: IndexedPiece): Promise<boolean> {
	const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
	return patchCached<DriveIndex>({
		key: archiveIndexKey(requireSetting('DRIVE_ARCHIVE_FOLDER_ID'), programFolderIds()),
		kv: appEnv().CACHE,
		waitUntil: runInBackground,
		update: (index) => ({
			...index,
			pieces: [...index.pieces.filter((other) => other.folderId !== piece.folderId), piece].sort((a, b) => collator.compare(a.name, b.name))
		})
	});
}

/**
 * Writes a programme sync into the cached archive index (#60): the programme added to the
 * pieces just linked, taken from those just unlinked. A new crawl would cost about as many
 * Google requests as the sync itself, and with two orchestras synced at once the free
 * plan's 50 per call ran out half-way through the second one.
 */
export async function programInArchiveIndex(program: string, linked: string[], unlinked: string[]): Promise<boolean> {
	if (!linked.length && !unlinked.length) return true;
	const added = new Set(linked);
	const removed = new Set(unlinked.filter((id) => !added.has(id)));
	return patchCached<DriveIndex>({
		key: archiveIndexKey(requireSetting('DRIVE_ARCHIVE_FOLDER_ID'), programFolderIds()),
		kv: appEnv().CACHE,
		waitUntil: runInBackground,
		update: (index) => ({
			...index,
			programs: index.programs.includes(program) || !added.size ? index.programs : [...index.programs, program],
			pieces: index.pieces.map((piece) => {
				const programs = piece.programs ?? [];
				if (added.has(piece.folderId) && !programs.includes(program)) return { ...piece, programs: [...programs, program] };
				if (removed.has(piece.folderId) && programs.includes(program)) return { ...piece, programs: programs.filter((name) => name !== program) };
				return piece;
			})
		})
	});
}

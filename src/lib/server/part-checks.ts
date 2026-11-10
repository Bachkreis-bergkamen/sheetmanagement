import { partHints, type PageCounts, type PartHint } from '#lib/music/part-check.ts';
import type { Catalog } from '#lib/music/catalog.ts';
import { config } from '#lib/config/index.ts';
import { withStatusWord } from '#lib/music/status-word.ts';
import { getCatalog } from './catalog.ts';
import type { DriveIndex } from './drive-index.ts';
import { getStore } from './db/index.ts';
import type { PartCheck } from './db/types.ts';
import { runInBackground } from './env.ts';
import { getFile, renameFile } from './google/drive.ts';
import { driveWriteEnabled, getArchiveIndex, getGoogle } from './services.ts';

/**
 * The completeness check for parts (#93): a job reads a few PDFs per run and remembers their
 * pages in D1; pages turn that into hints, which an organiser confirms or dismisses.
 */

/** Big scans cost CPU to read; above this, a file is left out rather than break the run. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** The PDFs in the archive, with the version Drive has. */
export function archivePdfs(index: DriveIndex): { id: string; modified: string; size?: number }[] {
	return index.pieces.flatMap((piece) =>
		piece.files.filter((file) => file.mimeType === 'application/pdf').map((file) => ({ id: file.id, modified: file.modifiedTime ?? '', size: file.size }))
	);
}

/** Files not checked yet, or changed since. */
export function uncheckedPdfs(index: DriveIndex, checks: PartCheck[]) {
	const known = new Map(checks.map((check) => [check.fileId, check.modified]));
	return archivePdfs(index).filter((file) => known.get(file.id) !== file.modified);
}

/** Hints for every piece, by file id, and how far the check has come. */
export async function getPartHints(catalog: Catalog, index: DriveIndex): Promise<PartHints> {
	const checks = await getStore().partChecks();
	const key = checksKey(checks);
	if (hintsMemo && hintsMemo.catalog === catalog && hintsMemo.index === index && hintsMemo.key === key) return hintsMemo.result;
	const result = buildPartHints(catalog, index, checks);
	hintsMemo = { catalog, index, key, result };
	return result;
}

type PartHints = { hints: Map<string, PartHint>; checked: number; total: number };

/**
 * Reused while the catalog, archive and checks stay the same: the scan board read every part
 * on every load, past the free plan's 10 ms (Error 1102). The checks are written by other
 * instances too, so they are compared by content rather than kept in memory.
 */
let hintsMemo: { catalog: Catalog; index: DriveIndex; key: string; result: PartHints } | undefined;

function checksKey(checks: PartCheck[]): string {
	let key = '';
	for (const c of checks) key += `${c.fileId}|${c.modified}|${c.pages}|${+c.skipped}${+c.dismissed};`;
	return key;
}

function buildPartHints(catalog: Catalog, index: DriveIndex, checks: PartCheck[]): PartHints {
	const pages: PageCounts = new Map(checks.filter((check) => !check.skipped).map((check) => [check.fileId, check.pages]));
	const dismissed = new Set(checks.filter((check) => check.dismissed).map((check) => check.fileId));
	const hints = new Map(catalog.pieces.flatMap((piece) => partHints(piece.parts, pages, dismissed)).map((hint) => [hint.id, hint]));
	const total = archivePdfs(index).length;
	return { hints, checked: total - uncheckedPdfs(index, checks).length, total };
}

/** The hint for one file as it stands now; undefined when there is none (any more). */
async function currentHint(fileId: string): Promise<PartHint | undefined> {
	const catalog = await getCatalog();
	if (!catalog.ok) return undefined;
	const { value: index } = await getArchiveIndex();
	return (await getPartHints(catalog.catalog, index)).hints.get(fileId);
}

/**
 * An organiser agrees with a hint: the file gets the status word ("… - LEER.pdf"), so it
 * counts as a gap everywhere. False when Drive refused or may not be changed; undefined
 * when the hint is gone.
 */
export async function confirmPartHint(fileId: string): Promise<boolean | undefined> {
	const hint = await currentHint(fileId);
	if (!hint) return undefined;
	if (!driveWriteEnabled()) return false;
	const { client } = getGoogle();
	try {
		const file = await getFile(client, fileId);
		const name = withStatusWord(file.name, hint.problem, config.naming);
		if (name !== file.name) await renameFile(client, fileId, name);
	} catch (cause) {
		console.error('Marking a checked part in Drive failed:', cause);
		return false;
	}
	runInBackground(getArchiveIndex({ force: true }).catch((cause) => console.error('Refreshing the archive failed:', cause)));
	return true;
}

/** The hint is wrong (a short part can be right): it isn't shown again for this version of the file. */
export async function dismissPartHint(fileId: string): Promise<void> {
	await getStore().dismissPartCheck(fileId);
}

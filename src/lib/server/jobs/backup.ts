import * as t from '#lib/i18n/texts.ts';
import { usingD1 } from '../data-source.ts';
import { allData } from '../data-transfer.ts';
import { driveAccountClient } from '../drive-account.ts';
import { appEnv } from '../env.ts';
import { listChildren, trashFile, uploadFile, type DriveFile } from '../google/drive.ts';
import { today } from '../members.ts';
import { driveWriteEnabled, getGoogle } from '../services.ts';
import type { JobResult } from './index.ts';

/** Weekly copies kept in the folder: two months back, then they go to the bin. */
export const BACKUPS_KEPT = 8;

/** The same name as "Alles herunterladen", so a backup and a download read alike. */
export const backupName = (day: string) => `daten-${day}.json`;
const BACKUP_NAME = /^daten-\d{4}-\d{2}-\d{2}\.json$/;

/** The app's own backups beyond the newest `keep`, oldest last; other files in the folder are left alone. */
export function oldBackups(files: DriveFile[], keep = BACKUPS_KEPT): DriveFile[] {
	return files
		.filter((file) => BACKUP_NAME.test(file.name))
		.sort((a, b) => b.name.localeCompare(a.name) || (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))
		.slice(keep);
}

/**
 * Once a week (#186): everything people maintain, as JSON, into a Drive folder only the admins
 * can open. A copy outside Cloudflare that a broken nightly export can't overwrite, and the
 * file a restore starts from. A service account can't own new files in a My Drive, so this
 * writes as the account connected on /status, or as the service account in a shared drive.
 */
export async function backupData(): Promise<JobResult> {
	if (!(await usingD1())) return { ok: true, summary: t.dataMove.backupSheetSource };
	const folderId = appEnv().DRIVE_BACKUP_FOLDER_ID?.trim();
	if (!folderId) return { ok: true, summary: t.dataMove.backupOff };
	const client = (await driveAccountClient()) ?? (driveWriteEnabled() ? getGoogle().client : null);
	if (!client) return { ok: false, summary: t.dataMove.backupNoAccount };

	const data = await allData();
	const rows = Object.values(data.tabs).reduce((sum, tab) => sum + tab.length, 0);
	const content = JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, '\t');
	const file = await uploadFile(client, { name: backupName(today()), mimeType: 'application/json', folderId, content });
	const old = oldBackups(await listChildren(client, [folderId]));
	for (const backup of old) await trashFile(client, backup.id);
	return { ok: true, summary: t.dataMove.backedUp(file.name, rows, old.length) };
}

import * as t from '#lib/i18n/texts.ts';
import { countPdfPages } from '#lib/music/pdf-pages.ts';
import { getStore } from '../db/index.ts';
import { downloadFile } from '../google/drive.ts';
import { MAX_FILE_BYTES, uncheckedPdfs } from '../part-checks.ts';
import { getArchiveIndex, getGoogle } from '../services.ts';
import type { JobResult } from './index.ts';

/**
 * Counts the pages of PDFs in the archive that weren't checked yet or changed since (#93).
 * A few megabytes per run, so a run stays within the free plan's CPU limit; the next run
 * goes on where this one stopped, and a whole archive is done within days.
 */
export async function checkParts(budgetBytes = 4 * 1024 * 1024): Promise<JobResult> {
	const { value: index } = await getArchiveIndex();
	const store = getStore();
	const todo = uncheckedPdfs(index, await store.partChecks());
	const { client } = getGoogle();

	let bytes = 0;
	let done = 0;
	for (const file of todo) {
		// At least one file per run, however big; the budget only stops further ones.
		if (done && bytes + (file.size ?? 0) > budgetBytes) break;
		if ((file.size ?? 0) > MAX_FILE_BYTES) {
			await store.savePartCheck({ fileId: file.id, modified: file.modified, pages: null, skipped: true });
		} else {
			const response = await downloadFile(client, file.id);
			if (!response.ok) throw new Error(`Drive answered ${response.status} for ${file.id}`);
			const content = new Uint8Array(await response.arrayBuffer());
			bytes += content.length;
			await store.savePartCheck({ fileId: file.id, modified: file.modified, pages: await countPdfPages(content), skipped: false });
		}
		done++;
	}
	return { ok: true, summary: t.status.partsChecked(done, todo.length - done) };
}

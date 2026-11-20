import * as t from '#lib/i18n/texts.ts';
import { usingD1 } from '../data-source.ts';
import { changedSinceExport, exportToSheet } from '../data-transfer.ts';
import type { JobResult } from './index.ts';

/**
 * Once a night (#186): D1 into the sheet, as a copy to read and print and a backup outside
 * Cloudflare. Only when something changed since the last export: a quiet day costs no Google calls.
 */
export async function exportData(): Promise<JobResult> {
	if (!(await usingD1())) return { ok: true, summary: t.dataMove.exportSheetOff };
	if (!(await changedSinceExport())) return { ok: true, summary: t.dataMove.exportUnchanged };
	const { tabs, rows } = await exportToSheet();
	return { ok: true, summary: t.dataMove.exported(rows, tabs) };
}

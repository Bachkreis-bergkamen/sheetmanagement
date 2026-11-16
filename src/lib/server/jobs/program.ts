import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { currentProgramAvailable, currentProgramInStep, currentProgramStatus, nextConcert, syncCurrentProgram } from '../current-program.ts';
import { getLibrary } from '../library.ts';
import type { JobResult } from './index.ts';

/**
 * After a concert, "01 | Aktuelles Programm" moves on to the orchestra's next one (#60): the
 * last concert's pieces go into the bin, the next one's come in. Saving a programme syncs the
 * folder already; this is for the day after, when nobody saves anything. The archive index
 * says first whether the folder is in step, so Drive is only written when it isn't.
 */
export async function rollCurrentProgram(now = Date.now()): Promise<JobResult> {
	if (!currentProgramAvailable()) return { ok: true, summary: t.status.programOff };
	const library = await getLibrary(now);
	// Without the calendar or the archive the next concert can't be told: the folder stays as it is.
	if (!library.schedule.ok || !library.catalog.ok) return { ok: false, summary: t.status.programUnknown };

	const moved: string[] = [];
	const failed: string[] = [];
	for (const orchestra of config.orchestras.length ? config.orchestras : [undefined]) {
		const next = nextConcert(library, orchestra);
		// No concert ahead: the last programme stays until there is one.
		if (!next || currentProgramInStep(currentProgramStatus(next, library, orchestra))) continue;
		try {
			const result = await syncCurrentProgram(next, library, orchestra);
			if (result.added.length || result.removed.length) moved.push(t.status.programMoved(result.folderName, next.title, result.added.length, result.removed.length));
		} catch (cause) {
			console.error(`Moving the current programme of ${orchestra ?? 'the orchestra'} on failed:`, cause);
			failed.push(orchestra ?? next.title);
		}
	}
	const summary = [...moved, ...(failed.length ? [t.status.programFailed(failed)] : [])];
	return { ok: !failed.length, summary: summary.length ? summary.join(' ') : t.status.programInStep };
}

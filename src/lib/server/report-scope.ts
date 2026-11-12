import { readState, recordIn, sortedByKey, writeState } from './app-state.ts';
import { defaultReportScope, type LibraryConcert, type ReportScope } from './library.ts';

/**
 * Which pieces of a concert with guests go into its music list (#118), when an organiser chose
 * other than the default (see defaultReportScope). Kept with the app's own state, like what is
 * published: it's the app's business, not the sheet's.
 */
const KEY = 'report-scopes';

const stored = () => readState(KEY, (value) => recordIn<ReportScope>(value));

/** The scope chosen for the concert, else the default: all pieces unless a guest organises it. */
export async function reportScopeOf(concert: Pick<LibraryConcert, 'id' | 'organizer'>): Promise<ReportScope> {
	const chosen = await stored().then(
		(all) => all[concert.id],
		() => undefined
	);
	return chosen === 'all' || chosen === 'ours' ? chosen : defaultReportScope(concert);
}

/** Saves the choice; the default is not stored, so a later change of organiser still counts. */
export async function setReportScope(concert: Pick<LibraryConcert, 'id' | 'organizer'>, scope: ReportScope): Promise<void> {
	const all = await stored();
	if (scope === defaultReportScope(concert)) delete all[concert.id];
	else all[concert.id] = scope;
	await writeState(KEY, sortedByKey(Object.entries(all)));
}

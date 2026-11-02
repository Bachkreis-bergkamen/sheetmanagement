import { getStore } from './db/index.ts';
import { defaultReportScope, type LibraryConcert, type ReportScope } from './library.ts';

/**
 * Which pieces of a concert with guests go into its music list (#118), when an organiser chose
 * other than the default (see defaultReportScope). Kept with the app's own state, like what is
 * published: it's the app's business, not the sheet's.
 */
const KEY = 'report-scopes';

async function stored(): Promise<Record<string, ReportScope>> {
	const text = await getStore()
		.getState(KEY)
		.catch(() => null);
	try {
		const all = text ? (JSON.parse(text) as unknown) : {};
		return all && typeof all === 'object' && !Array.isArray(all) ? (all as Record<string, ReportScope>) : {};
	} catch {
		return {};
	}
}

/** The scope chosen for the concert, else the default: all pieces unless a guest organises it. */
export async function reportScopeOf(concert: Pick<LibraryConcert, 'id' | 'organizer'>): Promise<ReportScope> {
	const chosen = (await stored())[concert.id];
	return chosen === 'all' || chosen === 'ours' ? chosen : defaultReportScope(concert);
}

/** Saves the choice; the default is not stored, so a later change of organiser still counts. */
export async function setReportScope(concert: Pick<LibraryConcert, 'id' | 'organizer'>, scope: ReportScope): Promise<void> {
	const all = await stored();
	if (scope === defaultReportScope(concert)) delete all[concert.id];
	else all[concert.id] = scope;
	await getStore().setState(KEY, JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)))));
}

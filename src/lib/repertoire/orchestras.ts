import { t } from '#lib/i18n/index.ts';
import { searchText } from '#lib/music/text.ts';
import { joinList, splitList } from './lists.ts';

/**
 * Several orchestras can play one concert ("EO, A" under "Orchester"), each with its own
 * programme: a row in "Programm" names its orchestra. A row naming several ("EO, A") is a
 * piece they play together: it's in each one's music. Playing together is the usual case,
 * so a row naming none belongs to all of the concert's orchestras.
 */

/** "EO, A" → ["EO", "A"]. */
export const concertOrchestras = (text: string | undefined): string[] => splitList(text);

export const sameOrchestra = (a: string | undefined, b: string | undefined) => searchText((a ?? '').trim()) === searchText((b ?? '').trim());

/**
 * The orchestra a programme row belongs to: the one it names, else all of the concert's.
 * Several named ("a, eo") become one way of writing them, in the concert's order ("EO, A").
 * Guest ensembles (their short names) come after our orchestras and are never the default:
 * a row naming none is ours.
 */
export function rowOrchestra(entered: string | undefined, orchestras: string[], partners: string[] = []): string | undefined {
	const known = [...orchestras, ...partners];
	const named = splitList(entered).map((name) => known.find((orchestra) => sameOrchestra(orchestra, name)) ?? name);
	if (!named.length) return orchestras.length ? joinList(orchestras) : undefined;
	const rank = (name: string) => {
		const index = known.indexOf(name);
		return index === -1 ? known.length : index;
	};
	return joinList([...named].sort((a, b) => rank(a) - rank(b)));
}

/** Whether a row's orchestra ("EO" or, played together, "EO, A") includes this one. */
export const playedBy = (rowValue: string | undefined, orchestra: string | undefined) =>
	orchestra === undefined ? !rowValue : splitList(rowValue).some((name) => sameOrchestra(name, orchestra));

/** Played together by several orchestras. */
export const isJoint = (rowValue: string | undefined) => splitList(rowValue).length > 1;

/**
 * "Programm EO", or "Gemeinsam: EO + A" for what they play together. Guests by their full name
 * when `names` knows it ("Programm Kammerchor Unna").
 */
export function programLabel(orchestra: string, names: (short: string) => string = (short) => short): string {
	const all = splitList(orchestra).map(names);
	return all.length > 1 ? t.editor.jointTab(all) : t.editor.orchestraTab(all[0] ?? orchestra);
}

/**
 * The concert's programmes to edit: one per orchestra and guest ensemble; for several of ours
 * the one they play together, and with guests the one everybody plays together, last. Guests
 * only get tabs next to orchestras we name.
 */
export function programScopes(orchestras: string[], partners: string[] = []): string[] {
	const guests = orchestras.length ? partners : [];
	const together = orchestras.length > 1 ? [joinList(orchestras)] : [];
	const everybody = guests.length ? [joinList([...orchestras, ...guests])] : [];
	return orchestras.length + guests.length > 1 ? [...orchestras, ...guests, ...together, ...everybody] : orchestras;
}

/** The programme to show or edit: the one asked for if the concert has it, else its first orchestra's. */
export function pickOrchestra(orchestras: string[], wanted: string | null | undefined, partners: string[] = []): string | undefined {
	const scopes = programScopes(orchestras, partners);
	const asked = wanted ? rowOrchestra(wanted, orchestras, partners) : undefined;
	return scopes.find((scope) => sameOrchestra(scope, asked)) ?? orchestras[0];
}

/**
 * Values offered in the sheet's "Orchester" dropdowns: each orchestra and every combination,
 * "EO, A" for pieces or concerts they play together. Only for a few orchestras.
 */
export function orchestraChoices(orchestras: string[]): string[] {
	if (orchestras.length > 4) return orchestras;
	const combinations = Array.from({ length: 2 ** orchestras.length - 1 }, (_, i) => orchestras.filter((_, bit) => (i + 1) & (1 << bit)));
	return combinations.sort((a, b) => a.length - b.length).map(joinList);
}

/**
 * The orchestras a calendar title names as whole words: "Probe A" or "Probe Herbstkonzert (A)"
 * is a rehearsal for A, "Probe EO + A" one they rehearse together. In the configured order,
 * undefined when it names none. Words are split at spaces and punctuation, but not at
 * hyphens, so "A-Dur" doesn't name A; a name in capitals (an abbreviation) counts only in
 * capitals, so "a cappella" doesn't either.
 */
export function titleOrchestra(title: string, orchestras: string[]): string | undefined {
	const words = (text: string, exact: boolean) => (exact ? text : searchText(text)).split(/[\s,;/+&()[\]|·:]+/).filter(Boolean).join(' ');
	const named = orchestras.filter((orchestra) => {
		const exact = orchestra === orchestra.toUpperCase();
		const name = words(orchestra, exact);
		// A name of several words ("Junges Orchester") counts when they stand together.
		return !!name && ` ${words(title, exact)} `.includes(` ${name} `);
	});
	return named.length ? joinList(named) : undefined;
}

/**
 * Whose date it is: a concert's orchestras come from the sheet, a rehearsal's from its own
 * title ("Probe A"), else from the concert it prepares for. Undefined is everyone's.
 */
export function eventOrchestra(
	event: { id: string; type: string; concertId?: string; orchestra?: string },
	concertOrchestra: (concertId: string) => string | undefined
): string | undefined {
	if (event.type === 'konzert') return concertOrchestra(event.id);
	return event.orchestra ?? (event.concertId ? concertOrchestra(event.concertId) : undefined);
}

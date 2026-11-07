import { safeLink } from '#lib/links.ts';
import { splitList } from './lists.ts';
import { sameOrchestra } from './orchestras.ts';

/**
 * Choirs and orchestras we give concerts with. They live in the "Ensembles" tab, once each, and
 * a concert names them under "Mitwirkende" by their "Kurzname" ("KCH"), or by their full name
 * when they have no row there. A programme row names them under "Orchester" like our own
 * orchestras: "KCH" for what they play, "EO, KCH" for what we play together. They have no
 * members here, so their pieces are in nobody's "Meine Noten" and no Drive folder.
 */

export interface Ensemble {
	/** "KCH"; the full name when the row has no short name. */
	shortName: string;
	/** "Kammerchor Unna". */
	name: string;
	/** "Chor", "Orchester" … as entered. */
	kind?: string;
	conductor?: string;
	/** Only http(s). */
	website?: string;
	/** An image link; only https, since the website shows it on its own https pages. */
	logo?: string;
}

/** The "Ensembles" tab's rows by column; a short name listed twice: the first row wins. */
export function readEnsembles(rows: Record<'shortName' | 'name' | 'kind' | 'conductor' | 'website' | 'logo', string>[]): Ensemble[] {
	const ensembles: Ensemble[] = [];
	for (const v of rows) {
		const name = v.name || v.shortName;
		const shortName = v.shortName || v.name;
		if (!name || ensembles.some((other) => sameOrchestra(other.shortName, shortName))) continue;
		const website = safeLink(v.website);
		const logo = safeLink(v.logo);
		ensembles.push({
			shortName,
			name,
			...(v.kind ? { kind: v.kind } : {}),
			...(v.conductor ? { conductor: v.conductor } : {}),
			...(website ? { website } : {}),
			...(logo?.startsWith('https:') ? { logo } : {})
		});
	}
	return ensembles;
}

/** An ensemble by short or full name; one without a row is just its name. */
export function findEnsemble(ensembles: Ensemble[], name: string): Ensemble {
	return (
		ensembles.find((ensemble) => sameOrchestra(ensemble.shortName, name)) ??
		ensembles.find((ensemble) => sameOrchestra(ensemble.name, name)) ?? { shortName: name, name }
	);
}

/** "KCH, Posaunenchor Kamen" → both ensembles, as the concert names them. */
export const concertPartners = (text: string | undefined, ensembles: Ensemble[]): Ensemble[] =>
	splitList(text).map((name) => findEnsemble(ensembles, name));

/** A row's performers ("EO, KCH") for people: our orchestras by their short name, guests by their full name. */
export function performerNames(value: string | undefined, partners: Ensemble[]): string[] {
	return splitList(value).map((name) => partners.find((partner) => sameOrchestra(partner.shortName, name))?.name ?? name);
}

/** Whether a row's performers ("KCH", "EO, KCH") include a guest. */
export const withGuests = (value: string | undefined, partners: Ensemble[]) =>
	splitList(value).some((name) => partners.some((partner) => sameOrchestra(partner.shortName, name)));

/** Whether only guests play a row: nothing of ours, so it can be left out of our GEMA list. */
export const onlyGuests = (value: string | undefined, partners: Ensemble[]) =>
	!!splitList(value).length && splitList(value).every((name) => partners.some((partner) => sameOrchestra(partner.shortName, name)));

export type EnsembleField = 'shortName' | 'name' | 'kind' | 'conductor' | 'website' | 'logo';
export type EnsembleProblem = 'name' | 'taken' | 'ours' | 'website' | 'logo' | 'too-long';

/**
 * A row for the "Ensembles" tab from the form on /ensembles, or what's wrong with it. The short
 * name is how concerts and programmes name the ensemble, so it must be its own: not another
 * ensemble's, not one of our orchestras. Without one, the full name serves.
 */
export function checkEnsemble(
	input: Record<EnsembleField, string>,
	{ others, ours }: { others: Pick<Ensemble, 'shortName' | 'name'>[]; ours: string[] }
): { values: Record<EnsembleField, string> } | { problem: EnsembleProblem } {
	const clean = (value: string | undefined) => (value ?? '').trim().replace(/\s+/g, ' ');
	const values = Object.fromEntries((['shortName', 'name', 'kind', 'conductor', 'website', 'logo'] as const).map((key) => [key, clean(input[key])])) as Record<EnsembleField, string>;
	// "kammerchor-unna.de" as typed: a web address.
	for (const key of ['website', 'logo'] as const) if (values[key] && !/^[a-z][a-z0-9+.-]*:/i.test(values[key])) values[key] = `https://${values[key]}`;
	if (!values.name && !values.shortName) return { problem: 'name' };
	if (Object.values(values).some((value) => value.length > 300)) return { problem: 'too-long' };
	const short = values.shortName || values.name;
	if (ours.some((name) => sameOrchestra(name, short))) return { problem: 'ours' };
	if (others.some((other) => sameOrchestra(other.shortName, short) || sameOrchestra(other.name, short))) return { problem: 'taken' };
	if (values.website && !safeLink(values.website)) return { problem: 'website' };
	if (values.logo && !safeLink(values.logo)?.startsWith('https:')) return { problem: 'logo' };
	return { values };
}

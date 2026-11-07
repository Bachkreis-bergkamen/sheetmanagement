import { fail } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { checkEnsemble, readEnsembles, type EnsembleField } from '#lib/repertoire/ensembles.ts';
import { sameOrchestra } from '#lib/repertoire/orchestras.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { formText } from '#lib/server/feedback.ts';
import { getLibrary } from '#lib/server/library.ts';
import { appendRecords, deleteRows, ensureTab, readTab, refreshAfterWrite, SheetLayoutError, updateRecord, withSheetLock } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * The choirs and orchestras we give concerts with: the "Ensembles" tab, kept here instead of in
 * the sheet. Concerts pick them under "Mitwirkende" on their page; logo, conductor and website
 * go to the orchestra's website with the concert. For those who plan the programmes.
 */
const RIGHT = 'programme.bearbeiten';
const FIELDS: EnsembleField[] = ['shortName', 'name', 'kind', 'conductor', 'website', 'logo'];

/** The tab read now; null while it doesn't exist (the first save adds it). */
async function readEnsembleTab() {
	try {
		return await readTab('ensembles');
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return null;
		throw cause;
	}
}

/** The concerts that name an ensemble, as guest or as organiser, newest first. */
async function usage() {
	const library = await getLibrary();
	const concerts = [...library.concerts].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
	return (shortName: string) =>
		concerts
			.filter((concert) => [...concert.partners, ...(concert.organizer ? [concert.organizer] : [])].some((partner) => sameOrchestra(partner.shortName, shortName)))
			.map((concert) => ({ id: concert.id, title: concert.title, date: concert.label?.year ?? concert.dateText ?? '' }));
}

export const load: PageServerLoad = async ({ locals }) => {
	requireRight(locals, RIGHT);
	const [table, usedBy] = await Promise.all([readEnsembleTab(), usage()]);
	const rows = (table?.rows ?? []).filter((row) => row.values.name || row.values.shortName);
	return {
		state: table ? ('ready' as const) : ('no-tab' as const),
		ensembles: rows
			.map((row) => {
				const [shown] = readEnsembles([row.values]);
				return { row: row.row, values: Object.fromEntries(FIELDS.map((key) => [key, row.values[key] ?? ''])) as Record<EnsembleField, string>, shown, concerts: usedBy(shown.shortName) };
			})
			.sort((a, b) => a.shown.name.localeCompare(b.shown.name, config.locale)),
		kinds: Object.values(t.sheetValues.ensembleKinds)
	};
};

const input = (data: FormData) => Object.fromEntries(FIELDS.map((key) => [key, formText(data, key, 400)])) as Record<EnsembleField, string>;

/** Turns a failed write into the page's message; the form keeps what was typed. */
function failed(cause: unknown, values: Record<string, string>, row?: number) {
	if (cause instanceof SheetLayoutError) return fail(409, { message: cause.message, values, row });
	console.error('Saving an ensemble failed:', cause);
	return fail(503, { message: t.ensembles.failed, values, row });
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		const values = input(await request.formData());
		try {
			await ensureTab('ensembles');
			const problem = await withSheetLock(async () => {
				const table = await readTab('ensembles');
				const checked = checkEnsemble(values, { others: readEnsembles(table.rows.map((row) => row.values)), ours: config.orchestras });
				if ('problem' in checked) return checked.problem;
				await appendRecords('ensembles', table, [checked.values]);
			});
			if (problem) return fail(400, { message: t.ensembles.problems[problem], values });
			await refreshAfterWrite();
		} catch (cause) {
			return failed(cause, values);
		}
		return { added: values.name || values.shortName };
	},

	save: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		const row = Number(formText(data, 'row'));
		const was = formText(data, 'was');
		const values = input(data);
		try {
			const usedBy = await usage();
			const problem = await withSheetLock(async () => {
				const table = await readTab('ensembles');
				const current = table.rows.find((r) => r.row === row);
				// Checked against a fresh read: someone may have changed the tab meanwhile.
				const [before] = current ? readEnsembles([current.values]) : [];
				if (!before || !sameOrchestra(before.shortName, was)) return 'gone' as const;
				const short = values.shortName || values.name;
				// Concerts and programmes name it by its short name: renamed, they'd lose it.
				if (!sameOrchestra(short, before.shortName) && usedBy(before.shortName).length) return 'in-use' as const;
				const others = readEnsembles(table.rows.filter((r) => r.row !== row).map((r) => r.values));
				const checked = checkEnsemble(values, { others, ours: config.orchestras });
				if ('problem' in checked) return checked.problem;
				await updateRecord('ensembles', table, row, checked.values);
			});
			if (problem) return fail(problem === 'gone' ? 409 : 400, { message: t.ensembles.problems[problem], values, row });
			await refreshAfterWrite();
		} catch (cause) {
			return failed(cause, values, row);
		}
		return { saved: row };
	},

	remove: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		const row = Number(formText(data, 'row'));
		const was = formText(data, 'was');
		let name = was;
		try {
			const usedBy = await usage();
			const problem = await withSheetLock(async () => {
				const table = await readTab('ensembles');
				const current = table.rows.find((r) => r.row === row);
				const [before] = current ? readEnsembles([current.values]) : [];
				if (!before || !sameOrchestra(before.shortName, was)) return 'gone' as const;
				if (usedBy(before.shortName).length) return 'in-use' as const;
				name = before.name;
				await deleteRows('ensembles', table, [row]);
			});
			if (problem) return fail(409, { message: t.ensembles.problems[problem], row });
			await refreshAfterWrite();
		} catch (cause) {
			return failed(cause, {}, row);
		}
		return { removed: name };
	}
};

import { fail, redirect } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { searchText } from '#lib/music/text.ts';
import { orchestraChoices, sameOrchestra } from '#lib/repertoire/orchestras.ts';
import { checkNewConcert, checkNewPiece, similarPieces, type ArchiveProblem, type NewConcert } from '#lib/repertoire/archive-edit.ts';
import { findConcertRow, normalize, type ColumnKey, type TableRow } from '#lib/repertoire/sheet.ts';
import { checkConcert, CONCERT_REFS, refChanges, rewriteRefs, type ConcertValues, type RefChange } from '#lib/repertoire/concert-edit.ts';
import { concertKey } from '#lib/repertoire/concert-ref.ts';
import { requireRight } from './auth/index.ts';
import { getLibrary } from './library.ts';
import { appendRecords, readTab, refreshAfterWrite, SheetLayoutError, updateRecord, updateRecords } from './sheet-writes.ts';

/**
 * Adding the orchestra's history ("archiv.bearbeiten"): past concerts and pieces without
 * sheet music, as rows in the sheet. Fresh read, checks, append; then on to the new entry.
 */

const RIGHT = 'archiv.bearbeiten';
const field = (data: FormData, name: string) => String(data.get(name) ?? '').slice(0, 200);

/** Runs the write; a refused entry or a failed write becomes a message (and status) for the form. */
async function save(work: () => Promise<ArchiveProblem | undefined>): Promise<{ status: number; message: string } | undefined> {
	try {
		const problem = await work();
		return problem ? { status: 400, message: t.archive.problems[problem] } : undefined;
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return { status: 409, message: cause.message };
		console.error('Adding to the archive failed:', cause);
		return { status: 503, message: t.archive.failed };
	}
}

/**
 * A past concert, entered with the dates on /kalender: a row in the sheet, then on to it.
 * Returns what's wrong when it's refused; the caller shows it on its form.
 */
export async function addPastConcert(locals: App.Locals, entry: NewConcert) {
	requireRight(locals, RIGHT);
	// One orchestra, or several playing together ("EO, A"), as the sheet's dropdown offers them.
	const input = { ...entry, orchestra: orchestraChoices(config.orchestras).find((choice) => sameOrchestra(choice, entry.orchestra)) ?? '' };

	const refused = await save(async () => {
		const table = await readTab('concerts');
		const checked = checkNewConcert(input, table);
		if ('problem' in checked) return checked.problem;
		// A name another concert has: the rows naming that one get its date first, so they keep it.
		await followRefs(refChanges(table, [...table.rows.map((row) => ({ row: row.row, values: concertValues(row) })), { row: -1, values: checked.values }]));
		await appendRecords('concerts', table, [checked.values]);
		await refreshAfterWrite();
	});
	if (refused) return refused;
	redirect(303, await concertUrl(input.title, input.date));
}

type ConcertRow = TableRow<ColumnKey<'concerts'> & string>;

const concertValues = (row: ConcertRow): ConcertValues => ({
	title: row.values.title ?? '',
	date: row.values.date ?? '',
	location: row.values.location ?? '',
	orchestra: row.values.orchestra ?? ''
});

/** Changes whenever one of the cells the edit form shows changes. */
export const concertVersion = (row: ConcertRow) => JSON.stringify(Object.values(concertValues(row)));

/** Rows in other tabs that name a concert by an old text get the one that names it now. */
async function followRefs(changes: RefChange[]) {
	if (!changes.length) return;
	for (const [tab, column] of CONCERT_REFS) {
		let table;
		try {
			table = await readTab(tab);
		} catch (cause) {
			if (cause instanceof SheetLayoutError) continue;
			throw cause;
		}
		if ((table.missing as string[]).includes(column)) continue;
		await updateRecords(tab, table as never, rewriteRefs(table as never, column as never, changes) as never);
	}
}

/** The page of the archive concert with this name and day; the calendar when it isn't found. */
async function concertUrl(title: string, date: string) {
	const wanted = concertKey(title, date);
	const found = (await getLibrary()).concerts.find((c) => !c.event && c.sheet && concertKey(c.sheet.title, c.sheet.date ?? c.sheet.dateText) === wanted);
	return found ? `/kalender/${encodeURIComponent(found.id)}` : '/kalender';
}

/**
 * Changes a concert of the archive: name, day, place, orchestras. Rows that name it
 * (programme, notes …) follow. The form carries the version it started from; a row changed
 * meanwhile is refused instead of overwritten.
 */
export async function editArchiveConcert(locals: App.Locals, id: string, data: FormData) {
	requireRight(locals, RIGHT);
	const orchestra = data.getAll('orchestra').map(String).join(', ');
	const input: ConcertValues = {
		title: field(data, 'title'),
		date: field(data, 'date'),
		location: field(data, 'location'),
		orchestra: orchestraChoices(config.orchestras).find((choice) => sameOrchestra(choice, orchestra)) ?? ''
	};
	const sheet = (await getLibrary()).concertsById.get(id)?.sheet;
	if (!sheet) return fail(409, { archiveError: t.editor.notInSheet, archiveValues: input });

	let conflict = false;
	const refused = await save(async () => {
		const table = await readTab('concerts');
		const row = findConcertRow(table, sheet);
		if (!row || concertVersion(row) !== String(data.get('version'))) {
			conflict = true;
			return undefined;
		}
		const checked = checkConcert(input, table, row.row);
		if ('problem' in checked) return checked.problem;
		await followRefs(refChanges(table, table.rows.map((other) => ({ row: other.row, values: other.row === row.row ? checked.values : concertValues(other) }))));
		// Read again: following the names may have changed "Programm wie" in this tab.
		const fresh = await readTab('concerts');
		const own = findConcertRow(fresh, sheet);
		if (!own) {
			conflict = true;
			return undefined;
		}
		await updateRecord('concerts', fresh, own.row, checked.values);
		await refreshAfterWrite();
	});
	if (conflict) return fail(409, { archiveError: t.common.sheetChanged, archiveValues: input });
	if (refused) return fail(refused.status, { archiveError: refused.message, archiveValues: input });
	redirect(303, `${await concertUrl(input.title, input.date)}?bearbeitet`);
}

export async function addPiece(locals: App.Locals, request: Request) {
	requireRight(locals, RIGHT);
	const data = await request.formData();
	const input = { title: field(data, 'title'), composer: field(data, 'composer'), catalogue: field(data, 'catalogue') };

	const refused = await save(async () => {
		const table = await readTab('pieces');
		const checked = checkNewPiece(input, table);
		if ('problem' in checked) return checked.problem;
		await appendRecords('pieces', table, [checked.values]);
		await refreshAfterWrite();
	});
	if (refused) return fail(refused.status, { archiveError: refused.message, values: input });

	const added = (await getLibrary()).pieces.find((p) => !p.detail && searchText(p.title) === searchText(input.title.trim()));
	redirect(303, added ? `/stuecke/${encodeURIComponent(added.id)}` : '/stuecke');
}

/** A piece as the programme editor picks it: its name in the sheet, and what it shows. */
export interface PickablePiece {
	name: string;
	title: string;
	composer?: string;
	subtitle?: string;
	duration?: number;
}

/** Pieces with a row in "Stücke": the ones a programme can refer to. */
export function pickablePieces(library: Awaited<ReturnType<typeof getLibrary>>): (PickablePiece & { search: string })[] {
	return library.pieces
		.filter((piece) => piece.sheet?.title)
		.map((piece) => ({
			name: piece.sheet!.title,
			title: piece.title,
			composer: piece.composer,
			subtitle: [piece.composer, piece.catalogue].filter(Boolean).join(' · ') || undefined,
			duration: piece.sheet?.duration,
			search: piece.search
		}));
}

/**
 * A piece typed into a concert's programme that isn't in the archive yet (#192): a row in
 * "Stücke", returned so the editor puts it into the programme. Close matches come back
 * instead, unless the editor has shown them and the piece is new all the same.
 */
export async function addPieceFromProgram(locals: App.Locals, data: FormData) {
	requireRight(locals, RIGHT);
	const input = { title: field(data, 'title'), composer: field(data, 'composer'), catalogue: field(data, 'catalogue') };

	if (data.get('anyway') !== '1') {
		const similar = similarPieces(input, pickablePieces(await getLibrary()));
		if (similar.length) return { newPiece: { similar: similar.map(({ search: _, ...piece }) => piece), values: input } };
	}

	const refused = await save(async () => {
		const table = await readTab('pieces');
		const checked = checkNewPiece(input, table);
		if ('problem' in checked) return checked.problem;
		await appendRecords('pieces', table, [checked.values]);
		await refreshAfterWrite();
	});
	if (refused) return fail(refused.status, { newPiece: { error: refused.message, values: input } });

	const added = pickablePieces(await getLibrary()).find((piece) => normalize(piece.name) === normalize(input.title));
	const { search: _, ...piece } = added ?? { name: input.title.trim(), title: input.title.trim(), composer: input.composer.trim(), search: '' };
	return { newPiece: { piece } };
}

import { fail } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { formatDay } from '#lib/events/format.ts';
import * as t from '#lib/i18n/texts.ts';
import { checkLoan, daysUntilDue, loanState, sortLoans } from '#lib/loans/loans.ts';
import { normalize } from '#lib/repertoire/sheet.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { formText } from '#lib/server/feedback.ts';
import { getLibrary, namedItem } from '#lib/server/library.ts';
import { getLoans } from '#lib/server/repertoire.ts';
import { appendRecords, readTab, refreshAfterWrite, SheetLayoutError, updateRecord } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

// Looking after the sheet music is what "stuecke.bearbeiten" is for.
const RIGHT = 'stuecke.bearbeiten';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireFeature('loans');
	requireRight(locals, RIGHT);
	const [library, loans] = await Promise.all([getLibrary(), getLoans()]);
	if (!loans) return { state: 'not-set-up' as const };
	const day = (value?: string) => (value ? formatDay(value, config.locale) : undefined);
	const shown = sortLoans(loans.loans).map((loan) => {
		const { title, pieceId } = namedItem(library, loan.pieceName);
		return {
			row: loan.row,
			pieceName: loan.pieceName,
			title,
			pieceId,
			from: loan.from,
			borrowedAt: day(loan.borrowedAt),
			dueAt: day(loan.dueAt) ?? (loan.dueText || undefined),
			state: loanState(loan, library.today),
			days: daysUntilDue(loan, library.today),
			notes: loan.notes
		};
	});
	return {
		state: 'ready' as const,
		open: shown.filter((loan) => loan.state !== 'returned'),
		returned: shown.filter((loan) => loan.state === 'returned'),
		// Pieces with a row in "Stücke", which is what the sheet's dropdown offers too.
		pieces: library.pieces.flatMap((piece) => (piece.sheet?.title ? [piece.sheet.title] : [])),
		// Coming from a piece's page: its title is filled in.
		piece: url.searchParams.get('stueck') ?? ''
	};
};

/** Marks a loan returned or open again; the row is checked on a fresh read first. */
async function setReturned(data: FormData, returned: boolean) {
	const row = Number(formText(data, 'row'));
	try {
		const table = await readTab('loans');
		const loan = table.rows.find((r) => r.row === row);
		if (!loan || normalize(loan.values.piece) !== normalize(formText(data, 'piece'))) return fail(409, { message: t.loans.gone });
		await updateRecord('loans', table, row, { returned });
		await refreshAfterWrite();
		return { saved: true };
	} catch (cause) {
		if (cause instanceof SheetLayoutError) return fail(409, { message: t.loans.notSetUp });
		console.error('Changing a loan failed:', cause);
		return fail(503, { message: t.loans.failed });
	}
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		const data = await request.formData();
		const input = {
			piece: formText(data, 'piece', 300),
			from: formText(data, 'from', 300),
			borrowedAt: formText(data, 'borrowedAt', 40),
			dueAt: formText(data, 'dueAt', 40),
			notes: formText(data, 'notes', 500)
		};
		const checked = checkLoan(input);
		if ('problem' in checked) return fail(400, { message: t.loans.problems[checked.problem], values: input });
		try {
			const table = await readTab('loans');
			await appendRecords('loans', table, [checked.values]);
			await refreshAfterWrite();
		} catch (cause) {
			if (cause instanceof SheetLayoutError) return fail(409, { message: t.loans.notSetUp, values: input });
			console.error('Adding a loan failed:', cause);
			return fail(503, { message: t.loans.failed, values: input });
		}
		return { added: true };
	},

	returned: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		return setReturned(await request.formData(), true);
	},

	reopen: async ({ request, locals }) => {
		requireRight(locals, RIGHT);
		return setReturned(await request.formData(), false);
	}
};

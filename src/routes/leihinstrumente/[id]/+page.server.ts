import { error, fail, redirect } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { formatDay } from '#lib/events/format.ts';
import * as t from '#lib/i18n/texts.ts';
import {
	instrumentFromForm,
	instrumentName,
	instrumentState,
	loanDays,
	loanFromForm,
	loanUrgency,
	openLoanOf,
	returnFromForm,
	type LendInstrument
} from '#lib/lending/lending.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { borrowers, LENDING_RIGHT, lendingStore } from '#lib/server/lending.ts';
import type { LendingStore } from '#lib/server/lending-store.ts';
import { today } from '#lib/server/members.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/** One instrument (#296): its details, who has it, lending and taking it back, and its loans so far. */
export const load: PageServerLoad = async ({ locals, params }) => {
	requireFeature('lending');
	requireRight(locals, LENDING_RIGHT);
	const store = await lendingStore();
	if (!store) error(404, t.lending.notSetUp);
	const instrument = await store.instrument(params.id);
	if (!instrument) error(404, t.lending.gone);
	const [loans, list] = await Promise.all([store.loans(), getAccessList().catch(() => null)]);
	const mine = loans.filter((loan) => loan.instrumentId === instrument.id);
	const open = openLoanOf(mine, instrument.id);
	const day = today();
	const date = (value: string) => formatDay(value, config.locale);
	return {
		instrument,
		name: instrumentName(instrument),
		state: instrumentState(instrument, open),
		open: open && {
			id: open.id,
			who: open.name,
			from: date(open.from),
			fromDay: open.from,
			due: open.due ? date(open.due) : undefined,
			handover: open.handover,
			urgency: loanUrgency(open, day),
			days: loanDays(open, day)
		},
		history: mine
			.filter((loan) => loan.returned)
			.map((loan) => ({ id: loan.id, who: loan.name, from: date(loan.from), returned: date(loan.returned!), handover: loan.handover, returnNote: loan.returnNote })),
		people: borrowers(list),
		today: day
	};
};

/** The store and the instrument for an action; a refusal the page shows when either is gone. */
async function opened(id: string): Promise<{ store: LendingStore; instrument: LendInstrument } | { status: number; message: string }> {
	const store = await lendingStore();
	if (!store) return { status: 503, message: t.lending.notSetUp };
	const instrument = await store.instrument(id);
	if (!instrument) return { status: 404, message: t.lending.gone };
	return { store, instrument };
}

const failed = (what: string, cause: unknown) => {
	console.error(`${what} failed:`, cause);
	return fail(503, { message: t.lending.failed });
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		requireRight(locals, LENDING_RIGHT);
		const found = await opened(params.id);
		if ('message' in found) return fail(found.status, { message: found.message });
		const checked = instrumentFromForm(await request.formData());
		if ('problem' in checked) return fail(400, { message: t.lending.problems[checked.problem] });
		try {
			const out = openLoanOf(await found.store.loans(), params.id);
			// While it's out it stays available underneath, so it's free again once it's back.
			await found.store.updateInstrument(params.id, { ...checked.values, status: out ? found.instrument.status : checked.values.status });
		} catch (cause) {
			return failed('Changing an instrument', cause);
		}
		return { saved: t.lending.saved };
	},

	lend: async ({ request, locals, params }) => {
		requireRight(locals, LENDING_RIGHT);
		const found = await opened(params.id);
		if ('message' in found) return fail(found.status, { message: found.message });
		const people = borrowers(await getAccessList().catch(() => null));
		const checked = loanFromForm(await request.formData(), people, today());
		if ('problem' in checked) return fail(400, { message: t.lending.problems[checked.problem] });
		try {
			const by = normalizeEmail(locals.access.user?.email ?? '');
			const loan = await found.store.lend({ ...checked.values, instrumentId: params.id, by });
			if (!loan) return fail(409, { message: t.lending.problems['not-available'] });
		} catch (cause) {
			return failed('Lending an instrument', cause);
		}
		return { saved: t.lending.lent(checked.values.name) };
	},

	giveBack: async ({ request, locals, params }) => {
		requireRight(locals, LENDING_RIGHT);
		const found = await opened(params.id);
		if ('message' in found) return fail(found.status, { message: found.message });
		const data = await request.formData();
		try {
			const loan = openLoanOf(await found.store.loans(), params.id);
			if (!loan || loan.id !== String(data.get('loan') ?? '')) return fail(409, { message: t.lending.problems['not-available'] });
			const checked = returnFromForm(data, loan, today());
			if ('problem' in checked) return fail(400, { message: t.lending.problems[checked.problem] });
			if (!(await found.store.giveBack(loan.id, checked.values.returned, checked.values.returnNote))) return fail(409, { message: t.lending.problems['not-available'] });
		} catch (cause) {
			return failed('Taking an instrument back', cause);
		}
		return { saved: t.lending.returned };
	},

	remove: async ({ locals, params }) => {
		requireRight(locals, LENDING_RIGHT);
		const found = await opened(params.id);
		if ('message' in found) return fail(found.status, { message: found.message });
		let removed: boolean;
		try {
			removed = await found.store.removeInstrument(params.id);
		} catch (cause) {
			return failed('Deleting an instrument', cause);
		}
		if (!removed) return fail(409, { message: t.lending.removeHint });
		redirect(303, '/leihinstrumente');
	}
};

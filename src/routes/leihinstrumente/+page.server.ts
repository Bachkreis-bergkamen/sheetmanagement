import { fail } from '@sveltejs/kit';
import { config } from '#lib/config/index.ts';
import { formatDay } from '#lib/events/format.ts';
import * as t from '#lib/i18n/texts.ts';
import { instrumentDetails, instrumentFromForm, instrumentName, instrumentState, loanDays, loanUrgency, openLoanOf, sortInstrumentLoans, sortInstruments } from '#lib/lending/lending.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { LENDING_RIGHT, lendingStore } from '#lib/server/lending.ts';
import { today } from '#lib/server/members.ts';
import type { Actions, PageServerLoad } from './$types';

/** The instruments the orchestra lends out (#296): what's out and with whom, and the inventory. */
export const load: PageServerLoad = async ({ locals }) => {
	requireFeature('lending');
	requireRight(locals, LENDING_RIGHT);
	const store = await lendingStore();
	if (!store) return { state: 'not-set-up' as const };
	const [instruments, loans] = await Promise.all([store.instruments(), store.loans()]);
	const day = today();
	const date = (value: string) => formatDay(value, config.locale);
	const byId = new Map(instruments.map((instrument) => [instrument.id, instrument]));
	const shown = sortInstruments(instruments).map((instrument) => {
		const loan = openLoanOf(loans, instrument.id);
		return {
			id: instrument.id,
			name: instrumentName(instrument),
			details: instrumentDetails(instrument),
			state: instrumentState(instrument, loan),
			with: loan?.name
		};
	});
	const out = sortInstrumentLoans(loans.filter((loan) => !loan.returned)).flatMap((loan) => {
		const instrument = byId.get(loan.instrumentId);
		if (!instrument) return [];
		return [
			{
				id: loan.id,
				instrumentId: instrument.id,
				name: instrumentName(instrument),
				details: instrumentDetails(instrument),
				who: loan.name,
				from: date(loan.from),
				due: loan.due ? date(loan.due) : undefined,
				urgency: loanUrgency(loan, day),
				days: loanDays(loan, day)
			}
		];
	});
	return {
		state: 'ready' as const,
		out,
		stock: shown.filter((instrument) => instrument.state !== 'retired'),
		retired: shown.filter((instrument) => instrument.state === 'retired')
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		requireRight(locals, LENDING_RIGHT);
		const store = await lendingStore();
		if (!store) return fail(503, { message: t.lending.notSetUp });
		const data = await request.formData();
		const checked = instrumentFromForm(data);
		const values = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));
		if ('problem' in checked) return fail(400, { message: t.lending.problems[checked.problem], values });
		try {
			await store.addInstrument(checked.values);
		} catch (cause) {
			console.error('Adding an instrument failed:', cause);
			return fail(503, { message: t.lending.failed, values });
		}
		return { added: true };
	}
};

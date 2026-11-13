import { fail } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.ts';
import { today } from '#lib/server/members.ts';
import { arrangementOf, organisersOnly } from '#lib/server/trip-organising.ts';
import { openTrip } from '#lib/server/trips.ts';
import { costs, feesFromForm, paymentFromForm } from '#lib/trips/organising.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Kosten (#334, step 3): the fee per person, reduced or waived for some, and who paid when. Only
 * tracking: the money goes by bank transfer as before, and only the organisers see this page.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const opened = await openTrip(locals, params.id);
	organisersOnly(opened);
	const { store, trip, participants } = opened;
	const summary = costs(trip, participants, await store.arrangements(trip.id));
	return {
		trip: { id: trip.id, title: trip.title, fee: trip.fee, feeReduced: trip.feeReduced },
		...summary,
		today: today()
	};
};

export const actions: Actions = {
	fees: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const parsed = feesFromForm(await request.formData());
		if ('problem' in parsed) return fail(400, { error: t.trips.organising.problems.fee, email: '' });
		await opened.store.setOrganising(opened.trip.id, { fee: parsed.fee, feeReduced: parsed.feeReduced });
		return { saved: true };
	},

	pay: async ({ locals, params, request }) => {
		const opened = await openTrip(locals, params.id);
		organisersOnly(opened);
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const arrangement = await arrangementOf(opened, email);
		if (!arrangement) return fail(400, { error: t.trips.organising.problems.gone, email });
		const parsed = paymentFromForm(form, opened.trip, today());
		if ('problem' in parsed) return fail(400, { error: t.trips.organising.problems[parsed.problem], email });
		await opened.store.saveArrangement({ ...arrangement, fee: parsed.fee, paidOn: parsed.paidOn });
		return { saved: true };
	}
};

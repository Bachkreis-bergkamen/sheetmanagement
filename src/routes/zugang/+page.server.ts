import { fail, redirect } from '@sveltejs/kit';
import { lacksSurname, normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import { appendRecords, readTab, refreshAfterWrite } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.auth === 'off' || locals.access.member) redirect(303, '/');
	const user = locals.access.user;
	if (!user) redirect(303, '/anmelden');
	const list = await getAccessList();
	return {
		user,
		requested: !!list?.requests.some((request) => request.email === normalizeEmail(user.email)),
		canRequest: !!list?.tables.requests
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = locals.access.user;
		if (locals.auth === 'off' || !user) redirect(303, '/anmelden');
		if (locals.access.member) redirect(303, '/');
		// First and last name, so admins can tell two people with the same first name apart.
		const name = String((await request.formData()).get('name') ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
		if (!name || lacksSurname(name)) return fail(400, { name, nameError: t.access.surnameNeeded });
		try {
			const table = await readTab('requests');
			const email = normalizeEmail(user.email);
			// Asking twice leaves one row.
			if (!table.rows.some((row) => normalizeEmail(row.values.email) === email)) {
				const today = new Date().toISOString().slice(0, 10);
				await appendRecords('requests', table, [{ email, name, requestedAt: today }]);
				await refreshAfterWrite();
			}
			return { requested: true };
		} catch (error) {
			console.error('Saving an access request failed:', error);
			return fail(503, { failed: true });
		}
	}
};

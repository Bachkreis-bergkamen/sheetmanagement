import { fail, redirect } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { commonInstruments, playableInstruments } from '#lib/music/my-parts.ts';
import { setPassword } from '#lib/server/auth/accounts.ts';
import { authConfig, startSession } from '#lib/server/auth/index.ts';
import { findInvite, removeInvite } from '#lib/server/auth/invites.ts';
import { passwordProblem } from '#lib/server/auth/password.ts';
import { getStore } from '#lib/server/db/index.ts';
import { looksLikeEmail } from '#lib/server/mail/sign-in.ts';
import { readMemberForm, writable } from '#lib/server/members.ts';
import { appendRecords, deleteRows, readTab, refreshAfterWrite, SheetLayoutError } from '#lib/server/sheet-writes.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * An invitation from an admin (see invites.ts): the new member fills in name, email, password
 * and instruments and is signed in. Opening the link only shows the form, so link previews in
 * chat apps don't use it up.
 */
export const load: PageServerLoad = async ({ params }) => {
	const auth = authConfig();
	if (auth.mode === 'off') redirect(303, '/');
	const invite = await findInvite(params.token).catch(() => null);
	return {
		valid: !!invite,
		instruments: playableInstruments(config),
		common: commonInstruments(config),
		orchestras: config.orchestras
	};
};

type Field = 'name' | 'email' | 'password';

export const actions: Actions = {
	default: async ({ params, request, cookies }) => {
		const auth = authConfig();
		if (auth.mode === 'off') redirect(303, '/');
		const invite = await findInvite(params.token).catch(() => null);
		if (!invite || !auth.sessionSecret) return fail(410, { invalid: true });

		const data = await request.formData();
		const email = normalizeEmail(String(data.get('email') ?? '').trim().slice(0, 200));
		const form = readMemberForm(data);
		// What was typed comes back, so nothing has to be entered twice; never the password.
		const typed = { name: String(data.get('name') ?? '').slice(0, 200), email };
		const problem = (field: Field, message: string) => fail(400, { ...typed, field, message });

		if ('problem' in form) return problem('name', form.problem);
		if (!form.values.name) return problem('name', t.invite.nameMissing);
		if (!looksLikeEmail(email)) return problem('email', t.admin.invalidEmail);
		const weak = passwordProblem(String(data.get('password') ?? ''), String(data.get('repeat') ?? ''));
		if (weak) return problem('password', t.password.problems[weak]);
		if (!form.values.instrument) return fail(400, { ...typed, field: 'instrument' as const, message: t.invite.instrumentMissing });

		let stamp: string;
		try {
			const [members, requests] = await Promise.all([readTab('members'), readTab('requests')]);
			// Someone already in: they sign in as before, and the link stays for whoever it's meant for.
			if (members.rows.some((row) => normalizeEmail(row.values.email) === email) || (await getStore().accountOf(email))) {
				return fail(409, { ...typed, field: 'email' as const, message: t.invite.exists, exists: true });
			}
			await appendRecords('members', members, [writable(members, { ...form.values, email, groups: invite.groups })]);
			// A request they sent before is answered now.
			const asked = requests.rows.filter((row) => normalizeEmail(row.values.email) === email).map((row) => row.row);
			if (asked.length) await deleteRows('requests', requests, asked);
			stamp = await setPassword(email, String(data.get('password')));
			await removeInvite(invite.id);
			await refreshAfterWrite();
		} catch (error) {
			if (error instanceof SheetLayoutError) return fail(409, { ...typed, field: null, message: error.message });
			console.error('Joining with an invitation failed:', error);
			return fail(503, { ...typed, field: null, message: t.invite.joinFailed });
		}
		await startSession(cookies, auth.sessionSecret, { email, name: form.values.name, pw: stamp });
		redirect(303, '/meine-noten');
	}
};

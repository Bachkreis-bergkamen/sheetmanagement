import { fail, redirect } from '@sveltejs/kit';
import { setPassword } from '#lib/server/auth/accounts.ts';
import { authConfig, startSession } from '#lib/server/auth/index.ts';
import { passwordProblem, readSetPasswordToken } from '#lib/server/auth/password.ts';
import { getStore } from '#lib/server/db/index.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * The link from the email: whoever has it may set the password for that address. It works
 * once: setting a password changes the account's stamp, which the link was made with. Opening
 * it only shows the form, so mail scanners that open links don't use it up.
 */
async function check(token: string) {
	const auth = authConfig();
	if (auth.mode === 'off' || !auth.sessionSecret) return { auth, email: null, exists: false };
	const link = await readSetPasswordToken(token, auth.sessionSecret);
	if (!link) return { auth, email: null, exists: false };
	const account = await getStore().accountOf(link.email);
	if ((account?.stamp ?? '') !== link.stamp) return { auth, email: null, exists: false };
	return { auth, email: link.email, exists: !!account };
}

export const load: PageServerLoad = async ({ params }) => {
	const { auth, email, exists } = await check(params.token);
	if (auth.mode === 'off') redirect(303, '/');
	return { email, exists };
};

export const actions: Actions = {
	default: async ({ params, request, cookies }) => {
		const { auth, email } = await check(params.token);
		if (auth.mode === 'off') redirect(303, '/');
		if (!email) return fail(410, { invalid: true });
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const problem = passwordProblem(password, String(data.get('repeat') ?? ''));
		if (problem) return fail(400, { problem });
		let stamp;
		try {
			stamp = await setPassword(email, password);
		} catch (cause) {
			console.error('Setting a password failed:', cause);
			return fail(503, { failed: true });
		}
		const member = (await getAccessList())?.membersByEmail.get(email);
		await startSession(cookies, auth.sessionSecret, { email, name: member?.name || email, pw: stamp });
		// Members go to their music; someone new to /zugang, from the layout, to ask for access.
		redirect(303, '/');
	}
};

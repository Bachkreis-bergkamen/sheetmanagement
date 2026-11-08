import { fail, redirect } from '@sveltejs/kit';
import { authConfig } from '#lib/server/auth/index.ts';
import { runInBackground } from '#lib/server/env.ts';
import { mailReady } from '#lib/server/mail/index.ts';
import { looksLikeEmail, requestPasswordLink } from '#lib/server/mail/sign-in.ts';
import type { Actions, PageServerLoad } from './$types';

/** Signing up, or a forgotten password: a link by email to set one. */
export const load: PageServerLoad = async () => {
	const auth = authConfig();
	if (auth.mode === 'off') redirect(303, '/');
	return { mail: !auth.problems.length && (await mailReady()) };
};

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const auth = authConfig();
		if (auth.mode === 'off' || auth.problems.length || !(await mailReady())) return fail(404, { mailError: 'failed' as const });
		const email = String((await request.formData()).get('email') ?? '').trim();
		if (!looksLikeEmail(email) || email.length > 200) return fail(400, { mailError: 'invalid' as const, email });
		try {
			const result = await requestPasswordLink(email, getClientAddress(), url.origin);
			if (result.state === 'limited') return fail(429, { mailError: 'limited' as const, email });
			// Sent after the answer: an address with an account takes as long to answer as any other.
			if (result.work) runInBackground(result.work.catch((cause: unknown) => console.error('Password mail failed:', cause)));
			return { mailSent: email };
		} catch (cause) {
			console.error('Asking for a password link failed:', cause);
			return fail(503, { mailError: 'failed' as const, email });
		}
	}
};

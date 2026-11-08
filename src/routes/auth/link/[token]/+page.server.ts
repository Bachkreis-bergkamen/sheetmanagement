import { fail, redirect } from '@sveltejs/kit';
import { authConfig, startSession } from '#lib/server/auth/index.ts';
import { linkValid, readLinkToken } from '#lib/server/auth/links.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * A personal access link. Opening it only shows a button; signing in is a POST, so link
 * previews in chat apps (which open the link themselves) don't sign anyone in.
 */
async function member(token: string) {
	const auth = authConfig();
	if (auth.mode === 'off' || !auth.sessionSecret) return { auth, member: null };
	const link = await readLinkToken(token, auth.sessionSecret);
	const found = link ? (await getAccessList())?.membersByEmail.get(link.email) : undefined;
	return { auth, member: found && link && linkValid(found.linkVersion, link.version) ? { ...found, version: link.version } : null };
}

export const load: PageServerLoad = async ({ params }) => {
	const { auth, member: found } = await member(params.token);
	if (auth.mode === 'off') redirect(303, '/');
	// Only the first name: the link may have been forwarded.
	return { valid: !!found, firstName: found?.name.split(/\s+/)[0] ?? '' };
};

export const actions: Actions = {
	default: async ({ params, cookies }) => {
		const { auth, member: found } = await member(params.token);
		if (auth.mode === 'off') redirect(303, '/');
		if (!found) return fail(410, { invalid: true });
		await startSession(cookies, auth.sessionSecret, { email: found.email, name: found.name, link: found.version });
		redirect(303, '/meine-noten');
	}
};

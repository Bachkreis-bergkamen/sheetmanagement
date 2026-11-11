import { error } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { config } from '#lib/config/index.ts';
import { t } from '#lib/i18n/index.ts';
import { parseInstruments } from '#lib/music/my-parts.ts';
import { isOn } from '#lib/server/env.ts';
import { getAccessList } from '#lib/server/repertoire.ts';
import type { PageServerLoad } from './$types';

/**
 * The Übebereich (#300, #315): drills that run entirely in the browser. The server only says
 * whose progress to load from the device and which instruments the member plays, so the drills
 * start in the right clef; answers, progress and the microphone never reach it.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isOn('drills')) error(404, t.error.notFound);
	const user = locals.access.user;
	const access = user ? await getAccessList().catch(() => null) : null;
	const member = user ? access?.membersByEmail.get(normalizeEmail(user.email)) : undefined;
	return {
		// Progress is kept per account on the device, so a shared device keeps each member's own.
		account: user ? normalizeEmail(user.email) : 'guest',
		instruments: parseInstruments(member?.instrument ?? '', config).map((choice) => choice.instrument)
	};
};

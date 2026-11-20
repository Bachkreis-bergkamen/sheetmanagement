import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { notify, pushReady } from '#lib/server/push/index.ts';
import type { RequestHandler } from './$types';

/** "Test senden" on /profil (#157): one notice to the member's own devices. */
export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.access.user;
	if (!pushReady()) error(404, t.error.notFound);
	if (!user || !locals.access.member) error(403, t.messages.signInFirst);
	const reached = await notify([normalizeEmail(user.email)], { title: t.push.testTitle, body: t.push.testBody, url: '/profil', tag: 'test' });
	return json({ reached: reached.size });
};

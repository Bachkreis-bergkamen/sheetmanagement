import { error } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { getStore } from '#lib/server/db/index.ts';
import { recordError } from '#lib/server/errors.ts';
import type { RequestHandler } from './$types';

/** Reports a browser sends in an hour at most; more means a loop, not more news. */
const PER_HOUR = 30;

/** An error in a member's browser (#191), from hooks.client.ts. Kept by kind on /status. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.access.user;
	if (!user || !locals.access.member) error(403, t.messages.signInFirst);
	if ((await getStore().hit(`errors:${normalizeEmail(user.email)}`, 60)) > PER_HOUR) return new Response(null, { status: 429 });
	const body = (await request.json().catch(() => null)) as { message?: unknown; place?: unknown } | null;
	if (body) await recordError({ source: 'client', message: body.message, place: body.place });
	return new Response(null, { status: 204 });
};

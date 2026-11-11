import { error } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { beatSeconds, MAX_QUEUED_SECONDS } from '#lib/practice/practice.ts';
import { getStore } from '#lib/server/db/index.ts';
import { isOn } from '#lib/server/env.ts';
import { recordPractice } from '#lib/server/practice.ts';
import type { RequestHandler } from './$types';

/** Rounds end every few minutes; this leaves room for time kept on the device while offline. */
const PER_MINUTE = 6;

/**
 * Time from the Übebereich's rounds (#300): `{ seconds }`, the time spent answering, sent when a
 * round ends (and what couldn't be sent before). It goes to the member's practice time and so
 * grows their tree, only when they turned practice time on (409 otherwise, so the page stops
 * sending). The answers themselves stay on the device.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isOn('drills')) error(404, t.error.notFound);
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.signInFirst);
	const body = (await request.json().catch(() => null)) as { seconds?: unknown } | null;
	const seconds = beatSeconds(body?.seconds, MAX_QUEUED_SECONDS);
	if (!seconds) return new Response(null, { status: 204 });
	const email = normalizeEmail(user.email);
	if ((await getStore().hit(`practice:${email}`, 1)) > PER_MINUTE) error(429);
	const counted = await recordPractice(email, seconds);
	return new Response(null, { status: counted ? 204 : 409 });
};

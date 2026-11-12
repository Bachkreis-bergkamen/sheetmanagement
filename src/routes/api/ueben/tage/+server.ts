import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { readRows, sharesAny } from '#lib/practice/drills/sharing.ts';
import { getStore } from '#lib/server/db/index.ts';
import { isOn } from '#lib/server/env.ts';
import { today } from '#lib/server/members.ts';
import type { RequestHandler } from './$types';

/** A summary goes after each round and when the page opens; this leaves room for a few devices. */
const PER_HOUR = 30;

/**
 * The Übebereich's daily summaries (#300): `{ rows }`, per day and skill the answers, how many
 * right and the seconds, for the last four weeks. Kept only when the member shares something
 * (409 otherwise, so the page stops sending); the same day sent again replaces what was there.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isOn('drills')) error(404, t.error.notFound);
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.signInFirst);
	const email = normalizeEmail(user.email);
	const body = (await request.json().catch(() => null)) as { rows?: unknown } | null;
	const rows = readRows(body?.rows, today());
	if (!rows) error(400);
	const store = getStore();
	if ((await store.hit(`drill-days:${email}`, 60)) > PER_HOUR) error(429);
	if (!sharesAny(await store.drillSharing(email))) return new Response(null, { status: 409 });
	await store.saveDrillDays(email, rows);
	return json({ saved: rows.length });
};

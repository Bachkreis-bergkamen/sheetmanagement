import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import { t } from '#lib/i18n/index.ts';
import { readSharing } from '#lib/practice/drills/sharing.ts';
import { getStore } from '#lib/server/db/index.ts';
import { drillsAccessList, sharingState } from '#lib/server/drills.ts';
import { isOn } from '#lib/server/env.ts';
import type { RequestHandler } from './$types';

/**
 * What a member shares from the Übebereich (#300): `{ board, leaders, parents }`. All off
 * deletes the choice and every summary sent. Answers with what holds, which for a young player
 * leaves the board and the leaders off until a parent agrees.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isOn('drills')) error(404, t.error.notFound);
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member || locals.access.parent?.only) error(403, t.messages.signInFirst);
	const email = normalizeEmail(user.email);
	const store = getStore();
	if ((await store.hit(`drill-sharing:${email}`, 1)) > 20) error(429);
	await store.setDrillSharing(email, readSharing(await request.json().catch(() => null)));
	const list = await drillsAccessList();
	if (!list) error(503, t.error.unavailable);
	const state = await sharingState(list, email);
	return json({ chosen: state.chosen, effective: state.effective, child: state.child, consented: state.consented });
};

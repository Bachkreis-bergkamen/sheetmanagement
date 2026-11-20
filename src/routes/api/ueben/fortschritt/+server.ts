import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { readData } from '#lib/practice/drills/progress.ts';
import { MAX_SYNC_BYTES, mergeData, sharedCopy } from '#lib/practice/drills/sync.ts';
import { getStore } from '#lib/server/db/index.ts';
import { isOn } from '#lib/server/env.ts';
import type { RequestHandler } from './$types';

/** A sync after each change (a few seconds apart at most) and when the page opens or closes. */
const PER_HOUR = 600;

/**
 * The Übebereich's progress across a member's devices (#300). `{ data }` from a device: merged
 * with the copy kept here and the result sent back, which the device merges into what it has
 * meanwhile. An empty copy just fetches what's kept; a reset one (newer `since`) replaces it.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isOn('drills')) error(404, t.error.notFound);
	const user = locals.access.user;
	if (locals.auth !== 'on' || !user || !locals.access.member) error(403, t.messages.signInFirst);
	const email = normalizeEmail(user.email);
	const store = getStore();
	if ((await store.hit(`drill-progress:${email}`, 60)) > PER_HOUR) error(429);
	const text = await request.text();
	if (text.length > MAX_SYNC_BYTES) error(413);
	let body: { data?: unknown } | null = null;
	try {
		body = JSON.parse(text);
	} catch {
		error(400);
	}
	if (!body || typeof body.data !== 'object' || !body.data) error(400);
	const sent = sharedCopy(readData(body.data));
	const kept = await store.drillProgressOf(email);
	const merged = kept === null ? sent : sharedCopy(mergeData(readData(parse(kept)), sent));
	const out = JSON.stringify(merged);
	// Nothing practised and never reset: nothing worth keeping yet.
	const empty = !Object.keys(merged.items).length && !Object.keys(merged.days).length && !merged.since;
	if (out !== kept && !(empty && kept === null)) await store.setDrillProgress(email, out);
	return json({ data: merged }, { headers: { 'cache-control': 'private, no-store' } });
};

function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

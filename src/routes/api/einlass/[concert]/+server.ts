import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { requireRight } from '#lib/server/auth/index.ts';
import { getStore } from '#lib/server/db/index.ts';
import { requireFeature } from '#lib/server/env.ts';
import { getLibrary } from '#lib/server/library.ts';
import { doorTickets } from '#lib/server/tickets.ts';
import { looksLikeCode } from '#lib/tickets/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * The door (docs/tickets-plan.md §4.4). GET: every valid ticket of the concert with the
 * buyer's name, which the phone keeps to check codes offline. POST: the phone's check-ins
 * since it last had a connection; the answer is the list again, with the other phones' ones.
 */

const RIGHT = 'karten.einlass';
const MAX_BATCH = 500;

async function concert(id: string) {
	const library = await getLibrary();
	const event = library.schedule.ok ? library.schedule.byId.get(id) : undefined;
	if (!event || event.type !== 'konzert') error(404, t.tickets.notAConcert);
	return event;
}

const listResponse = async (id: string) =>
	json({ tickets: await doorTickets(id), at: new Date().toISOString() }, { headers: { 'cache-control': 'private, no-store' } });

export const GET: RequestHandler = async ({ params, locals }) => {
	requireFeature('tickets');
	requireRight(locals, RIGHT);
	await concert(params.concert);
	return listResponse(params.concert);
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	requireFeature('tickets');
	requireRight(locals, RIGHT);
	await concert(params.concert);
	const body = (await request.json().catch(() => null)) as { checkIns?: unknown } | null;
	const raw = Array.isArray(body?.checkIns) ? body.checkIns.slice(0, MAX_BATCH) : [];
	const by = normalizeEmail(locals.access.user?.email ?? '');
	const entries = raw.flatMap((entry: { code?: unknown; at?: unknown }) => {
		const code = typeof entry?.code === 'string' ? entry.code : '';
		const at = typeof entry?.at === 'string' && !Number.isNaN(Date.parse(entry.at)) ? new Date(entry.at).toISOString() : '';
		return looksLikeCode(code) && at ? [{ code, at, by }] : [];
	});
	await getStore().checkInTickets(params.concert, entries);
	return listResponse(params.concert);
};

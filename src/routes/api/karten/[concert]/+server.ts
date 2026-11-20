import { error, json } from '@sveltejs/kit';
import * as t from '#lib/i18n/texts.ts';
import { isOn } from '#lib/server/env.ts';
import { publicSale, reserve } from '#lib/server/tickets.ts';
import type { RequestHandler } from './$types';

/**
 * A concert's ticket sale for the orchestra's website (docs/tickets-plan.md §4.3), without
 * sign-in. GET: prices with the online surcharge apart, and how many seats are left; nothing
 * about buyers. POST: a reservation, paid at the Kasse, confirmed by mail.
 */

export const GET: RequestHandler = async ({ params }) => {
	if (!isOn('tickets')) error(404, t.error.notFound);
	const sale = await publicSale(params.concert);
	if (!sale) error(404, t.tickets.problems.closed);
	return json(sale, {
		headers: {
			'access-control-allow-origin': '*',
			// Seats left changes with every order: only a few seconds.
			'cache-control': 'public, max-age=10'
		}
	});
};

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isOn('tickets')) error(404, t.error.notFound);
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') return json({ ok: false, problem: 'empty', message: t.tickets.problems.empty }, { status: 400 });
	// From the internet, Cloudflare's own header; through the website's service binding there is
	// none, and the website passes its visitor's address on. A direct caller can't fake the first.
	const caller = request.headers.get('cf-connecting-ip') || request.headers.get('x-visitor-ip') || safeAddress(getClientAddress);
	const result = await reserve(params.concert, body as Record<string, unknown>, caller);
	if (!result.ok) return json({ ok: false, problem: result.problem, message: t.tickets.problems[result.problem] ?? t.tickets.problems.closed }, { status: result.status });
	return json(result, { headers: { 'cache-control': 'no-store' } });
};

function safeAddress(get: () => string): string {
	try {
		return get();
	} catch {
		return 'unknown';
	}
}

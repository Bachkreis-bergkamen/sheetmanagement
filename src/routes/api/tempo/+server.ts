import { getStore } from '#lib/server/db/index.ts';
import { today } from '#lib/server/members.ts';
import { parseReport } from '#lib/vitals/vitals.ts';
import type { RequestHandler } from './$types';

/** Beacons from one address in an hour at most; a page sends one or two per visit. */
const PER_HOUR = 120;

/**
 * How fast pages were on a member's device (#187), sent by the layout when a page is left or
 * hidden: route patterns, the kind of device and the measured times, counted per bucket and
 * day, never per person. Answers 204 whatever happens: measuring must never cost anything.
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	if (locals.auth === 'on' && !locals.access.member) return new Response(null, { status: 204 });
	const store = getStore();
	// The dev server and some tests can't name the address; those beacons share one count.
	let address = 'unknown';
	try {
		address = getClientAddress();
	} catch {}
	try {
		if ((await store.hit(`tempo:${address}`, 60)) > PER_HOUR) return new Response(null, { status: 204 });
		const samples = parseReport(await request.json().catch(() => null));
		await store.countVitals(today(), samples);
	} catch (error) {
		console.error('Counting speed failed:', error);
	}
	return new Response(null, { status: 204 });
};

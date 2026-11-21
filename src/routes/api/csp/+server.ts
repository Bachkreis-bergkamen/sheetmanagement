import { cspViolation } from '#lib/errors/errors.ts';
import { getStore } from '#lib/server/db/index.ts';
import { recordError } from '#lib/server/errors.ts';
import type { RequestHandler } from './$types';

/** Reports from one address in an hour at most; more is one page saying the same thing. */
const PER_HOUR = 60;

/**
 * Where browsers report what the script policy (#358, vite.config.ts) blocked. The reports
 * go to the error log on /status, so a script the policy should allow shows there before
 * members report a broken page. Browsers send these without the sign-in, so it's open,
 * like the health check.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if ((await getStore().hit(`csp:${getClientAddress()}`, 60)) > PER_HOUR) return new Response(null, { status: 429 });
	const violation = cspViolation(await request.json().catch(() => null));
	if (violation) await recordError({ source: 'client', ...violation });
	return new Response(null, { status: 204 });
};

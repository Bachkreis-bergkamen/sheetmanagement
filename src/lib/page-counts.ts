/**
 * Page counts for the page audit (#185): the browser names the route it opened, as SvelteKit's
 * pattern ("/stuecke/[id]"), never the address itself, so no id, search or name gets stored.
 */

/** How many days the counts are kept, and how many the status page sums up. */
export const KEEP_DAYS = 180;
export const SHOWN_DAYS = 30;

/** Whether a route pattern looks like one of the app's pages; anything else isn't counted. */
export function isPageRoute(route: unknown): route is string {
	return typeof route === 'string' && route.length <= 80 && /^\/[a-z0-9\-/[\].=]*$/.test(route) && !route.startsWith('/api');
}

/** The day `days` before `today` ("2026-11-08"), as "2026-10-09". */
export function daysBefore(today: string, days: number): string {
	const date = new Date(`${today}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().slice(0, 10);
}

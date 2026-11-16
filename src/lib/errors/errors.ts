/**
 * The error log (#191), the part both sides share: an error as a kind, without anything that
 * says who it happened to. The server keeps kinds in D1 (see db/), the browser sends its own.
 */

export type ErrorSource = 'server' | 'client';

export interface ErrorReport {
	source: ErrorSource;
	/** The route, e.g. "/stuecke/[id]", never the address with its ids. */
	place: string;
	message: string;
	/** The HTTP status on the server; none in the browser. */
	status?: number;
}

/** One kind of error as /status shows it. */
export interface ErrorGroup extends ErrorReport {
	fingerprint: string;
	count: number;
	/** Like SQLite's datetime('now'), UTC. */
	firstAt: string;
	lastAt: string;
	notified: boolean;
}

export const MAX_MESSAGE = 300;
export const MAX_PLACE = 120;

/**
 * The message without personal data and without what makes two of the same kind differ:
 * email addresses, links' queries, long ids and tokens, long numbers. First line only.
 */
export function scrub(message: string): string {
	return (message.split('\n')[0] ?? '')
		.replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi, '<email>')
		.replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi, '$1')
		.replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}\b/g, '<id>')
		.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
		.replace(/\d{5,}/g, '<n>')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_MESSAGE);
}

/** A route as a place: ids in an address that isn't a route id become "<id>". */
export function scrubPlace(place: string): string {
	return place
		.split(/[?#]/)[0]
		.split('/')
		.map((part) => (/^\[.*\]$/.test(part) || !/\d/.test(part) || part.length < 6 ? part : '<id>'))
		.join('/')
		.slice(0, MAX_PLACE);
}

/** The same kind gets the same key: where, what and on which side. FNV-1a, short enough for a key. */
export function fingerprint(report: ErrorReport): string {
	const text = `${report.source}\n${report.place}\n${report.message}`;
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${report.source[0]}${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** A report as it is stored: scrubbed, or null when nothing is left to say. */
export function cleanReport(report: { source: ErrorSource; place?: unknown; message?: unknown; status?: unknown }): ErrorReport | null {
	const message = typeof report.message === 'string' ? scrub(report.message) : '';
	if (!message) return null;
	const place = typeof report.place === 'string' && report.place ? scrubPlace(report.place) : '?';
	const status = typeof report.status === 'number' && Number.isInteger(report.status) ? report.status : undefined;
	return { source: report.source, place, message, ...(status ? { status } : {}) };
}

/**
 * A browser's report of something the script policy (#358) would block, as an error to log:
 * which rule and what it blocked ("inline", "eval", a site), on which page. Takes the old
 * report-uri form ({"csp-report": …}) and the Reporting API's ([{type, body}]). Null for
 * anything else, and for extensions' scripts, which aren't the app's.
 */
export function cspViolation(body: unknown): { message: string; place: string } | null {
	const item = Array.isArray(body) ? body.find((each) => each?.type === 'csp-violation')?.body : (body as Record<string, unknown> | null)?.['csp-report'];
	if (!item || typeof item !== 'object') return null;
	const raw = item as Record<string, unknown>;
	const text = (...keys: string[]) => {
		const value = keys.map((key) => raw[key]).find((each) => typeof each === 'string' && each);
		return typeof value === 'string' ? value : '';
	};
	const directive = text('effective-directive', 'effectiveDirective', 'violated-directive').split(' ')[0];
	const blocked = text('blocked-uri', 'blockedURL') || 'inline';
	if (!directive || /^(chrome|moz|safari(-web)?)-extension:/.test(blocked)) return null;
	let place = '?';
	try {
		place = new URL(text('document-uri', 'documentURL')).pathname;
	} catch {
		// No page given: kept as "?".
	}
	// A site's address without its path: which site, not which file of it.
	const what = /^https?:\/\//.test(blocked) ? new URL(blocked).origin : blocked;
	return { message: `CSP ${directive}: ${what}`, place };
}

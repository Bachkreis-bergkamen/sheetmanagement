import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { parentMayOpen, resolveAccess } from '#lib/access/access.ts';
import { LANGUAGE, t } from '#lib/i18n/index.ts';
import { featureOfPath } from '#lib/features.ts';
import { movedPath } from '#lib/nav.ts';
import { accessFromCookies, authConfig, isPublicPath } from '#lib/server/auth/index.ts';
import { canonicalUrl } from '#lib/server/canonical.ts';
import { appEnv, isOn, runInBackground } from '#lib/server/env.ts';
import { messageOf, recordError } from '#lib/server/errors.ts';
import { isScheduledCall } from '#lib/server/jobs/token.ts';
import { accessForDate } from '#lib/server/library.ts';
import { refreshStoredSettings } from '#lib/server/repertoire.ts';
import { serverTiming } from '#lib/server/timing.ts';

/** Sent with every response: no framing (clickjacking on the admin forms), no MIME sniffing. */
const SECURITY_HEADERS = {
	'content-security-policy': "frame-ancestors 'none'",
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin'
};

export const handle: Handle = async ({ event, resolve }) => {
	const marks: [string, number][] = [];
	let last = performance.now();
	const mark = (name: string) => {
		const now = performance.now();
		marks.push([name, now - last]);
		last = now;
	};
	// The old workers.dev address, once the app has its own domain; 308 keeps the method, like below.
	const canonical = canonicalUrl(event.url, appEnv().APP_URL);
	if (canonical) return new Response(null, { status: 308, headers: { location: canonical, ...SECURITY_HEADERS } });
	// Old addresses of moved pages; 308 keeps the method, so a form posted to the old page still arrives.
	const moved = movedPath(event.url.pathname);
	if (moved) return new Response(null, { status: 308, headers: { location: moved + event.url.search, ...SECURITY_HEADERS } });
	// Name, colours and features from /einstellungen, from the cached sheet (#75, #134).
	if (event.url.pathname !== '/api/health') await refreshStoredSettings();
	mark('settings');
	const auth = authConfig();
	event.locals.auth = auth.mode;
	// The health check must answer even while Google doesn't.
	event.locals.access =
		event.url.pathname === '/api/health' ? resolveAccess(null, null, []) : await accessFromCookies(event.cookies, auth);
	// A date's pages, its programme, plan and attendance (#305): a role limited to some orchestras
	// counts there only for theirs, so every check on those pages goes by the date's orchestra.
	if (event.locals.access.scopes && event.route.id?.startsWith('/kalender/[id]') && event.params.id) {
		event.locals.access = await accessForDate(event.locals.access, event.params.id);
	}
	mark('access');

	// Pages redirect to sign-in in the root layout's load. That doesn't cover form
	// actions and endpoints, so anything that isn't a plain read is checked here.
	const write = event.request.method !== 'GET' && event.request.method !== 'HEAD';
	// The Cron Trigger's own call to /api/jobs (#160) has no session; its token is the proof.
	const scheduled = isScheduledCall(event.request);
	if (auth.mode === 'on' && write && !isPublicPath(event.url.pathname) && !event.locals.access.member && !scheduled) {
		const unavailable = event.locals.access.unavailable;
		return new Response(unavailable ? t.error.unavailable : t.messages.signInFirst, {
			status: unavailable ? 503 : 403,
			headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }
		});
	}
	// A parent account sees only the parents' area: a page elsewhere leads there (the root
	// layout does the same for client-side navigation), anything else is refused.
	if (auth.mode === 'on' && event.locals.access.parent?.only && !isPublicPath(event.url.pathname) && !parentMayOpen(event.url.pathname) && !event.isDataRequest) {
		const page = !write && (event.request.headers.get('accept') ?? '').includes('text/html');
		if (page) return new Response(null, { status: 303, headers: { location: '/eltern', ...SECURITY_HEADERS } });
		return new Response(t.error.forbidden, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS } });
	}
	// A part of the app this orchestra turned off (#134): its pages answer 404 from their load,
	// its form actions and files (calendar feed, music list) here.
	const feature = featureOfPath(event.url.pathname);
	if (feature && !isOn(feature) && (write || /\.(ics|csv)$/.test(event.url.pathname))) {
		return new Response(t.error.notFound, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS } });
	}
	// The page's language for screen readers, hyphenation and translation tools (#124).
	const response = await resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', LANGUAGE) });
	mark('page');
	const headers: Record<string, string> = { ...SECURITY_HEADERS, 'server-timing': serverTiming(marks) };
	for (const [name, value] of Object.entries(headers)) {
		// Redirects and some responses have immutable headers; those carry no page anyway.
		try {
			if (!response.headers.has(name)) response.headers.set(name, value);
		} catch {
			break;
		}
	}
	return response;
};

/**
 * Unexpected errors go to the error log (#191) by kind, so admins see them on /status before
 * members report them. 404s and errors thrown on purpose with error() don't come here.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;
	console.error(error);
	runInBackground(recordError({ source: 'server', place: event.route.id ?? event.url.pathname, message: messageOf(error), status: 500 }));
};

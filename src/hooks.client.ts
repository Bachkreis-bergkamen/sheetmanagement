import type { HandleClientError } from '@sveltejs/kit/hooks';
import { page } from '$app/state';

/**
 * Errors in members' browsers go to the error log (#191), like the server's: the message and
 * the route, nothing else. Each kind once per visit and only a few per visit, so a loop that
 * throws doesn't flood the log. Sent as a beacon, which survives leaving the page.
 */

const MAX_PER_VISIT = 5;
const sent = new Set<string>();

function report(error: unknown) {
	const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : '';
	// Extensions, aborted fetches and cross-origin scripts say nothing the app can act on, nor does
	// the browser's harmless note that a resize took one more frame (seen in the practice viewer).
	if (!message || /^Script error\.?$|^ResizeObserver loop/.test(message) || (error instanceof Error && error.name === 'AbortError')) return;
	const place = page.route.id ?? location.pathname;
	const key = `${place}\n${message}`;
	if (sent.has(key) || sent.size >= MAX_PER_VISIT) return;
	sent.add(key);
	try {
		navigator.sendBeacon('/api/fehler', new Blob([JSON.stringify({ message, place })], { type: 'application/json' }));
	} catch {
		// Nowhere to report the reporting.
	}
}

if (typeof window !== 'undefined') {
	window.addEventListener('error', (event) => report(event.error ?? event.message));
	window.addEventListener('unhandledrejection', (event) => report(event.reason));
}

export const handleError: HandleClientError = ({ kind, error }) => {
	if (kind === 'unknown') report(error);
};

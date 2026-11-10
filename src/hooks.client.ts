import type { HandleClientError } from '@sveltejs/kit/hooks';
import { page } from '$app/state';

/**
 * Errors in members' browsers go to the error log (#191), like the server's: the message and
 * the route, nothing else. Each kind once per visit and only a few per visit, so a loop that
 * throws doesn't flood the log. Sent as a beacon, which survives leaving the page.
 */

const MAX_PER_VISIT = 5;
const sent = new Set<string>();

function isNetworkFailure(error: unknown) {
	return error instanceof TypeError && /^(Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|Network request failed)$/.test(error.message);
}

function report(error: unknown) {
	const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : '';
	// Extensions, aborted fetches and cross-origin scripts say nothing the app can act on, nor does
	// the browser's harmless note that a resize took one more frame (seen in the practice viewer).
	if (!message || /^Script error\.?$|^ResizeObserver loop/.test(message) || (error instanceof Error && error.name === 'AbortError')) return;
	// A request that never reached the server (dead spot in the hall, phone waking up, tab closed
	// mid-load) is the network, not the app: Chrome says "Failed to fetch", Firefox "NetworkError
	// when attempting to fetch resource.", Safari "Load failed". The page already shows offline.
	if (isNetworkFailure(error)) return;
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

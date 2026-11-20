/**
 * Measures how fast the app is on this device (#187), the way the browser's own Core Web
 * Vitals do, without a library: LCP and TTFB once for the page the app was opened on, INP for
 * every route visited. Sent as one small beacon when the route changes or the app is hidden.
 * Only route patterns and times leave the device.
 */
import { inpOf, type Device } from './vitals.ts';

interface Landing {
	route: string;
	lcp: number | null;
	ttfb: number | null;
}

let started = false;
/** The page the app was opened on, until its LCP and TTFB are sent. */
let landing: Landing | null = null;
/** The route on screen and the slowest duration per interaction on it. */
let current: { route: string; interactions: Map<number, number> } | null = null;
/** The first tap, key or route change ends LCP, as in the browser's own measure. */
let lcpFinal = false;

const device = (): Device => (matchMedia('(pointer: coarse)').matches ? 'phone' : 'desktop');

function observe(type: string, take: (entries: PerformanceEntry[]) => void, options: Record<string, unknown> = {}) {
	try {
		new PerformanceObserver((list) => take(list.getEntries())).observe({ type, buffered: true, ...options } as PerformanceObserverInit);
	} catch {
		// Not measured in this browser (Safari has no LCP or INP yet): nothing is sent for it.
	}
}

/** Starts measuring, once per app start, on the route the app opened. */
export function startVitals(route: string) {
	if (started || typeof PerformanceObserver === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
	started = true;
	const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
	// Opened in a background tab: the page wasn't waited for, so its load says nothing.
	const visible = document.visibilityState === 'visible';
	landing = { route, lcp: null, ttfb: visible && navigation && navigation.responseStart > 0 ? navigation.responseStart : null };
	current = { route, interactions: new Map() };
	if (visible) {
		observe('largest-contentful-paint', (entries) => {
			if (!lcpFinal && landing && entries.length) landing.lcp = entries[entries.length - 1].startTime;
		});
	}
	observe(
		'event',
		(entries) => {
			for (const entry of entries as (PerformanceEntry & { interactionId?: number })[]) {
				if (!entry.interactionId || !current) continue;
				current.interactions.set(entry.interactionId, Math.max(current.interactions.get(entry.interactionId) ?? 0, entry.duration));
			}
		},
		{ durationThreshold: 40 }
	);
	for (const type of ['keydown', 'pointerdown']) addEventListener(type, () => (lcpFinal = true), { once: true, capture: true });
	addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush(current?.route ?? null);
	});
}

/** Another route is on screen: what was measured on the last one goes. */
export function vitalsNavigated(route: string) {
	if (!current || route === current.route) return;
	flush(route);
}

function flush(next: string | null) {
	lcpFinal = true;
	const items: { route: string; lcp?: number; ttfb?: number; inp?: number }[] = [];
	if (landing && (landing.lcp !== null || landing.ttfb !== null)) {
		items.push({ route: landing.route, ...(landing.lcp !== null ? { lcp: Math.round(landing.lcp) } : {}), ...(landing.ttfb !== null ? { ttfb: Math.round(landing.ttfb) } : {}) });
	}
	landing = null;
	const inp = current ? inpOf([...current.interactions.values()]) : null;
	if (current && inp !== null) {
		const same = items.find((item) => item.route === current!.route);
		if (same) same.inp = Math.round(inp);
		else items.push({ route: current.route, inp: Math.round(inp) });
	}
	if (current) current = { route: next ?? current.route, interactions: new Map() };
	if (!items.length || !navigator.onLine) return;
	navigator.sendBeacon('/api/tempo', new Blob([JSON.stringify({ device: device(), items })], { type: 'application/json' }));
}

/**
 * How fast the app feels on members' own phones (#187): the browser measures LCP (when the
 * page's main content showed), INP (how long a tap waits for the screen to answer) and TTFB
 * (until the first byte arrived, the connection included) and the server's own share of it, per route pattern. The server keeps only counts per bucket, per
 * day, route and kind of device, so the p75 can be read without storing a single visit.
 */
import { isPageRoute } from '#lib/page-counts.ts';

export const METRICS = ['lcp', 'inp', 'ttfb', 'server'] as const;
export type Metric = (typeof METRICS)[number];

/** Phones and tablets (touch) apart from computers: the targets are about phones. */
export const DEVICES = ['phone', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

/** The targets of #187, as p75. */
export const TARGETS: Partial<Record<Metric, number>> = { lcp: 1500, inp: 200 };

/** Upper edges of the buckets in ms; a value goes into the first edge it doesn't exceed. */
export const BUCKETS = [50, 100, 150, 200, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10_000, 20_000, 60_000] as const;
/** Anything slower than the last edge, and longest a value may be. */
const MAX_MS = 120_000;

export function bucketOf(ms: number): number {
	return BUCKETS.find((edge) => ms <= edge) ?? BUCKETS[BUCKETS.length - 1];
}

export interface Sample {
	route: string;
	device: Device;
	metric: Metric;
	/** The bucket's upper edge in ms. */
	bucket: number;
}

/** One count of the stored histogram, summed over days. */
export interface VitalCount {
	route: string;
	device: Device;
	metric: Metric;
	bucket: number;
	count: number;
}

/**
 * What a browser sends, checked: `{ device, items: [{ route, lcp?, inp?, ttfb? }] }`. Anything
 * odd is left out rather than refused; at most a few routes per beacon.
 */
export function parseReport(body: unknown): Sample[] {
	if (!body || typeof body !== 'object') return [];
	const { device, items } = body as { device?: unknown; items?: unknown };
	if (!DEVICES.includes(device as Device) || !Array.isArray(items)) return [];
	const samples: Sample[] = [];
	for (const item of items.slice(0, 10)) {
		if (!item || typeof item !== 'object' || !isPageRoute((item as { route?: unknown }).route)) continue;
		const route = (item as { route: string }).route;
		for (const metric of METRICS) {
			const value = (item as Record<string, unknown>)[metric];
			if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_MS) samples.push({ route, device: device as Device, metric, bucket: bucketOf(value) });
		}
	}
	return samples;
}

/** The p75 of a histogram as its bucket's upper edge ("at most this"); null without counts. */
export function p75(buckets: { bucket: number; count: number }[]): number | null {
	const total = buckets.reduce((sum, each) => sum + each.count, 0);
	if (!total) return null;
	let seen = 0;
	for (const each of [...buckets].sort((a, b) => a.bucket - b.bucket)) {
		seen += each.count;
		if (seen >= total * 0.75) return each.bucket;
	}
	return null;
}

export interface VitalRow {
	route: string;
	device: Device;
	/** How many page loads gave an LCP: the sample size people should read the row with. */
	loads: number;
	lcp: number | null;
	inp: number | null;
	ttfb: number | null;
	/** The server's own time within TTFB, from its Server-Timing header: the rest is the way there. */
	server: number | null;
}

/** One row per route and device, the most measured first. */
export function vitalRows(counts: VitalCount[]): VitalRow[] {
	const groups = new Map<string, { route: string; device: Device; byMetric: Record<Metric, { bucket: number; count: number }[]> }>();
	for (const count of counts) {
		const key = `${count.route} ${count.device}`;
		const group = groups.get(key) ?? { route: count.route, device: count.device, byMetric: { lcp: [], inp: [], ttfb: [], server: [] } };
		group.byMetric[count.metric].push(count);
		groups.set(key, group);
	}
	return [...groups.values()]
		.map(({ route, device, byMetric }) => ({
			route,
			device,
			loads: byMetric.lcp.reduce((sum, each) => sum + each.count, 0),
			lcp: p75(byMetric.lcp),
			inp: p75(byMetric.inp),
			ttfb: p75(byMetric.ttfb),
			server: p75(byMetric.server)
		}))
		.sort((a, b) => b.loads - a.loads || a.route.localeCompare(b.route) || a.device.localeCompare(b.device));
}

/**
 * INP from the slowest interactions as the browser does it: the slowest, but with one in every
 * 50 left out, so a single hiccup on a long visit doesn't stand for the whole page.
 */
export function inpOf(durations: number[]): number | null {
	if (!durations.length) return null;
	const sorted = [...durations].sort((a, b) => b - a);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))];
}

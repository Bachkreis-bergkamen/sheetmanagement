/**
 * The small globe on a trip's page (#334): the earth seen from space over where the trip goes,
 * with a pin in each place. The orthographic projection by hand, so the app needs no map
 * library: points on the far side are hidden, and land cut by the horizon follows its edge.
 */

/** [longitude, latitude] in degrees. */
export type LonLat = [number, number];

const RAD = Math.PI / 180;

export interface View {
	/** The point in the middle of the globe. */
	center: LonLat;
	/** The globe's radius, and its middle, in the drawing's units. */
	r: number;
	cx: number;
	cy: number;
}

/** How far a point faces the viewer: 1 in the middle, 0 on the edge, below 0 on the far side. */
export function facing([lon, lat]: LonLat, { center }: Pick<View, 'center'>): number {
	const [l0, p0] = [center[0] * RAD, center[1] * RAD];
	const [l, p] = [lon * RAD, lat * RAD];
	return Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0);
}

/** Where a point is drawn; on the far side it lands behind the near side, so check facing() first. */
export function project([lon, lat]: LonLat, { center, r, cx, cy }: View): [number, number] {
	const [l0, p0] = [center[0] * RAD, center[1] * RAD];
	const [l, p] = [lon * RAD, lat * RAD];
	const x = Math.cos(p) * Math.sin(l - l0);
	const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0);
	return [cx + r * x, cy - r * y];
}

const round = (n: number) => Math.round(n * 10) / 10;
const point = ([x, y]: [number, number]) => `${round(x)} ${round(y)}`;

/** Where the line from a to b crosses the edge, put exactly on it. */
function edge(a: LonLat, b: LonLat, view: View): [number, number] {
	const fa = facing(a, view);
	const fb = facing(b, view);
	const t = fa / (fa - fb);
	const [x, y] = project([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], view);
	const angle = Math.atan2(y - view.cy, x - view.cx);
	return [view.cx + view.r * Math.cos(angle), view.cy + view.r * Math.sin(angle)];
}

/** Along the edge from one point to another, the short way round. */
function alongEdge(from: [number, number], to: [number, number], { r, cx, cy }: View): string {
	const a = Math.atan2(from[1] - cy, from[0] - cx);
	const b = Math.atan2(to[1] - cy, to[0] - cx);
	let turn = b - a;
	while (turn <= -Math.PI) turn += 2 * Math.PI;
	while (turn > Math.PI) turn -= 2 * Math.PI;
	return `A${round(r)} ${round(r)} 0 0 ${turn > 0 ? 1 : 0} ${point(to)}`;
}

/** An area (a ring of points) as an SVG path, cut at the edge; empty when it's all on the far side. */
export function areaPath(ring: LonLat[], view: View): string {
	const n = ring.length;
	const start = ring.findIndex((p) => facing(p, view) > 0);
	if (start < 0) return '';
	let d = `M${point(project(ring[start], view))}`;
	let left: [number, number] | null = null;
	for (let k = 1; k <= n; k++) {
		const a = ring[(start + k - 1) % n];
		const b = ring[(start + k) % n];
		const seenA = facing(a, view) > 0;
		const seenB = facing(b, view) > 0;
		if (seenA && seenB) d += `L${point(project(b, view))}`;
		else if (seenA && !seenB) {
			left = edge(a, b, view);
			d += `L${point(left)}`;
		} else if (!seenA && seenB) {
			const back = edge(b, a, view);
			d += left ? alongEdge(left, back, view) : `L${point(back)}`;
			d += `L${point(project(b, view))}`;
			left = null;
		}
	}
	return `${d}Z`;
}

/** A line (points in order) as an SVG path, only its parts on the near side. */
export function linePath(line: LonLat[], view: View): string {
	let d = '';
	let drawing = false;
	for (const [i, p] of line.entries()) {
		if (facing(p, view) <= 0) {
			drawing = false;
			continue;
		}
		d += `${drawing && i ? 'L' : 'M'}${point(project(p, view))}`;
		drawing = true;
	}
	return d;
}

/** The grid of meridians and parallels every 30 degrees, as lines. */
export function graticule(step = 30): LonLat[][] {
	const lines: LonLat[][] = [];
	for (let lon = -180; lon < 180; lon += step) lines.push(Array.from({ length: 33 }, (_, i): LonLat => [lon, -80 + i * 5]));
	for (let lat = -60; lat <= 60; lat += step) lines.push(Array.from({ length: 73 }, (_, i): LonLat => [-180 + i * 5, lat]));
	return lines;
}

const vector = ([lon, lat]: LonLat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const lonLat = ([x, y, z]: number[]): LonLat => [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];

/** The shortest way between two places over the earth, as points: the route between stops. */
export function greatCircle(a: LonLat, b: LonLat, steps = 32): LonLat[] {
	const [va, vb] = [vector(a), vector(b)];
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps;
		return lonLat(va.map((value, k) => value * (1 - t) + vb[k] * t));
	});
}

/** The middle of some places, to turn the globe to. */
export function middle(points: LonLat[]): LonLat {
	if (!points.length) return [10, 50];
	const sum = points.map(vector).reduce((acc, v) => acc.map((value, k) => value + v[k]), [0, 0, 0]);
	return lonLat(sum);
}

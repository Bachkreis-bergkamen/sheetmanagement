import type { InstrumentFamily } from '#lib/config/types.ts';

/**
 * The orchestra's seating as a small layout engine: sections, not fixed coordinates. Players sit
 * on slightly flattened half rings around the conductor; the strings fill the front rings in
 * wedges as wide as their section, the winds, brass, percussion and a choir fill the rings
 * behind them from the middle out, harp and keyboards on the left flank, the basses on the
 * right. Each ring holds as many chairs as fit at a seat's distance, so more players mean more
 * or wider rings and fewer mean a smaller orchestra, never empty chairs or reserved gaps.
 *
 * Units: one seat's pitch is 1; the conductor stands at (0, 0); x runs right, y down (the
 * orchestra lies above the conductor, at negative y), as the screen draws it.
 */

/** Where a section sits: the strings' ring, a flank, one of the bands behind, or out front. */
export type Zone = 'strings' | 'left' | 'right' | 'winds' | 'brass' | 'percussion' | 'choir' | 'front';

/**
 * A section's spot: its zone, the row within it (winds: 0 flutes and oboes, 1 clarinets and
 * bassoons, 2 saxophones) and its order from left to right (on a flank: from the outside in).
 */
export interface Placement {
	zone: Zone;
	band: number;
	order: number;
}

export type SeatingFamily = InstrumentFamily;

export interface SeatingSection {
	/** "Geige:1" for a numbered violin section, else the instrument. */
	id: string;
	instrument: string;
	family: SeatingFamily;
	/** How many play it. */
	players: number;
	/** Under the section: "Vl 1", "Fl". */
	label: string;
	/** On hover and for screen readers: "Geige 1", "Flöte 1 & 2". */
	title: string;
	/** Written for, but no part to play from: at least one of its chairs. */
	warn?: boolean;
	/**
	 * Chair by chair, for a section of numbered parts ("Klarinette 1 & 2"): which chair has no
	 * part, and what it plays. Without it every chair follows `warn` and `title`.
	 */
	chairs?: { warn: boolean; title: string }[];
}

/** A different spot for a section, by its id or its instrument: a concert's or an orchestra's own way. */
export type SeatingOverrides = Record<string, Partial<Placement>>;

export interface Seat {
	id: string;
	section: string;
	family: SeatingFamily;
	x: number;
	y: number;
	warn: boolean;
	solo: boolean;
	title: string;
}

export interface SeatLabel {
	section: string;
	text: string;
	family: SeatingFamily;
	warn: boolean;
	/** The label's centre and size. */
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A half ring behind which nothing sits: drawn as the seating zones, back to front. */
export interface SeatingZone {
	r: number;
	kind: Zone | 'flank';
}

export interface SeatingPlan {
	seats: Seat[];
	labels: SeatLabel[];
	zones: SeatingZone[];
	/** Rings with chairs on them, strings included. */
	rows: number;
	/** What to draw: x, y of the top left, width and height. */
	box: { x: number; y: number; w: number; h: number };
	/** The flattening of the rings: depth over width. */
	flat: number;
}

/** The usual spots, by section id or instrument; anything else goes by its family. */
const PLACES: Record<string, Placement> = {
	'Geige:1': { zone: 'strings', band: 0, order: 0 },
	Geige: { zone: 'strings', band: 0, order: 0.5 },
	'Geige:2': { zone: 'strings', band: 0, order: 1 },
	'Geige:3': { zone: 'strings', band: 0, order: 1.5 },
	Viola: { zone: 'strings', band: 0, order: 2 },
	Violoncello: { zone: 'strings', band: 0, order: 3 },
	Kontrabass: { zone: 'right', band: 0, order: 0 },
	'E-Bass': { zone: 'right', band: 0, order: 1 },
	// The front wind row: piccolo outside the flutes, cor anglais outside the oboes.
	Piccolo: { zone: 'winds', band: 0, order: 0 },
	Blockflöte: { zone: 'winds', band: 0, order: 0.5 },
	'Tenor-Blockflöte': { zone: 'winds', band: 0, order: 0.6 },
	Flöte: { zone: 'winds', band: 0, order: 1 },
	Oboe: { zone: 'winds', band: 0, order: 2 },
	Englischhorn: { zone: 'winds', band: 0, order: 3 },
	// Behind them: clarinets left, bassoons right.
	Bassklarinette: { zone: 'winds', band: 1, order: 0 },
	Altklarinette: { zone: 'winds', band: 1, order: 0.5 },
	Klarinette: { zone: 'winds', band: 1, order: 1 },
	Holz: { zone: 'winds', band: 1, order: 1.5 },
	Fagott: { zone: 'winds', band: 1, order: 2 },
	Kontrafagott: { zone: 'winds', band: 1, order: 3 },
	// The saxophones, where there are any, in a row of their own.
	'Sopran-Saxophon': { zone: 'winds', band: 2, order: 0 },
	'Alt-Saxophon': { zone: 'winds', band: 2, order: 1 },
	Saxophon: { zone: 'winds', band: 2, order: 1.5 },
	'Tenor-Saxophon': { zone: 'winds', band: 2, order: 2 },
	'Bariton-Saxophon': { zone: 'winds', band: 2, order: 3 },
	// The brass: horns left (beside the bassoons when they share a row), then trumpets, trombones, tuba.
	Horn: { zone: 'brass', band: 0, order: 0 },
	Trompete: { zone: 'brass', band: 0, order: 1 },
	Blech: { zone: 'brass', band: 0, order: 1.5 },
	Posaune: { zone: 'brass', band: 0, order: 2 },
	Bassposaune: { zone: 'brass', band: 0, order: 3 },
	Bariton: { zone: 'brass', band: 0, order: 3.5 },
	Tuba: { zone: 'brass', band: 0, order: 4 },
	// Percussion at the back, the timpani nearest the middle.
	Pauke: { zone: 'percussion', band: 0, order: 0 },
	Schlagwerk: { zone: 'percussion', band: 0, order: 1 },
	Trommel: { zone: 'percussion', band: 0, order: 2 },
	'Bass Drum': { zone: 'percussion', band: 0, order: 3 },
	Drumset: { zone: 'percussion', band: 0, order: 3.5 },
	Becken: { zone: 'percussion', band: 0, order: 4 },
	Tamburin: { zone: 'percussion', band: 0, order: 5 },
	Tamtam: { zone: 'percussion', band: 0, order: 6 },
	Xylophon: { zone: 'percussion', band: 0, order: 7 },
	Glockenspiel: { zone: 'percussion', band: 0, order: 8 },
	Marimba: { zone: 'percussion', band: 0, order: 8.4 },
	Vibraphon: { zone: 'percussion', band: 0, order: 8.7 },
	'Mallet Percussion': { zone: 'percussion', band: 0, order: 9 },
	// The left flank, from the outside in: harp, then the keyboards.
	Harfe: { zone: 'left', band: 0, order: 0 },
	Klavier: { zone: 'left', band: 0, order: 1 },
	Cembalo: { zone: 'left', band: 0, order: 2 },
	Continuo: { zone: 'left', band: 0, order: 2 },
	Synthesizer: { zone: 'left', band: 0, order: 3 },
	Orgel: { zone: 'left', band: 0, order: 4 },
	Chor: { zone: 'choir', band: 0, order: 0 },
	Frauenchor: { zone: 'choir', band: 0, order: 0.5 },
	Männerchor: { zone: 'choir', band: 0, order: 1 },
	Sopran: { zone: 'front', band: 0, order: 0 },
	Alt: { zone: 'front', band: 0, order: 0.2 },
	Tenor: { zone: 'front', band: 0, order: 0.4 },
	Bassstimme: { zone: 'front', band: 0, order: 0.6 },
	Gesang: { zone: 'front', band: 0, order: 1 }
};

const BY_FAMILY: Record<SeatingFamily, Placement> = {
	streicher: { zone: 'strings', band: 0, order: 2.5 },
	holz: { zone: 'winds', band: 1, order: 5 },
	blech: { zone: 'brass', band: 0, order: 5 },
	schlagwerk: { zone: 'percussion', band: 0, order: 10 },
	tasten: { zone: 'left', band: 0, order: 5 },
	gesang: { zone: 'front', band: 0, order: 5 },
	partitur: { zone: 'winds', band: 2, order: 5 },
	sonstige: { zone: 'winds', band: 2, order: 5 }
};

export function placementOf(section: Pick<SeatingSection, 'id' | 'instrument' | 'family'>, overrides: SeatingOverrides = {}): Placement {
	const base = PLACES[section.id] ?? PLACES[section.instrument] ?? BY_FAMILY[section.family] ?? BY_FAMILY.sonstige;
	return { ...base, ...overrides[section.instrument], ...overrides[section.id] };
}

/** The bands behind the strings, front to back. */
const BANDS: Zone[] = ['winds', 'brass', 'percussion', 'choir'];
/** These may share the row in front when it has room: horns beside the bassoons, timpani beside the brass. */
const JOINS = new Set<Zone>(['brass', 'percussion']);

// The geometry, in seats.
const PITCH = 1;
const RING_GAP = 1.3;
/** Behind the strings the rows stand further apart: each section's label sits between them. */
const BAND_GAP = 1.75;
const FIRST_RING = 2.7;
const FLAT = 0.74;
const SECTION_GAP = 0.35;
const STRING_SPAN = 84;
const FLANK_OUTER = 86;
const FLANK_INNER = 50;
const MIDDLE_SPAN = 68;
/** A band shares the row in front only while that row stays this full. */
const COMFORT = 0.7;
export const MARKER = 0.37;
/** Soloists and singers beside the conductor, left and right in turn. */
const FRONT_SPOTS = [-50, 50, -72, 72, -30, 30, -84, 84];

const rad = (deg: number) => (deg * Math.PI) / 180;
const point = (r: number, deg: number) => ({ x: r * Math.sin(rad(deg)), y: -FLAT * r * Math.cos(rad(deg)) });

/** A ring of radius r, measured along its arc from the far left. */
interface Ring {
	r: number;
	/** Arc length from the left end to an angle. */
	at: (deg: number) => number;
	/** The angle at an arc length. */
	angle: (length: number) => number;
	/** The point at an arc length. */
	pos: (length: number) => { x: number; y: number };
}

const STEPS = 720;
const rings = new Map<number, Ring>();
function ring(r: number): Ring {
	const key = Math.round(r * 1000);
	const known = rings.get(key);
	if (known) return known;
	const lengths = [0];
	let previous = point(r, -90);
	for (let i = 1; i <= STEPS; i++) {
		const next = point(r, -90 + (180 * i) / STEPS);
		lengths.push(lengths[i - 1] + Math.hypot(next.x - previous.x, next.y - previous.y));
		previous = next;
	}
	const at = (deg: number) => {
		const f = ((deg + 90) / 180) * STEPS;
		const i = Math.min(STEPS - 1, Math.max(0, Math.floor(f)));
		return lengths[i] + (lengths[i + 1] - lengths[i]) * (f - i);
	};
	const angle = (length: number) => {
		let lo = 0;
		let hi = STEPS;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (lengths[mid] <= length) lo = mid;
			else hi = mid;
		}
		const part = lengths[hi] > lengths[lo] ? (length - lengths[lo]) / (lengths[hi] - lengths[lo]) : 0;
		return -90 + ((lo + Math.min(1, Math.max(0, part))) * 180) / STEPS;
	};
	const pos = (length: number) => point(r, angle(length));
	const made = { r, at, angle, pos };
	rings.set(key, made);
	return made;
}

/** Stand partners sit closer together than neighbouring stands. */
const PARTNER = 0.95;
const STAND = 1.3;
/** Between two string sections, along the front row. */
const AISLE = 0.55;

/**
 * A string section by rows, front first: two share a stand, one stand in each of the first two
 * rows, two stands in every row from the third on.
 */
export function standRows(players: number): number[] {
	const rows: number[] = [];
	for (let left = players, row = 0; left > 0; row++) {
		const take = Math.min(left, row < 2 ? 2 : 4);
		rows.push(take);
		left -= take;
	}
	return rows;
}

/** Where each chair of a row sits along it, from its first: partners close, stands apart. */
const standOffsets = (count: number) => {
	const offsets: number[] = [];
	for (let m = 0, at = 0; m < count; m++) {
		offsets.push(at);
		at += m % 2 === 0 ? PARTNER : STAND;
	}
	return offsets;
};
const rowWidth = (count: number) => (count ? standOffsets(count)[count - 1] : 0) + PITCH;

/**
 * The string sections' wedges, left to right, each as wide as its widest row needs. When they
 * don't fit into the half ring, the front row moves back until they do; when there's room to
 * spare, the aisles widen a little and the strings sit centred.
 */
function planStrings(rows: number[][]): { front: number; wedges: [number, number][] } {
	for (let front = FIRST_RING; ; front += 0.2) {
		let from = -STRING_SPAN;
		const wedges: [number, number][] = [];
		rows.forEach((counts, j) => {
			if (j > 0) {
				const first = ring(front);
				from = first.angle(first.at(from) + AISLE);
			}
			let to = from;
			counts.forEach((count, row) => {
				const arc = ring(front + row * RING_GAP);
				to = Math.max(to, arc.angle(arc.at(from) + rowWidth(count)));
			});
			wedges.push([from, to]);
			from = to;
		});
		if (from <= STRING_SPAN || front > 14) {
			const spare = STRING_SPAN - from;
			const extra = wedges.length > 1 ? Math.max(0, Math.min(10, spare / (wedges.length + 1))) : 0;
			const shift = (spare - extra * (wedges.length - 1)) / 2;
			return { front, wedges: wedges.map(([a, b], j) => [a + shift + j * extra, b + shift + j * extra]) };
		}
	}
}

interface Placed {
	section: SeatingSection;
	placement: Placement;
}

interface Chunk {
	item: Placed;
	players: number;
}

const width = (chunks: Chunk[]) => chunks.reduce((sum, chunk) => sum + chunk.players * PITCH, 0) + Math.max(0, chunks.length - 1) * SECTION_GAP;

export interface LayoutOptions {
	overrides?: SeatingOverrides;
	/** The labels' height, in seats: larger when the plan is drawn small. */
	labelSize?: number;
}

/** Lays out the sections: every player a chair, sections together, nothing on top of anything else. */
export function layoutSeating(sections: SeatingSection[], options: LayoutOptions = {}): SeatingPlan {
	const items: Placed[] = sections
		.filter((section) => section.players > 0)
		.map((section) => ({ section, placement: placementOf(section, options.overrides) }))
		.sort((a, b) => a.placement.order - b.placement.order);
	const of = (zone: Zone) => items.filter((item) => item.placement.zone === zone);
	const seats: Seat[] = [];
	const seat = (item: Placed, index: number, at: { x: number; y: number }) =>
		seats.push({
			id: `${item.section.id}#${index}`,
			section: item.section.id,
			family: item.section.family,
			x: at.x,
			y: at.y,
			warn: item.section.chairs ? !!item.section.chairs[index]?.warn : !!item.section.warn,
			solo: item.placement.zone === 'front',
			title: item.section.chairs?.[index]?.title ?? item.section.title
		});

	// The strings: stand by stand, each section in its wedge, rows centred in it.
	const strings = of('strings');
	const fills = strings.map((item) => standRows(item.section.players));
	const { front, wedges } = planStrings(fills);
	const stringRadius = (row: number) => front + row * RING_GAP;
	strings.forEach((item, i) => {
		let index = 0;
		fills[i].forEach((count, row) => {
			const arc = ring(stringRadius(row));
			const middle = (arc.at(wedges[i][0]) + arc.at(wedges[i][1])) / 2;
			const offsets = standOffsets(count);
			const start = middle - offsets[count - 1] / 2;
			for (const offset of offsets) seat(item, index++, arc.pos(start + offset));
		});
	});
	const stringRows = Math.max(0, ...fills.map((rows) => rows.length));
	/** The rings behind the strings; with no strings the first one is the strings' first ring. */
	const base = stringRows ? stringRadius(stringRows - 1) : FIRST_RING - BAND_GAP;
	const radius = (k: number) => base + (k + 1) * BAND_GAP;

	// The flanks, from the outside in, ring by ring: how far in each reaches on each ring.
	const reach = new Map<number, { left: number; right: number }>();
	const edges = (k: number) => {
		const arc = ring(radius(k));
		return reach.get(k) ?? { left: arc.at(-MIDDLE_SPAN), right: arc.at(MIDDLE_SPAN) };
	};
	for (const side of ['left', 'right'] as const) {
		const away = side === 'left' ? 1 : -1;
		let k = 0;
		let arc = ring(radius(k));
		let cursor = arc.at(side === 'left' ? -FLANK_OUTER : FLANK_OUTER);
		let used = false;
		const limit = () => arc.at(side === 'left' ? -FLANK_INNER : FLANK_INNER);
		const mark = () => {
			const edge = edges(k);
			const inner = cursor + away * PITCH * 0.5;
			reach.set(k, side === 'left' ? { ...edge, left: Math.max(edge.left, inner) } : { ...edge, right: Math.min(edge.right, inner) });
		};
		of(side).forEach((item, s) => {
			if (s > 0 && used) cursor += away * SECTION_GAP;
			for (let m = 0; m < item.section.players; m++) {
				const next = cursor + away * PITCH * 0.5;
				if (used && (side === 'left' ? next > limit() : next < limit())) {
					k++;
					arc = ring(radius(k));
					cursor = arc.at(side === 'left' ? -FLANK_OUTER : FLANK_OUTER);
				}
				seat(item, m, arc.pos(cursor + away * PITCH * 0.5));
				cursor += away * PITCH;
				used = true;
				mark();
			}
		});
	}

	// The bands behind the strings, ring by ring from the middle out.
	const available = (k: number) => {
		const { left, right } = edges(k);
		return right - left - (reach.has(k) ? PITCH * 0.4 : 0);
	};
	const middle: { chunks: Chunk[]; zones: Set<Zone> }[] = [];
	let k = -1;
	for (const zone of BANDS) {
		const bands = [...new Set(of(zone).map((item) => item.placement.band))].sort((a, b) => a - b);
		for (const band of bands) {
			let queue: Chunk[] = of(zone)
				.filter((item) => item.placement.band === band)
				.map((item) => ({ item, players: item.section.players }));
			const last = middle[k];
			if (last && JOINS.has(zone) && !last.zones.has(zone) && width([...last.chunks, ...queue]) <= available(k) * COMFORT) {
				last.chunks.push(...queue);
				last.zones.add(zone);
				continue;
			}
			while (queue.length) {
				k++;
				const room = available(k);
				const chunks: Chunk[] = [];
				while (queue.length) {
					const next = queue[0];
					const free = room - width(chunks) - (chunks.length ? SECTION_GAP : 0);
					if (next.players * PITCH <= free + 1e-9) {
						chunks.push(queue.shift()!);
						continue;
					}
					// A section longer than the row: as many as fit here, the rest right behind.
					const fit = Math.floor(free / PITCH + 1e-9);
					if (!chunks.length || fit >= Math.ceil(next.players / 2)) {
						const here = Math.max(1, fit);
						chunks.push({ item: next.item, players: here });
						queue = [{ item: next.item, players: next.players - here }, ...queue.slice(1)];
					}
					break;
				}
				middle[k] = { chunks, zones: new Set([zone]) };
				queue = queue.filter((chunk) => chunk.players > 0);
			}
		}
	}
	const counted = new Map<string, number>();
	middle.forEach(({ chunks, zones }, k) => {
		const arc = ring(radius(k));
		const { left, right } = edges(k);
		const span = width(chunks);
		// Percussion on its own leans right; everything else centres on the conductor.
		const centre = arc.at(zones.size === 1 && zones.has('percussion') ? 14 : 0);
		const start = Math.min(right - span, Math.max(left, centre - span / 2));
		let cursor = start;
		chunks.forEach((chunk, c) => {
			if (c > 0) cursor += SECTION_GAP;
			for (let m = 0; m < chunk.players; m++) {
				const index = counted.get(chunk.item.section.id) ?? 0;
				counted.set(chunk.item.section.id, index + 1);
				seat(chunk.item, index, arc.pos(cursor + PITCH * 0.5));
				cursor += PITCH;
			}
		});
	});

	// Soloists and singers beside the conductor, in front of the strings.
	const frontRadius = Math.max(1.3, FIRST_RING - RING_GAP);
	let spot = 0;
	for (const item of of('front')) {
		for (let m = 0; m < item.section.players; m++) {
			const deg = FRONT_SPOTS[spot % FRONT_SPOTS.length];
			const r = frontRadius - Math.floor(spot / FRONT_SPOTS.length) * 0.6;
			seat(item, m, point(Math.max(0.9, r), deg));
			spot++;
		}
	}

	const ringsUsed = Math.max(middle.length, ...[...reach.keys()].map((n) => n + 1), 0);
	// The zones: the strings' rings, then each run of rings of one kind.
	const zones: SeatingZone[] = [];
	if (stringRows) zones.push({ r: base + BAND_GAP / 2, kind: 'strings' });
	for (let n = 0; n < ringsUsed; n++) {
		const kind: SeatingZone['kind'] = middle[n]?.chunks[0]?.item.placement.zone ?? 'flank';
		const previous = zones[zones.length - 1];
		if (previous && previous.kind === kind) previous.r = radius(n) + BAND_GAP / 2;
		else zones.push({ r: radius(n) + BAND_GAP / 2, kind });
	}

	const labels = placeLabels(items, seats, options.labelSize ?? 0.36);
	const outer = Math.max(FIRST_RING, ...zones.map((zone) => zone.r));
	const xs = [-outer, outer, ...seats.flatMap((s) => [s.x - MARKER, s.x + MARKER]), ...labels.flatMap((l) => [l.x - l.w / 2, l.x + l.w / 2])];
	const ys = [-FLAT * outer, 1.15, ...seats.flatMap((s) => [s.y - MARKER, s.y + MARKER]), ...labels.flatMap((l) => [l.y - l.h / 2, l.y + l.h / 2])];
	const pad = 0.25;
	const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: 0, h: 0 };
	box.w = Math.max(...xs) + pad - box.x;
	box.h = Math.max(...ys) + pad - box.y;
	return { seats, labels, zones: zones.reverse(), rows: stringRows + ringsUsed, box, flat: FLAT };
}

/** A label's width for its text: the abbreviations are short, a few characters of a small font. */
const labelWidth = (text: string, h: number) => text.length * 0.6 * h + h * 0.7;

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
	Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

/** Hits a chair: the label's box comes within a marker of a seat's centre. */
const hitsSeat = (label: { x: number; y: number; w: number; h: number }, seat: Seat) => {
	const dx = Math.max(0, Math.abs(seat.x - label.x) - label.w / 2);
	const dy = Math.max(0, Math.abs(seat.y - label.y) - label.h / 2);
	return Math.hypot(dx, dy) < MARKER + 0.02;
};

/**
 * One label per section, in front of the middle chair of its front row (towards the conductor),
 * else under it; where that's taken, above it,
 * then beside it, so no label covers a chair or another label.
 */
function placeLabels(items: Placed[], seats: Seat[], h: number): SeatLabel[] {
	const labels: SeatLabel[] = [];
	const conductor = { x: 0, y: 0, w: 2 * 0.46, h: 2 * 0.46 };
	for (const { section } of items) {
		const own = seats.filter((each) => each.section === section.id);
		if (!own.length) continue;
		// The front row: the chairs nearest the conductor, measured along the flattened rings.
		const reachOf = (each: Seat) => Math.hypot(each.x, each.y / FLAT);
		const front = Math.min(...own.map(reachOf));
		const row = own.filter((each) => reachOf(each) < front + 0.6).sort((a, b) => Math.atan2(a.x, -a.y) - Math.atan2(b.x, -b.y));
		const anchor = row[Math.floor((row.length - 1) / 2)];
		const w = labelWidth(section.label, h);
		const below = MARKER + 0.06 + h / 2;
		// Towards the conductor from the middle chair: in front of its own section on any side of
		// the half ring, where "below" alone would drift into a neighbour at the flanks.
		const toward = Math.hypot(anchor.x, anchor.y) || 1;
		const [dx, dy] = [-anchor.x / toward, -anchor.y / toward];
		const reachIn = MARKER + 0.08 + Math.abs(dx) * (w / 2) + Math.abs(dy) * (h / 2);
		const candidates = [
			{ x: anchor.x + dx * reachIn, y: anchor.y + dy * reachIn },
			{ x: anchor.x, y: anchor.y + below },
			{ x: anchor.x - w / 3, y: anchor.y + below },
			{ x: anchor.x + w / 3, y: anchor.y + below },
			{ x: anchor.x, y: Math.min(...own.map((each) => each.y)) - below },
			{ x: anchor.x - MARKER - 0.06 - w / 2, y: anchor.y },
			{ x: anchor.x + MARKER + 0.06 + w / 2, y: anchor.y }
		].map((spot) => ({ ...spot, w, h }));
		const free = candidates.find((box) => !seats.some((each) => hitsSeat(box, each)) && !labels.some((other) => overlaps(box, other)) && !overlaps(box, conductor));
		const box = free ?? candidates[0];
		labels.push({ section: section.id, text: section.label, family: section.family, warn: !!section.warn, ...box });
	}
	return labels;
}

/** The string sections' sizes when nothing says otherwise: first and second violins, violas, cellos, basses. */
const STRING_ESTIMATES: [number, number[]][] = [
	[3, [4, 3, 2, 2, 1]],
	[10, [6, 5, 4, 3, 2]],
	[18, [8, 7, 5, 5, 3]],
	[Infinity, [12, 10, 8, 7, 5]]
];
/** A choir behind the orchestra, when the Besetzung names one. */
const CHOIR_ESTIMATE = 16;
const SINGERS = new Set(['Sopran', 'Gesang']);

export interface BesetzungVoice {
	instrument: string;
	numbers: number[];
	/** A soloist from the Besetzung ("Solo Geige"): out front, like one with a solo part. */
	solo?: boolean;
}

export interface FromBesetzung {
	voices: BesetzungVoice[];
	missing: BesetzungVoice[];
	/** Instruments with a solo part: out front beside the conductor. */
	soloists?: string[];
	familyOf: (instrument: string) => SeatingFamily | undefined;
	abbr: (instrument: string) => string;
	title: (voice: BesetzungVoice) => string;
	soloLabel: string;
	/** How many play a section, by its id or instrument, where the estimate isn't right. */
	counts?: Record<string, number>;
}

/**
 * The sections a Besetzung needs, with estimated players: a wind or brass part is one player,
 * the strings as many as an orchestra of that size usually has, so a piece for flutes, oboes and
 * strings sits as a chamber orchestra and one with triple winds and four horns as a symphony.
 */
export function sectionsFromBesetzung(input: FromBesetzung): SeatingSection[] {
	const { missing, familyOf, abbr, title } = input;
	const voices = input.voices.filter((voice) => !voice.solo);
	const family = (instrument: string): SeatingFamily => familyOf(instrument) ?? 'sonstige';
	const warns = (voice: BesetzungVoice) => {
		const gap = missing.find((each) => each.instrument === voice.instrument && !each.solo);
		return !!gap && (!gap.numbers.length || !voice.numbers.length || voice.numbers.some((n) => gap.numbers.includes(n)));
	};
	const winds = voices
		.filter((voice) => family(voice.instrument) === 'holz' || family(voice.instrument) === 'blech')
		.reduce((sum, voice) => sum + Math.max(1, voice.numbers.length), 0);
	const strings = STRING_ESTIMATES.find(([upTo]) => winds <= upTo)![1];
	const solos = new Set([...(input.soloists ?? []), ...input.voices.filter((voice) => voice.solo).map((voice) => voice.instrument)]);
	const sections: SeatingSection[] = [];
	const add = (section: SeatingSection) => sections.push({ ...section, players: input.counts?.[section.id] ?? input.counts?.[section.instrument] ?? section.players });

	for (const voice of voices) {
		const kind = family(voice.instrument);
		const base = { instrument: voice.instrument, family: kind, label: abbr(voice.instrument), title: title(voice), warn: warns(voice) };
		if (voice.instrument === 'Geige' && voice.numbers.length) {
			// First and second violins (and any third) as sections of their own.
			for (const n of voice.numbers) {
				const one = { instrument: 'Geige', numbers: [n] };
				add({ ...base, id: `Geige:${n}`, label: `${abbr('Geige')} ${n}`, title: title(one), warn: warns(one), players: n === 1 ? strings[0] : strings[1] });
			}
			continue;
		}
		if (SINGERS.has(voice.instrument)) {
			if (!solos.has(voice.instrument)) add({ ...base, id: voice.instrument, players: Math.max(1, voice.numbers.length) });
			continue;
		}
		const players =
			voice.instrument === 'Geige'
				? strings[0] + strings[1]
				: voice.instrument === 'Viola'
					? strings[2]
					: voice.instrument === 'Violoncello'
						? strings[3]
						: voice.instrument === 'Kontrabass'
							? strings[4]
							: voice.instrument === 'Chor'
								? CHOIR_ESTIMATE
								: kind === 'streicher' && voice.instrument !== 'E-Bass'
									? strings[2]
									: Math.max(1, voice.numbers.length);
		// Numbered parts, one chair each: only the chair whose part is missing is ringed (#249).
		const chairs =
			voice.numbers.length > 1 && players === voice.numbers.length
				? voice.numbers.map((n) => {
						const one = { instrument: voice.instrument, numbers: [n] };
						return { warn: warns(one), title: title(one) };
					})
				: undefined;
		add({ ...base, id: voice.instrument, players, chairs });
	}
	// Soloists out front, each with a chair of their own.
	for (const instrument of solos) {
		sections.push({
			id: `solo:${instrument}`,
			instrument: SINGERS.has(instrument) ? instrument : 'Gesang',
			family: family(instrument),
			players: 1,
			label: SINGERS.has(instrument) ? abbr(instrument) : `${input.soloLabel} ${abbr(instrument)}`,
			title: `${input.soloLabel}: ${title({ instrument, numbers: [] })}`,
			warn: missing.some((each) => each.instrument === instrument && each.solo)
		});
	}
	return sections;
}

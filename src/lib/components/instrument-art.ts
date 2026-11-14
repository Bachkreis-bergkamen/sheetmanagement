import type { Glyph } from '#lib/music/instrument-glyph.ts';
import { gameIcons } from './game-icons.ts';

/**
 * The instrument drawings, on a 512 grid. Ours are put together from plain shapes: `draw` is
 * filled (a string) or stroked (a line with its width), `cut` takes away from it again (the head
 * of a drum, the f-holes of a cello), `over` comes after the cut (the sticks over a drumhead),
 * `turn` tilts the whole drawing and `size` scales it. Each shape is its own path, so overlapping shapes simply add up.
 */
export type Line = { d: string; w: number };
export type Mark = string | Line;
/** `size` draws it smaller (or larger) around the middle: a piccolo is a small flute. */
export type Art = { draw: Mark[]; cut?: Mark[]; over?: Mark[]; turn?: number; size?: number };

const r1 = (v: number) => Math.round(v * 10) / 10;
const points = (p: number[]) => {
	const out: string[] = [];
	for (let i = 0; i < p.length; i += 2) out.push(`${r1(p[i])} ${r1(p[i + 1])}`);
	return out;
};
const poly = (...p: number[]) => `M${points(p).join('L')}Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M${r1(cx - rx)} ${r1(cy)}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);
const box = (x: number, y: number, w: number, h: number, r = 0) => {
	r = Math.min(r, w / 2, h / 2);
	const a = (dx: number, dy: number) => (r ? `a${r} ${r} 0 0 1 ${dx} ${dy}` : '');
	return `M${x + r} ${y}h${w - 2 * r}${a(r, r)}v${h - 2 * r}${a(-r, r)}h${-(w - 2 * r)}${a(-r, -r)}v${-(h - 2 * r)}${a(r, -r)}Z`;
};
const line = (w: number, ...p: number[]): Line => ({
	d: `M${points(p).join('L')}`,
	w
});
const curve = (w: number, d: string): Line => ({ d, w });

/** A drum standing up: its top, its shell and its bottom edge. */
const cylinder = (cx: number, top: number, bottom: number, rx: number, ry: number) => [
	ellipse(cx, top, rx, ry),
	box(cx - rx, top, 2 * rx, bottom - top),
	ellipse(cx, bottom, rx, ry)
];

/** Where a quadratic bow from (x0, y) over `dip` to (x1, y) is at x. */
const bow = (x0: number, x1: number, y: number, dip: number, x: number) => {
	const t = (x - x0) / (x1 - x0);
	return y + 2 * dip * t * (1 - t);
};

const range = (from: number, to: number, step: number) => {
	const out: number[] = [];
	for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
	return out;
};

const gear = (cx: number, cy: number, inner: number, outer: number, teeth: number) =>
	poly(
		...range(0, teeth * 4 - 1, 1).flatMap((i) => {
			const a = (Math.PI * 2 * i) / (teeth * 4);
			const r = i % 4 < 2 ? outer : inner;
			return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
		})
	);

/** A rectangle of w × h, centred on (cx, cy) and turned by `a` radians. */
const turned = (cx: number, cy: number, w: number, h: number, a: number) => {
	const c = Math.cos(a);
	const s = Math.sin(a);
	const corner = (x: number, y: number) => [cx + x * c - y * s, cy + x * s + y * c];
	return poly(...corner(-w / 2, -h / 2), ...corner(w / 2, -h / 2), ...corner(w / 2, h / 2), ...corner(-w / 2, h / 2));
};

const snareSticks = [line(22, 120, 34, 290, 172), line(22, 392, 34, 222, 172)];

const snare: Art = {
	draw: [...cylinder(256, 210, 330, 170, 46), line(20, 256, 376, 256, 440), line(20, 256, 440, 172, 500), line(20, 256, 440, 340, 500)],
	cut: [
		ellipse(256, 210, 152, 30),
		curve(16, 'M86 246Q256 318 426 246'),
		curve(16, 'M86 302Q256 374 426 302'),
		...[130, 190, 256, 322, 382].map((x) => line(14, x, bow(86, 426, 246, 72, x) + 12, x, bow(86, 426, 302, 72, x) - 12))
	],
	over: snareSticks
};

const fieldDrum: Art = {
	draw: cylinder(256, 140, 420, 150, 38),
	cut: [
		ellipse(256, 140, 136, 26),
		curve(16, 'M106 178Q256 246 406 178'),
		curve(16, 'M106 384Q256 452 406 384'),
		line(14, ...range(122, 390, 34).flatMap((x, i) => [x, i % 2 ? bow(106, 406, 384, 68, x) - 14 : bow(106, 406, 178, 68, x) + 14]))
	],
	over: [line(22, 110, 30, 286, 150), line(22, 402, 30, 226, 150)]
};

const bassDrum: Art = {
	draw: [circle(256, 220, 192), line(26, 186, 396, 136, 500), line(26, 326, 396, 376, 500)],
	cut: [circle(256, 220, 158), ...range(0, 7, 1).map((i) => circle(256 + 176 * Math.cos((i * Math.PI) / 4), 220 + 176 * Math.sin((i * Math.PI) / 4), 9))],
	over: [circle(256, 220, 38), line(24, 300, 270, 470, 470), circle(300, 266, 34)]
};

const toms: Art = {
	draw: [
		...cylinder(160, 180, 290, 100, 30),
		...cylinder(372, 240, 380, 110, 32),
		line(22, 266, 300, 266, 490),
		line(20, 266, 440, 190, 496),
		line(20, 266, 440, 342, 496)
	],
	cut: [ellipse(160, 180, 88, 20), ellipse(372, 240, 96, 22), curve(14, 'M60 214Q160 262 260 214'), curve(14, 'M262 276Q372 326 482 276')]
};

const bongos: Art = {
	draw: [
		ellipse(170, 200, 92, 28),
		poly(78, 200, 262, 200, 232, 380, 108, 380),
		ellipse(170, 380, 62, 16),
		ellipse(354, 226, 76, 22),
		poly(278, 226, 430, 226, 404, 370, 304, 370),
		ellipse(354, 370, 50, 14),
		box(236, 274, 72, 40, 6)
	],
	cut: [ellipse(170, 200, 78, 16), ellipse(354, 226, 62, 12), curve(14, 'M82 240Q170 278 258 240'), curve(14, 'M282 262Q354 294 426 262')]
};

const congas: Art = {
	draw: [
		ellipse(170, 110, 82, 22),
		'M88 110C68 230 70 340 112 470L228 470C270 340 272 230 252 110Z',
		ellipse(360, 170, 72, 20),
		'M288 170C268 270 270 370 306 470L414 470C450 370 452 270 432 170Z'
	],
	cut: [
		ellipse(170, 110, 70, 13),
		ellipse(360, 170, 60, 12),
		curve(14, 'M84 200Q170 236 256 200'),
		curve(14, 'M82 380Q170 416 258 380'),
		curve(14, 'M278 250Q360 284 442 250'),
		curve(14, 'M282 400Q360 434 438 400')
	]
};

const djembe: Art = {
	draw: [ellipse(256, 100, 142, 34), 'M114 100C118 196 200 246 222 292L196 470L316 470L290 292C312 246 394 196 398 100Z', ellipse(256, 470, 72, 18)],
	cut: [
		ellipse(256, 100, 126, 22),
		line(14, 136, 146, 176, 236, 214, 146, 236, 262, 256, 150, 276, 262, 298, 146, 336, 236, 376, 146),
		line(14, 222, 300, 290, 300)
	]
};

/** A cymbal seen from the side at height y, its bell up or down. */
const cymbal = (y: number, up: boolean, half = 180, thick = 34) => {
	const s = up ? -1 : 1;
	return [
		`M${256 - half} ${y}C${256 - half / 2} ${y + s * thick} ${256 + half / 2} ${y + s * thick} ${256 + half} ${y}C${256 + half / 2} ${y + s * 10} ${256 - half / 2} ${y + s * 10} ${256 - half} ${y}Z`,
		ellipse(256, y + s * 26, half / 5, 15)
	];
};
const tripod = (top: number, rod: number): Mark[] => [line(20, 256, rod, 256, 440), line(20, 256, top, 150, 492), line(20, 256, top, 362, 492)];

const hiHat: Art = {
	draw: [...cymbal(146, true), ...cymbal(184, false), ...tripod(400, 70), box(214, 446, 84, 24, 8)]
};

const suspendedCymbal: Art = {
	draw: [...cymbal(170, true, 208, 50), ...tripod(400, 150)]
};

const clashCymbals: Art = {
	draw: [
		'M196 70C104 160 104 352 196 442C160 352 160 160 196 70Z',
		ellipse(118, 256, 22, 46),
		curve(20, 'M100 220C60 220 60 292 100 292'),
		'M316 70C408 160 408 352 316 442C352 352 352 160 316 70Z',
		ellipse(394, 256, 22, 46),
		curve(20, 'M412 220C452 220 452 292 412 292')
	],
	over: [
		line(16, 228, 150, 210, 110),
		line(16, 256, 140, 256, 96),
		line(16, 284, 150, 302, 110),
		line(16, 228, 362, 210, 402),
		line(16, 256, 372, 256, 416),
		line(16, 284, 362, 302, 402)
	]
};

const triangle: Art = {
	draw: [line(30, 256, 96, 92, 424, 420, 424, 284, 150), line(14, 256, 96, 256, 54), box(222, 26, 68, 32, 8)],
	over: [line(16, 300, 320, 476, 196)]
};

const cowbell: Art = {
	turn: -22,
	draw: [poly(204, 120, 308, 120, 382, 400, 130, 400), ellipse(256, 400, 126, 32), line(30, 256, 124, 256, 40)],
	cut: [ellipse(256, 398, 106, 19)],
	over: [line(22, 380, 196, 488, 120)]
};

const agogo: Art = {
	draw: [
		poly(154, 196, 196, 196, 238, 404, 112, 404),
		ellipse(175, 404, 63, 18),
		poly(316, 236, 352, 236, 388, 384, 280, 384),
		ellipse(334, 384, 54, 16),
		curve(26, 'M175 200C175 72 334 72 334 236'),
		line(26, 254, 110, 254, 30)
	],
	cut: [ellipse(175, 402, 50, 10), ellipse(334, 382, 41, 9)]
};

const anvil: Art = {
	draw: [
		'M40 150L360 150C420 150 456 132 484 104C474 180 424 214 360 214L334 214C304 236 300 280 334 316L360 330L360 380L144 380L144 330L172 316C206 280 202 236 172 214L112 214C72 214 40 190 40 150Z',
		poly(120, 392, 384, 392, 418, 446, 86, 446)
	]
};

const claves: Art = {
	draw: [line(56, 84, 214, 404, 110), line(56, 108, 338, 428, 290)],
	cut: [line(10, 136, 186, 352, 116), line(10, 160, 320, 376, 288)]
};

const woodBlock: Art = {
	draw: [box(70, 196, 372, 160, 28)],
	cut: [box(100, 228, 270, 20, 10), box(142, 324, 270, 20, 10)],
	over: [line(22, 336, 150, 456, 40), circle(326, 160, 28)]
};

const templeBlockSizes: [number, number, number][] = [
	[96, 300, 62],
	[224, 292, 54],
	[334, 284, 46],
	[430, 278, 38]
];
const templeBlocks: Art = {
	draw: [
		...templeBlockSizes.flatMap(([cx, cy, r]) => [circle(cx, cy, r), line(16, cx, cy + r, cx, 396)]),
		box(40, 392, 432, 24, 8),
		line(24, 256, 416, 256, 486),
		line(20, 176, 490, 336, 490)
	],
	cut: templeBlockSizes.map(([cx, cy, r]) => line(16, cx - r * 0.8, cy + r * 0.12, cx + r * 0.3, cy + r * 0.12))
};

const guiro: Art = {
	turn: -20,
	draw: [ellipse(256, 240, 212, 92)],
	cut: [
		...range(110, 380, 24).map((x) => {
			const dx = (x - 256) / 212;
			return line(10, x, 240 - 92 * Math.sqrt(1 - dx * dx) + 16, x, 262);
		}),
		circle(316, 290, 14),
		circle(364, 284, 11)
	],
	over: [line(18, 110, 404, 380, 380), line(32, 380, 380, 450, 374)]
};

const maracas: Art = {
	draw: [circle(166, 160, 94), line(34, 210, 240, 300, 474), circle(352, 196, 84), line(34, 318, 270, 226, 474)],
	cut: [curve(14, 'M92 138Q166 96 240 138'), curve(14, 'M92 190Q166 232 240 190'), curve(14, 'M286 176Q352 138 418 176'), curve(14, 'M286 222Q352 260 418 222')]
};

const shaker: Art = {
	turn: -30,
	draw: [box(70, 200, 372, 112, 56)],
	cut: [line(14, 140, 214, 140, 298), line(14, 372, 214, 372, 298), circle(200, 256, 10), circle(256, 256, 10), circle(312, 256, 10)],
	over: [curve(16, 'M58 160Q34 256 58 352'), curve(16, 'M454 160Q478 256 454 352')]
};

const rainStick: Art = {
	draw: [line(60, 72, 440, 440, 72), line(84, 66, 446, 92, 420), line(84, 420, 92, 446, 66)],
	cut: range(1, 8, 1).map((i) => {
		const t = i / 9;
		const side = i % 2 ? 10 : -10;
		return circle(72 + 368 * t + side, 440 - 368 * t + side, 8);
	})
};

const ratchet: Art = {
	draw: [gear(220, 334, 88, 112, 10), line(40, 220, 334, 220, 494), poly(150, 212, 472, 150, 478, 186, 176, 236)],
	cut: [circle(220, 334, 28)],
	over: [curve(20, 'M380 300A160 160 0 0 1 306 456'), line(20, 268, 446, 306, 456, 300, 418)]
};

const whip: Art = {
	draw: [poly(56, 430, 470, 334, 476, 366, 64, 460), poly(56, 430, 440, 172, 460, 198, 72, 454), circle(64, 444, 24)],
	over: [line(16, 474, 240, 500, 262), line(16, 482, 288, 508, 296)]
};

const vibraslap: Art = {
	draw: [circle(108, 122, 62), curve(22, 'M138 172C220 300 230 384 330 388'), line(44, 194, 262, 236, 336), box(316, 330, 160, 120, 24)],
	cut: [line(14, 350, 370, 442, 370), line(14, 350, 410, 442, 410)]
};

const flexatone: Art = {
	draw: [
		curve(22, 'M176 70L176 300Q176 340 256 340Q336 340 336 300L336 70'),
		box(204, 60, 104, 250, 10),
		curve(12, 'M176 210Q110 220 104 154'),
		circle(100, 132, 28),
		curve(12, 'M336 210Q402 220 408 154'),
		circle(412, 132, 28),
		line(40, 256, 340, 256, 494)
	],
	cut: [curve(14, 'M230 90C276 140 230 200 280 260')]
};

const bells = range(0, 6, 1).map((i) => {
	const a = Math.PI + (i * Math.PI) / 6;
	return [256 + 150 * Math.cos(a), 300 + 150 * Math.sin(a)] as const;
});
const sleighBells: Art = {
	draw: [curve(28, 'M106 300A150 150 0 0 1 406 300Q406 384 256 384Q106 384 106 300'), line(44, 256, 384, 256, 494), ...bells.map(([x, y]) => circle(x, y, 38))],
	cut: bells.flatMap(([x, y]) => [line(12, x - 22, y + 8, x + 22, y + 8), circle(x, y + 22, 6)])
};

const chimeTubes: [number, number][] = [
	[112, 200],
	[170, 250],
	[228, 290],
	[284, 290],
	[342, 250],
	[400, 200]
];
const windChimes: Art = {
	draw: [line(14, 256, 22, 256, 96), ellipse(256, 106, 172, 24), ...chimeTubes.flatMap(([x, l]) => [line(10, x, 112, x, 162), box(x - 15, 160, 30, l, 8)])]
};

const markTree: Art = {
	draw: [line(16, 256, 104, 256, 44), circle(256, 38, 16), box(48, 96, 416, 28, 10), ...range(0, 12, 1).map((i) => box(60 + i * 31, 124, 18, 340 - i * 20, 4))]
};

const brakeDrum: Art = {
	draw: cylinder(256, 200, 320, 180, 60),
	cut: [
		ellipse(256, 200, 70, 22),
		curve(14, ellipse(256, 200, 142, 46)),
		...range(0, 4, 1).map((i) => {
			const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
			return ellipse(256 + 106 * Math.cos(a), 200 + 34 * Math.sin(a), 10, 7);
		}),
		curve(14, 'M76 268Q256 388 436 268')
	]
};

const steelPan: Art = {
	draw: [...cylinder(256, 180, 250, 216, 84), line(22, 110, 300, 80, 490), line(22, 402, 300, 432, 490)],
	cut: [ellipse(256, 180, 196, 68)],
	over: [
		ellipse(256, 138, 44, 18),
		ellipse(170, 166, 38, 18),
		ellipse(342, 166, 38, 18),
		ellipse(206, 214, 40, 18),
		ellipse(306, 214, 40, 18),
		ellipse(106, 196, 26, 14),
		ellipse(406, 196, 26, 14)
	]
};

const tubularBells: Art = {
	draw: [
		box(48, 40, 416, 28, 8),
		line(24, 64, 54, 64, 474),
		line(24, 448, 54, 448, 474),
		line(24, 28, 482, 100, 482),
		line(24, 412, 482, 484, 482),
		...range(0, 6, 1).flatMap((i) => {
			const x = 120 + i * 45;
			return [line(10, x, 68, x, 104), box(x - 19, 100, 38, 18, 6), box(x - 15, 110, 30, 330 - i * 26, 6)];
		})
	]
};

const crotaleRows: [number, number][] = [
	...range(0, 6, 1).map((i) => [92 + i * 55, 300] as [number, number]),
	...[119, 174, 284, 339, 394].map((x) => [x, 206] as [number, number])
];
const crotales: Art = {
	draw: [
		...crotaleRows.map(([x, y]) => circle(x, y, 26)),
		box(56, 334, 400, 18, 6),
		box(84, 238, 344, 16, 6),
		line(22, 100, 348, 80, 490),
		line(22, 412, 348, 432, 490)
	],
	cut: crotaleRows.map(([x, y]) => circle(x, y, 8))
};

const vibraphone: Art = {
	draw: [
		...range(0, 7, 1).flatMap((i) => {
			const x = 48 + i * 54;
			return [box(x, 92, 40, 150 - i * 8, 6), box(x + 8, 262, 24, 150 - i * 10, 12)];
		}),
		line(20, 36, 252, 476, 252),
		line(24, 60, 252, 60, 466),
		line(24, 452, 252, 452, 466),
		circle(60, 478, 16),
		circle(452, 478, 16),
		line(16, 256, 430, 256, 470),
		box(216, 464, 80, 20, 6)
	]
};

const glockenspiel: Art = {
	draw: [box(36, 140, 440, 280, 28)],
	cut: [box(62, 166, 388, 228, 14)],
	over: range(0, 8, 1).map((i) => box(82 + i * 41, 178 + i * 7, 30, 204 - i * 14, 4))
};

// A tambourine seen a little from above: the head, the frame and the jingles in their slots.
const rimAt = (x: number) => 216 + 116 * Math.sqrt(1 - ((x - 256) / 210) ** 2);
const jingles = [104, 180, 256, 332, 408].map((x) => [x, rimAt(x) + 32] as const);
const tambourine: Art = {
	draw: [...cylinder(256, 216, 280, 210, 116)],
	cut: [curve(14, ellipse(256, 216, 190, 100)), ...jingles.map(([x, y]) => box(x - 24, y - 16, 48, 32, 8))],
	over: jingles.map(([x, y]) => circle(x, y, 11))
};

// A pair of castanets from the front: two pear-shaped shells, the cord through their ears.
const shell = (cx: number, top: number, k: number) => {
	const p = (x: number, y: number) => `${r1(cx + (x - 256) * k)} ${r1(top + (y - 120) * k)}`;
	return `M${p(256, 120)}C${p(300, 120)} ${p(310, 170)} ${p(330, 200)}C${p(400, 230)} ${p(430, 290)} ${p(420, 350)}C${p(400, 450)} ${p(112, 450)} ${p(92, 350)}C${p(82, 290)} ${p(112, 230)} ${p(182, 200)}C${p(202, 170)} ${p(212, 120)} ${p(256, 120)}Z`;
};
const castanets: Art = {
	draw: [shell(148, 170, 0.66), shell(364, 190, 0.66)],
	cut: [circle(148, 196, 9), circle(364, 216, 9), curve(12, 'M76 330Q148 380 220 330'), curve(12, 'M292 350Q364 400 436 350')],
	over: [curve(12, 'M148 186C160 100 352 110 364 206')]
};

const cajon: Art = {
	draw: [poly(120, 122, 330, 122, 330, 488, 120, 488), poly(128, 110, 338, 110, 406, 60, 196, 60), poly(342, 118, 412, 70, 412, 440, 342, 488)],
	cut: [ellipse(377, 270, 20, 40), circle(142, 144, 8), circle(308, 144, 8), circle(142, 466, 8), circle(308, 466, 8)]
};

const timpani: Art = {
	draw: [
		'M256 112c-99.4 0-180 21.5-180 48s80.6 48 180 48s180-21.5 180-48s-80.6-48-180-48m0 20c86.2 0 150 15.7 150 28s-63.8 28-150 28s-150-15.7-150-28s63.8-28 150-28M78 196c22 22 98 36 178 36s156-14 178-36c-2 92-62 170-178 172c-116-2-176-80-178-172M100 196v44h14v-44zM176 214v40h14v-40zM322 214v40h14v-40zM398 196v44h14v-44zM246 364h20v62h-20zM236 392l14 12l-84 72l-14-12zM276 392l84 72l-14 12l-84-72zM136 466h40v14h-40zM336 466h40v14h-40zM222 434h68l12 42h-92z'
	]
};

// Strings: a cello with round shoulders, a double bass with sloping ones, both on an endpin.
const cello: Art = {
	draw: [
		'M256 168C200 168 166 196 166 246C166 286 200 296 200 318C200 340 154 348 154 396C154 452 200 480 256 480C312 480 358 452 358 396C358 348 312 340 312 318C312 296 346 286 346 246C346 196 312 168 256 168Z',
		box(244, 70, 24, 110, 4),
		circle(256, 52, 24),
		box(236, 66, 40, 40, 8),
		line(18, 256, 478, 256, 506)
	],
	cut: [
		curve(14, 'M214 300C198 322 230 346 212 370'),
		curve(14, 'M298 300C314 322 282 346 300 370'),
		line(16, 222, 360, 290, 360),
		line(8, 248, 182, 248, 352),
		line(8, 264, 182, 264, 352)
	]
};

const contrabass: Art = {
	draw: [
		'M240 132C198 158 168 198 170 250C172 290 200 296 200 316C200 338 146 350 146 402C146 456 196 476 256 476C316 476 366 456 366 402C366 350 312 338 312 316C312 296 340 290 342 250C344 198 314 158 272 132Z',
		box(245, 44, 22, 100, 4),
		circle(256, 30, 20),
		box(238, 40, 36, 38, 8),
		line(16, 256, 474, 256, 506)
	],
	cut: [
		curve(14, 'M210 300C194 324 228 350 208 378'),
		curve(14, 'M302 300C318 324 284 350 304 378'),
		line(16, 220, 368, 292, 368),
		line(8, 249, 150, 249, 360),
		line(8, 263, 150, 263, 360)
	]
};

const electricBass: Art = {
	turn: 35,
	draw: [
		'M236 300C220 270 190 262 178 290C168 312 196 330 186 360C172 395 160 420 180 455C205 495 300 495 330 460C350 430 330 400 322 375C316 352 340 330 330 300C322 278 296 280 280 300Z',
		box(244, 60, 24, 260, 4),
		box(236, 14, 40, 70, 12),
		circle(288, 24, 10),
		circle(288, 50, 10),
		circle(224, 24, 10),
		circle(224, 50, 10)
	],
	cut: [box(232, 372, 48, 16, 4), box(236, 432, 40, 14, 4)]
};

const harpNeck: [number, number, number, number, number, number, number, number][] = [
	[110, 84, 190, 48, 236, 150, 306, 128],
	[306, 128, 362, 110, 392, 72, 424, 108]
];
const neckY = (x: number) => {
	let best = { dx: Infinity, y: 0 };
	for (const [x0, y0, x1, y1, x2, y2, x3, y3] of harpNeck) {
		for (let t = 0; t <= 1; t += 0.01) {
			const u = 1 - t;
			const bx = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
			const by = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
			if (Math.abs(bx - x) < best.dx) best = { dx: Math.abs(bx - x), y: by };
		}
	}
	return best.y;
};
const harp: Art = {
	draw: [
		line(34, 112, 76, 112, 474),
		circle(112, 60, 24),
		box(84, 466, 170, 28, 10),
		poly(112, 474, 224, 474, 436, 130, 402, 104),
		curve(34, harpNeck.map(([x0, y0, ...rest], i) => `${i ? '' : `M${x0} ${y0}`}C${rest.join(' ')}`).join('')),
		...range(150, 370, 28)
			.map((x) => [x, neckY(x), 474 - (x - 112) * (370 / 290)] as const)
			.filter(([, top, bottom]) => bottom - top > 40)
			.map(([x, top, bottom]) => line(9, x, top, x, bottom))
	]
};

const whiteKeys = 10;
const keyWidth = 416 / whiteKeys;
const synth: Art = {
	draw: [box(24, 140, 464, 200, 22), line(22, 140, 346, 372, 496), line(22, 372, 346, 140, 496)],
	cut: [
		circle(84, 190, 18),
		circle(140, 190, 18),
		circle(196, 190, 18),
		box(250, 172, 124, 40, 6),
		box(396, 176, 26, 26, 4),
		box(436, 176, 26, 26, 4),
		box(48, 240, 416, 82, 6)
	],
	over: [
		...range(1, whiteKeys - 1, 1).map((i) => box(48 + i * keyWidth - 3, 240, 6, 82)),
		...[0, 1, 3, 4, 5, 7, 8].map((i) => box(48 + (i + 1) * keyWidth - 13, 240, 26, 50, 3))
	]
};

const recorder: Art = {
	turn: 35,
	draw: [
		poly(236, 26, 276, 26, 282, 150, 230, 150),
		box(224, 148, 64, 18, 6),
		box(232, 164, 48, 250),
		box(222, 408, 68, 16, 6),
		poly(228, 422, 284, 422, 298, 488, 214, 488)
	],
	cut: [box(244, 112, 24, 14, 3), ...range(196, 376, 30).map((y) => circle(256, y, 9))]
};

const oboe: Art = {
	turn: 35,
	draw: [
		poly(246, 16, 266, 16, 268, 66, 244, 66),
		box(248, 64, 16, 22, 3),
		box(238, 84, 36, 16, 5),
		poly(240, 100, 272, 100, 284, 412, 228, 412),
		poly(228, 410, 284, 410, 302, 472, 210, 472),
		ellipse(256, 472, 46, 12)
	],
	cut: [...[150, 190, 230, 290, 330, 370].map((y) => circle(256, y, 8)), line(6, 268, 132, 270, 396)]
};

// A soprano saxophone is straight: mouthpiece, a long cone with its key cups, a small bell.
const sopranoSax: Art = {
	turn: 35,
	draw: [
		poly(248, 12, 264, 12, 268, 58, 244, 58),
		box(240, 48, 32, 16, 4),
		poly(244, 64, 268, 64, 300, 400, 212, 400),
		'M212 396C200 440 176 460 168 484L344 484C336 460 312 440 300 396Z',
		...[120, 170, 220, 270, 320].map((y) => circle(268 + (32 * (y - 64)) / 336 + 10, y, 13))
	],
	cut: [...[140, 190, 240, 290, 340].map((y) => circle(256, y, 9)), ellipse(256, 484, 70, 10)]
};

// A Wagner tuba: an oval coil, the bell up and to the right like a horn's, rotary valves inside.
const wagnerTuba: Art = {
	draw: [
		ellipse(226, 336, 132, 152),
		'M262 214C288 160 318 106 326 30L476 64C432 116 384 168 344 262Z',
		line(26, 318, 24, 482, 62),
		line(20, 118, 246, 52, 160),
		circle(46, 150, 18)
	],
	cut: [curve(18, ellipse(226, 336, 100, 120)), curve(18, ellipse(226, 336, 58, 76))],
	over: [circle(176, 336, 18), circle(214, 336, 18), circle(252, 336, 18), circle(290, 336, 18)]
};

const guitar: Art = {
	turn: 35,
	draw: [
		ellipse(256, 282, 88, 80),
		ellipse(256, 384, 110, 96),
		box(244, 60, 24, 170, 4),
		box(232, 16, 48, 66, 12),
		circle(222, 32, 10),
		circle(222, 62, 10),
		circle(290, 32, 10),
		circle(290, 62, 10)
	],
	cut: [circle(256, 300, 32), box(222, 414, 68, 14, 5)]
};

const mandolin: Art = {
	turn: 35,
	draw: [
		shell(256, 214, 0.74),
		box(246, 64, 20, 170, 4),
		box(234, 22, 44, 60, 10),
		circle(224, 36, 9),
		circle(224, 64, 9),
		circle(288, 36, 9),
		circle(288, 64, 9)
	],
	cut: [ellipse(256, 340, 24, 30), box(226, 410, 60, 12, 4)]
};

// An accordion from the front: the bass buttons, the pleated bellows, the keyboard.
const accordion: Art = {
	draw: [box(36, 120, 96, 290, 14), box(128, 146, 196, 238, 6), box(320, 120, 156, 290, 14)],
	cut: [
		...range(0, 5, 1).flatMap((row) => [0, 1, 2].map((col) => circle(62 + col * 24, 170 + row * 38, 8))),
		...range(150, 302, 22).map((x) => line(8, x, 160, x, 370)),
		box(342, 140, 50, 250, 4)
	],
	over: [...range(1, 9, 1).map((i) => box(342, 140 + i * 25 - 2, 50, 4)), ...[1, 2, 4, 5, 6, 8].map((i) => box(342, 140 + i * 25 - 8, 30, 16, 2))]
};

// A celesta: an upright cabinet over its keyboard, on legs, with a pedal.
const celesta: Art = {
	draw: [
		box(82, 86, 348, 206, 16),
		box(56, 292, 400, 42, 8),
		line(22, 100, 334, 100, 484),
		line(22, 412, 334, 412, 484),
		line(16, 256, 334, 256, 470),
		box(222, 464, 68, 18, 6)
	],
	cut: [curve(12, box(112, 116, 288, 146, 10)), ...range(84, 428, 26).map((x) => line(6, x, 300, x, 326))]
};

// A bass clarinet: the bent metal neck with the mouthpiece, the long body, the bell turned up.
const bassClarinet: Art = {
	draw: [
		curve(18, 'M256 112C254 70 222 44 186 46'),
		poly(190, 34, 140, 26, 108, 44, 140, 62, 190, 58),
		box(230, 106, 52, 300, 6),
		box(224, 160, 64, 14, 4),
		box(224, 278, 64, 14, 4),
		curve(46, 'M256 396C256 478 344 486 356 420'),
		'M330 432C344 400 348 370 344 326L420 326C414 378 400 420 374 448Z',
		line(18, 336, 326, 428, 326)
	],
	cut: [...range(196, 380, 34).map((y) => circle(256, y, 9)), line(8, 166, 30, 166, 60)],
	over: [line(6, 112, 56, 186, 70)]
};

// A contrabass clarinet, folded like a paper clip: two tubes side by side, the bell up at the top.
const contrabassClarinet: Art = {
	draw: [
		box(150, 8, 46, 24, 8),
		curve(18, 'M160 22C130 30 122 60 136 96'),
		box(114, 92, 44, 320, 6),
		curve(44, 'M136 404C136 480 252 480 252 404'),
		box(230, 150, 44, 260, 6),
		curve(40, 'M252 158C252 96 330 86 344 140'),
		box(322, 140, 44, 230, 6),
		curve(40, 'M344 362C344 420 416 420 420 360'),
		'M396 368C404 300 404 230 392 160L474 160C474 236 462 310 444 372Z',
		line(18, 388, 160, 480, 160)
	],
	cut: [...range(150, 380, 46).map((y) => circle(136, y, 8)), ...range(200, 380, 46).map((y) => circle(252, y, 8))]
};

// A basset horn: a clarinet with its neck bent forward and a small metal bell turned out.
const bassetHorn: Art = {
	draw: [
		box(176, 18, 44, 22, 8),
		poly(186, 36, 210, 36, 250, 120, 226, 132),
		box(226, 112, 46, 22, 5),
		box(230, 130, 38, 290, 5),
		box(224, 220, 50, 12, 4),
		curve(34, 'M249 412C249 456 280 470 318 454'),
		'M300 442C330 430 356 412 376 384L420 432C392 456 352 474 318 480Z'
	],
	cut: [...range(176, 396, 36).map((y) => circle(249, y, 8))]
};

// A contrabassoon: the bassoon's tube folded four times, the bocal on top, the bell pointing down.
const contrabassoon: Art = {
	draw: [
		curve(14, 'M118 20C150 20 176 40 186 70'),
		box(168, 64, 40, 360, 8),
		curve(34, 'M188 418C188 470 260 470 260 418'),
		box(242, 90, 38, 334, 8),
		curve(34, 'M260 98C260 50 328 50 328 98'),
		box(310, 90, 38, 300, 8),
		curve(34, 'M328 384C328 430 396 430 396 384'),
		box(378, 170, 40, 220, 8),
		'M378 176C378 130 418 110 432 80L470 104C452 132 418 150 418 176Z',
		box(152, 120, 72, 16, 5),
		box(296, 200, 66, 16, 5)
	],
	cut: [...range(150, 400, 46).map((y) => circle(188, y, 7)), ...range(260, 380, 46).map((y) => circle(329, y, 7))]
};

/**
 * A hand, fingers up and the thumb out to the left (`flip` puts it right), turned by `deg`
 * around (cx, cy). `grow` widens every stroke, so the same hand can cut a gap round itself.
 */
const hand = (cx: number, cy: number, deg: number, flip = 1, grow = 0, fingers = [-178, -194, -186, -150]): Mark[] => {
	const c = Math.cos((deg * Math.PI) / 180);
	const s = Math.sin((deg * Math.PI) / 180);
	const at = (x: number, y: number) => [cx + x * flip * c - y * s, cy + x * flip * s + y * c];
	const seg = (w: number, ...p: number[]) => line(w + grow, ...p.flatMap((v, i) => (i % 2 ? [] : at(v, p[i + 1]))));
	const palm = [-58, -50, 58, -50, 54, 92, -50, 92];
	return [
		poly(...palm.flatMap((v, i) => (i % 2 ? [] : at(v, palm[i + 1])))),
		seg(40, ...palm, -58, -50),
		...[-48, -16, 16, 46].map((x, i) => seg(i === 3 ? 30 : 34, x, -40, x * 1.12, fingers[i])),
		seg(38, -56, 50, -100, -10, -112, -64)
	];
};

const claps: Art = {
	draw: hand(176, 330, 30),
	cut: hand(336, 330, -30, -1, 30),
	over: [...hand(336, 330, -30, -1), line(16, 256, 92, 256, 40), line(16, 196, 104, 160, 62), line(16, 316, 104, 352, 62)]
};

const snap: Art = {
	draw: [
		...hand(250, 330, 10, 1, 0, [-200, -70, -60, -56]),
		// the middle finger has just slid off the thumb and lies in the palm
		line(34, 230, 270, 262, 210)
	],
	over: [line(14, 96, 150, 54, 120), line(14, 104, 98, 80, 46), line(14, 146, 78, 152, 24), circle(126, 132, 12)]
};

const stomp: Art = {
	draw: [
		'M164 60H284V262C344 274 414 292 440 330C452 348 452 362 452 372H134V96Q134 60 164 60Z',
		box(122, 372, 342, 42, 14),
		line(18, 40, 476, 472, 476)
	],
	cut: [...range(110, 230, 40).map((y) => line(12, 236, y, 300, y + 10)), line(10, 134, 300, 280, 300)],
	over: [line(16, 92, 404, 34, 380), line(16, 90, 444, 30, 444), line(16, 482, 404, 504, 380), line(16, 486, 444, 506, 444), line(14, 340, 120, 340, 200), line(14, 396, 170, 396, 240)]
};

const whistle: Art = {
	draw: [circle(316, 296, 144), box(30, 152, 300, 100, 26), curve(18, ellipse(464, 160, 28, 28))],
	cut: [poly(240, 140, 330, 140, 300, 196, 240, 196), curve(14, ellipse(316, 296, 92, 92)), line(10, 76, 172, 76, 232)],
	over: [line(14, 248, 112, 226, 58), line(14, 290, 108, 296, 50), line(14, 330, 116, 364, 68)]
};

const sandBlock = (x: number, top: number, up: boolean): { draw: Mark[]; cut: Mark[] } => {
	const face = up ? top : top + 90;
	const block = up ? top + 24 : top;
	const knob = up ? top + 114 : top - 60;
	return {
		draw: [box(x, block, 300, 90, 14), box(x - 6, face, 312, 24, 6), box(x + 126, up ? knob - 6 : knob + 30, 48, 36), ellipse(x + 150, up ? knob + 30 : knob, 52, 30)],
		cut: [line(8, x, up ? face + 24 : face, x + 300, up ? face + 24 : face), ...range(x + 18, x + 288, 30).map((gx, i) => circle(gx, face + 8 + (i % 2) * 8, 5))]
	};
};
const sandBlocks: Art = (() => {
	const a = sandBlock(60, 116, false);
	const b = sandBlock(152, 254, true);
	return {
		draw: [...a.draw, ...b.draw],
		cut: [...a.cut, ...b.cut],
		over: [line(14, 24, 242, 84, 242), line(14, 428, 242, 488, 242)]
	};
})();

const sandpaper: Art = {
	turn: -8,
	draw: [poly(90, 70, 350, 70, 430, 150, 430, 450, 90, 450)],
	cut: [
		line(14, 350, 70, 350, 150, 430, 150),
		...range(0, 8, 1).flatMap((row) =>
			range(0, 8, 1)
				.map((col) => [118 + col * 40 + (row % 2) * 20 + 9 * Math.sin(row * 7 + col * 3), 104 + row * 42 + 8 * Math.cos(row * 5 + col * 11)])
				.filter(([x, y]) => x < 410 && !(x > 330 && y < 170))
				.map(([x, y], col) => circle(x, y, (row + col) % 3 ? 7 : 10))
		)
	]
};

const typewriter: Art = {
	draw: [
		box(160, 24, 192, 170, 6),
		box(70, 170, 372, 48, 24),
		circle(56, 194, 30),
		circle(456, 194, 30),
		line(18, 110, 172, 70, 124, 24, 124),
		poly(104, 232, 408, 232, 458, 434, 54, 434),
		box(36, 424, 440, 44, 16)
	],
	cut: [
		...[70, 104, 138].map((y, i) => line(10, 188, y, i === 2 ? 270 : 324, y)),
		line(8, 160, 170, 352, 170),
		...range(0, 6, 1).map((i) => circle(146 + i * 44, 278, 14)),
		...range(0, 7, 1).map((i) => circle(136 + i * 40, 324, 14)),
		...range(0, 6, 1).map((i) => circle(146 + i * 44, 370, 14)),
		box(176, 398, 160, 18, 9)
	]
};

const art: Record<Glyph, Art> = {
	...(Object.fromEntries(Object.entries(gameIcons).map(([name, d]) => [name, { draw: [d] }])) as Record<keyof typeof gameIcons, Art>),
	cello,
	contrabass,
	electricBass,
	recorder,
	oboe,
	synth,
	harp,
	timpani,
	snare,
	fieldDrum,
	bassDrum,
	toms,
	bongos,
	congas,
	djembe,
	cajon,
	hiHat,
	suspendedCymbal,
	clashCymbals,
	triangle,
	cowbell,
	agogo,
	anvil,
	claves,
	woodBlock,
	templeBlocks,
	guiro,
	maracas,
	shaker,
	rainStick,
	ratchet,
	whip,
	vibraslap,
	flexatone,
	sleighBells,
	windChimes,
	markTree,
	brakeDrum,
	steelPan,
	tubularBells,
	crotales,
	vibraphone,
	glockenspiel,
	tambourine,
	castanets,
	claps,
	snap,
	stomp,
	whistle,
	sandBlocks,
	sandpaper,
	typewriter,
	sopranoSax,
	wagnerTuba,
	guitar,
	mandolin,
	accordion,
	celesta,
	bassClarinet,
	contrabassClarinet,
	bassetHorn,
	contrabassoon,
	piccolo: { draw: [gameIcons.flute], size: 0.68 }
};

export default art;

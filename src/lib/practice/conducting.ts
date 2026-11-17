/**
 * How J. S. Bach beats time (#368): his pose at any moment of a bar, as one pure function of
 * time. Nothing here is keyed or stepped: the hand's way, the wrist, the elbow and the body are
 * all read from the same continuous figure, each a little later than the one before it, so the
 * movement runs from the shoulder out to the baton's tip and looks the same at any frame rate.
 *
 * Two layers, tuned apart: GESTURE is the beat itself (the hand's figure, the wrist, the arm),
 * BODY is what the rest of him does with it (weight, sway, breath, head, eyes, the other hand).
 *
 * Seen from the front, as a player sees the conductor: x to the viewer's right (his left),
 * y down, z towards the viewer. Units are those of the drawing, 160 wide.
 */

/** The beat patterns there are figures for: 2/4, 3/4, 4/4 and 6/8 (six beats, in eighths). */
export type ConductorMeter = 2 | 3 | 4 | 6;

export type Point = [number, number];
type Vec = [number, number, number];

/**
 * One beat of a figure: where the hand lands (from the downbeat, in the drawing's units), and
 * its way on to the next beat. `lift` is how high it rebounds, `swing` how far it bulges
 * sideways on the way. `glide` is how much it sweeps into the next beat: 0 leaves and lands
 * straight up and down, as a ball bounces; more starts slowly and is still travelling as it
 * lands. `early` gets the sideways travel done first, so the hand then falls straight.
 * `lifted` is the upbeat: the hand is raised out of the beat rather than thrown off it, slow
 * at first, and then falls with its whole weight.
 */
interface Beat {
	x: number;
	y: number;
	lift: number;
	swing?: number;
	glide?: number;
	early?: boolean;
	lifted?: number;
}

/** How high the hand rises before the downbeat, the tallest stroke of every figure. */
const TOP = 29;
const UPBEAT = { lift: TOP - 4.5, early: true, lifted: 0.7 };

/**
 * The figures as they are taught, mirrored for the front view. 4/4: 1 down, 2 in (to his left),
 * 3 out (to his right), 4 in and a little higher, then up. 3/4: down, out, up. 2/4: down, a
 * small beat out, up. 6/8, the German six: 1 down, 2 and 3 in, 4 across, 5 out, 6 in and up.
 */
const FIGURES: Record<ConductorMeter, Beat[]> = {
	2: [
		{ x: 0, y: 0, lift: 11, swing: -7 },
		{ x: -9, y: -8, ...UPBEAT }
	],
	3: [
		{ x: 0, y: 0, lift: 11, glide: 0.5 },
		{ x: -17, y: -6, lift: 10, swing: -6, glide: 0.3 },
		{ x: -8, y: -9, ...UPBEAT }
	],
	4: [
		{ x: 0, y: 0, lift: 11, glide: 0.2 },
		{ x: 16, y: -1, lift: 11, glide: 0.6 },
		{ x: -17, y: -6, lift: 10, swing: -6, glide: 0.3 },
		{ x: -8, y: -9, ...UPBEAT }
	],
	6: [
		{ x: 0, y: 0, lift: 8, glide: 0.2 },
		{ x: 8, y: -0.5, lift: 6, glide: 0.2 },
		{ x: 16, y: -1, lift: 11, glide: 0.6 },
		{ x: -9, y: -0.5, lift: 6, glide: 0.3 },
		{ x: -17, y: -6, lift: 10, swing: -6, glide: 0.3 },
		{ x: -9, y: -9, ...UPBEAT }
	]
};

const GESTURE = {
	/** Where the right hand lands on 1, in front of his right side. */
	home: [58, 93, 14] as Vec,
	/** How far the hand comes back towards him at the top of a stroke, and when it swings out to his right. */
	draw: 4,
	drawOut: 0,
	/**
	 * The arm's weight: how much of each turn the hand rounds off, braking into the beat instead
	 * of bouncing off it (0 a ball, 1 it comes to rest there). The wrist makes up the rest.
	 */
	weight: 0.6,
	/** The baton's length as seen, and its angle above the level: on the beat and at the top. */
	baton: 22,
	wristLow: 0.06,
	wristHigh: 0.87,
	/** With the hand out to his right the baton still points in to the players, so it dips this much (radians). */
	wristOut: 0.4,
	/** How far out the hand is when it's fully out. */
	outAt: 17,
	/** The arm's two bones, and where the elbow hangs: out, down and back, lifting as the hand rises. */
	upper: 34,
	fore: 27,
	pole: [-0.8, 0.3, -0.5] as Vec,
	poleLift: [-0.55, -0.45, 0] as Vec,
	/** With the hand out to his right the elbow drops under it instead of winging out. */
	poleOut: [0.1, 0.5, 0] as Vec,
	/**
	 * The movement runs outwards along the arm: the shoulder and elbow turn this much ahead of
	 * the hand (beats), and between the beats the baton trails this much behind it. On the beat
	 * itself they all meet.
	 */
	elbowLead: 0.06,
	shoulderLead: 0.09,
	batonTrail: 0.07
};

const BODY = {
	/** His shoulders at rest, and the hips he leans from. */
	shoulderRight: [55, 61] as Point,
	shoulderLeft: [105, 61] as Point,
	hips: [80, 158] as Point,
	/** Weight: how far he rises with a stroke, and how late. */
	rise: 1.5,
	riseLag: 0.05,
	/** Impact: how far he gives after a beat, how long that takes to peak (beats), and how much of it the lighter beats get. */
	give: 0.8,
	giveAt: 0.13,
	lightBeat: 0.4,
	/** Counterbalance: how far he shifts and leans (degrees) away from the hand, per unit it moves aside. */
	sway: 0.05,
	lean: 0.07,
	swayLag: 0.1,
	/** The beating shoulder lifts with the arm. */
	shrug: 2.2,
	/** Breath: seconds per breath, and how far the chest lifts. */
	breathSeconds: 4.6,
	breath: 0.55,
	/** The head follows the body late and stays upright against the lean. */
	headLag: 0.13,
	nod: 1.2,
	headGive: 0.7,
	upright: 0.55,
	/** A slow look across the orchestra: seconds there and back. */
	lookSeconds: 9.2,
	/** Where the left hand holds the roll of music, and how much of the beat it takes up. */
	leftHome: [101, 107, 16] as Vec,
	echo: 0.13,
	echoLag: 0.11
};

const smooth = (u: number) => u * u * (3 - 2 * u);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The figure, `phase` beats into the bar (any number; it wraps). Each beat is a bounce: it
 * falls ever faster into the beat, turns sharply there, and slows to the top of its rebound.
 * That is the figure as the baton's tip beats it. A hand has weight and can't turn like that,
 * so with `weight` it brakes into the beat and eases out of it, still turning at the same moment.
 */
export function figureAt(meter: ConductorMeter, phase: number, weight = 0): Point {
	const beats = FIGURES[meter];
	const whole = Math.floor(phase);
	const u = phase - whole;
	const index = ((whole % meter) + meter) % meter;
	const from = beats[index];
	const to = beats[(index + 1) % meter];
	const across = from.early ? 1 - (1 - u) ** 3 : mix(smooth(u), u * u, from.glide ?? 0);
	// Up to the top of the rebound an upbeat is lifted; from there everything falls alike.
	const eased = u < 0.5 ? Math.max(weight, from.lifted ?? 0) : weight;
	const bounce = mix(4 * u * (1 - u), Math.sin(Math.PI * u) ** 2, eased);
	return [from.x + (to.x - from.x) * across + (from.swing ?? 0) * Math.sin(Math.PI * u), from.y + (to.y - from.y) * u - from.lift * bounce];
}

/** The hand's own way through the figure, with the arm's weight in it. */
const carried = (meter: ConductorMeter, phase: number) => figureAt(meter, phase, GESTURE.weight);

const height = (y: number) => Math.min(1, Math.max(0, -y / TOP));

/** The give after a beat: nothing on the beat itself, soon at its most, gone before the next. The downbeat is the heaviest. */
function impact(meter: ConductorMeter, phase: number): number {
	const whole = Math.floor(phase);
	const u = (phase - whole) / BODY.giveAt;
	const downbeat = ((whole % meter) + meter) % meter === 0;
	return (downbeat ? 1 : BODY.lightBeat) * u * Math.exp(1 - u);
}

/** Two bones from `root` reaching `end`, the joint between them on the side `pole` points to. */
function reach(root: Vec, end: Vec, first: number, second: number, pole: Vec): { joint: Vec; end: Vec } {
	let along: Vec = [end[0] - root[0], end[1] - root[1], end[2] - root[2]];
	let far = Math.hypot(...along) || 1;
	along = [along[0] / far, along[1] / far, along[2] / far];
	// An arm never quite straightens.
	far = Math.min(far, (first + second) * 0.97);
	const end2: Vec = [root[0] + along[0] * far, root[1] + along[1] * far, root[2] + along[2] * far];
	const foot = (first ** 2 - second ** 2 + far ** 2) / (2 * far);
	const out = Math.sqrt(Math.max(0, first ** 2 - foot ** 2));
	const dot = pole[0] * along[0] + pole[1] * along[1] + pole[2] * along[2];
	let side: Vec = [pole[0] - dot * along[0], pole[1] - dot * along[1], pole[2] - dot * along[2]];
	const length = Math.hypot(...side) || 1;
	side = [side[0] / length, side[1] / length, side[2] / length];
	return { joint: [root[0] + along[0] * foot + side[0] * out, root[1] + along[1] * foot + side[1] * out, root[2] + along[2] * foot + side[2] * out], end: end2 };
}

export interface Arm {
	shoulder: Point;
	elbow: Point;
	hand: Point;
}

export interface BachPose {
	/** The body's shift and lean (degrees, about `hips`). */
	torso: { x: number; y: number; lean: number; hips: Point };
	/** -1 breathed out, 1 breathed in. */
	breath: number;
	/** The head on the body: its shift and tilt (degrees), brows raised 0 to 1, where the eyes look (-1 to 1), eyes shut. */
	head: { x: number; y: number; tilt: number; brows: number; look: number; blink: boolean };
	right: Arm;
	left: Arm;
	/** The baton's angle above the level, in degrees, and its tip: where the beat is. */
	baton: number;
	tip: Point;
}

/**
 * Bach at one moment. `phase` is the beats gone since a bar began, `seconds` any running clock
 * (breath and gaze keep their own time), and `engaged` how far he has taken up the beat: 0 he
 * stands ready, hand on 1, 1 he beats in full. With `still`, the body holds and only the arm
 * beats, which is the figure as it's drawn.
 */
export function bachPose(meter: ConductorMeter, phase: number, seconds: number, engaged = 1, still = false): BachPose {
	const hand = carried(meter, phase);
	const hx = hand[0] * engaged;
	const hy = hand[1] * engaged;
	const raised = height(hy);
	// The wrist turns with the figure itself, not the weighted hand: sharply, exactly on the beat.
	const out = (x: number) => smooth(Math.min(1, Math.max(0, -x / GESTURE.outAt)));
	const trail = GESTURE.batonTrail * Math.sin(Math.PI * (phase - Math.floor(phase))) ** 2;
	const wrist = mix(GESTURE.wristLow, GESTURE.wristHigh, height(figureAt(meter, phase - trail)[1]) * engaged) - GESTURE.wristOut * out(hx);
	const live = still ? 0 : 1;

	const late = (lag: number) => {
		const [x, y] = carried(meter, phase - lag);
		return { x: x * engaged * live, up: height(y) * engaged * live };
	};
	const weight = late(BODY.riseLag);
	const balance = late(BODY.swayLag);
	const breath = still ? 0 : Math.sin((2 * Math.PI * seconds) / BODY.breathSeconds);

	const torso = {
		x: -BODY.sway * balance.x,
		y: -BODY.rise * weight.up + BODY.give * impact(meter, phase - BODY.riseLag) * engaged * live - BODY.breath * 0.4 * breath,
		lean: -BODY.lean * balance.x,
		hips: BODY.hips
	};
	/** A point of the body where the lean and shift put it. */
	const carry = ([x, y]: Point): Point => {
		const angle = (torso.lean * Math.PI) / 180;
		const dx = x - BODY.hips[0];
		const dy = y - BODY.hips[1];
		return [BODY.hips[0] + dx * Math.cos(angle) - dy * Math.sin(angle) + torso.x, BODY.hips[1] + dx * Math.sin(angle) + dy * Math.cos(angle) + torso.y];
	};

	// The elbow is part of the beat, so it moves even where the body holds still.
	const elbowAt = carried(meter, phase + GESTURE.elbowLead);
	const elbowUp = height(elbowAt[1]) * engaged;
	const elbowOut = out(elbowAt[0] * engaged);
	const [srx, sry] = carry(BODY.shoulderRight);
	const shoulderRight: Point = [srx - 0.4 * weight.up, sry - BODY.shrug * late(-GESTURE.shoulderLead).up - BODY.breath * breath];
	const rightHand: Vec = [GESTURE.home[0] + hx, GESTURE.home[1] + hy, GESTURE.home[2] - GESTURE.draw * raised - GESTURE.drawOut * out(hx)];
	const right = reach([...shoulderRight, 0], rightHand, GESTURE.upper, GESTURE.fore, [
		GESTURE.pole[0] + GESTURE.poleLift[0] * elbowUp + GESTURE.poleOut[0] * elbowOut,
		GESTURE.pole[1] + GESTURE.poleLift[1] * elbowUp + GESTURE.poleOut[1] * elbowOut,
		GESTURE.pole[2]
	]);

	// The left hand holds the music and takes up a little of the beat, late and mirrored.
	const echo = late(BODY.echoLag);
	const [slx, sly] = carry(BODY.shoulderLeft);
	const shoulderLeft: Point = [slx, sly - BODY.breath * breath];
	const leftHand: Vec = [BODY.leftHome[0] - BODY.echo * echo.x + torso.x, BODY.leftHome[1] - BODY.echo * TOP * echo.up + torso.y - BODY.breath * 0.5 * breath, BODY.leftHome[2]];
	const left = reach([...shoulderLeft, 0], leftHand, GESTURE.upper, GESTURE.fore, [-GESTURE.pole[0], GESTURE.pole[1], GESTURE.pole[2]]);

	const nod = late(BODY.headLag);
	const look = still ? 0 : Math.sin((2 * Math.PI * seconds) / BODY.lookSeconds);
	// He blinks now and then, on two clocks so it never falls into a pattern.
	const blink = !still && (seconds % 4.3 < 0.13 || (seconds + 1.7) % 6.1 < 0.11);

	return {
		torso,
		breath,
		head: {
			x: 0.5 * look + 0.02 * nod.x,
			y: -BODY.nod * nod.up + BODY.headGive * impact(meter, phase - BODY.headLag) * engaged * live,
			tilt: -BODY.upright * torso.lean + 1.2 * look + 0.05 * nod.x,
			brows: nod.up,
			look,
			blink
		},
		right: { shoulder: shoulderRight, elbow: [right.joint[0], right.joint[1]], hand: [right.end[0], right.end[1]] },
		left: { shoulder: shoulderLeft, elbow: [left.joint[0], left.joint[1]], hand: [left.end[0], left.end[1]] },
		baton: (wrist * 180) / Math.PI,
		tip: [right.end[0] + GESTURE.baton * Math.cos(wrist), right.end[1] - GESTURE.baton * Math.sin(wrist)]
	};
}

/** Where the baton's tip is on each beat of the figure. */
export function beatPoints(meter: ConductorMeter): Point[] {
	return Array.from({ length: meter }, (_, beat) => bachPose(meter, beat, 0, 1, true).tip);
}

/** The whole figure as the baton's tip draws it, as an SVG path. */
export function figurePath(meter: ConductorMeter, perBeat = 28): string {
	const points = Array.from({ length: meter * perBeat + 1 }, (_, i) => bachPose(meter, i / perBeat, 0, 1, true).tip);
	return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
}

/** The baton's length as it's drawn, from the hand. */
export const BATON = GESTURE.baton;

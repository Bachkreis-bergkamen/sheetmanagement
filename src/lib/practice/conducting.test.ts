import { describe, expect, it } from 'vitest';
import { bachPose, beatPoints, figureAt, figurePath, type ConductorMeter, type Point } from './conducting.ts';

const METERS: ConductorMeter[] = [2, 3, 4, 6];
const far = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** The angle at `b` between the bones to `a` and `c`, in degrees. */
const angleAt = (a: Point, b: Point, c: Point) => {
	const one = Math.atan2(a[1] - b[1], a[0] - b[0]);
	const two = Math.atan2(c[1] - b[1], c[0] - b[0]);
	const turn = Math.abs(one - two);
	return (Math.min(turn, 2 * Math.PI - turn) * 180) / Math.PI;
};
const steps = (meter: number, perBeat = 200) => Array.from({ length: meter * perBeat }, (_, i) => i / perBeat);

describe('the figure', () => {
	it('runs on without a jump from the last beat into the next bar', () => {
		for (const meter of METERS) {
			expect(far(figureAt(meter, meter - 1e-6), figureAt(meter, 0))).toBeLessThan(0.001);
			expect(far(figureAt(meter, meter + 0.3), figureAt(meter, 0.3))).toBeLessThan(1e-9);
			expect(far(figureAt(meter, -0.25), figureAt(meter, meter - 0.25))).toBeLessThan(1e-9);
		}
	});

	it('puts 2 to his left and 3 to his right in four, 4 between and higher', () => {
		const [one, two, three, four] = beatPoints(4);
		// Seen from the front: his left is the viewer's right.
		expect(two[0]).toBeGreaterThan(one[0] + 8);
		expect(three[0]).toBeLessThan(one[0] - 8);
		expect(four[0]).toBeGreaterThan(three[0]);
		expect(four[0]).toBeLessThan(one[0]);
		expect(four[1]).toBeLessThan(three[1] - 3);
	});

	it('draws a closed path', () => {
		const path = figurePath(3);
		expect(path.startsWith('M')).toBe(true);
		const points = path.slice(1).split('L');
		expect(points[0]).toBe(points.at(-1));
	});
});

describe('the baton', () => {
	it('turns on the beat: its tip is lowest there, falling before and rising after', () => {
		for (const meter of METERS) {
			for (let beat = 0; beat < meter; beat++) {
				const y = (phase: number) => bachPose(meter, phase, 0).tip[1];
				expect(y(beat - 0.04)).toBeLessThan(y(beat));
				expect(y(beat + 0.04)).toBeLessThan(y(beat));
			}
		}
	});

	it('falls into the beat and slows at the top: fastest at the beat, slowest between', () => {
		const speed = (phase: number) => far(bachPose(4, phase + 0.005, 0).tip, bachPose(4, phase - 0.005, 0).tip);
		for (let beat = 0; beat < 4; beat++) {
			const slowest = Math.min(...[0.4, 0.45, 0.5, 0.55, 0.6].map((u) => speed(beat + u)));
			const falling = Math.max(...[0.75, 0.8, 0.85, 0.9, 0.95].map((u) => speed(beat + u)));
			expect(falling).toBeGreaterThan(slowest * 1.4);
			expect(speed(beat + 0.05)).toBeGreaterThan(slowest * 1.2);
		}
		// The downbeat falls from the top with its whole weight.
		expect(speed(3.9)).toBeGreaterThan(speed(3.5) * 5);
	});

	it('gives the downbeat the tallest stroke', () => {
		const top = (from: number) => Math.min(...steps(1).map((u) => bachPose(4, from + u, 0).tip[1]));
		expect(top(3)).toBeLessThan(top(0) - 10);
		expect(top(3)).toBeLessThan(top(1) - 10);
		expect(top(3)).toBeLessThan(top(2) - 10);
	});
});

describe('the body', () => {
	it('keeps the arms whole: bones never longer than they are, elbows never locked or folded shut', () => {
		for (const meter of METERS) {
			for (const phase of steps(meter, 50)) {
				const pose = bachPose(meter, phase, phase * 0.7);
				for (const arm of [pose.right, pose.left]) {
					expect(far(arm.shoulder, arm.elbow)).toBeLessThanOrEqual(34.001);
					expect(far(arm.elbow, arm.hand)).toBeLessThanOrEqual(27.001);
					// Seen from the front an arm can look more bent than it is, never straighter.
					expect(angleAt(arm.shoulder, arm.elbow, arm.hand)).toBeLessThan(172);
				}
				expect(far(pose.right.elbow, pose.right.hand)).toBeGreaterThan(7);
			}
		}
	});

	it('moves without a jump anywhere in the bar, the bar line included', () => {
		for (const meter of METERS) {
			let before = bachPose(meter, -0.002, 10);
			for (const phase of steps(meter, 500)) {
				const pose = bachPose(meter, phase, 10);
				expect(far(pose.tip, before.tip)).toBeLessThan(0.6);
				expect(far(pose.right.elbow, before.right.elbow)).toBeLessThan(0.3);
				expect(Math.abs(pose.torso.lean - before.torso.lean)).toBeLessThan(0.02);
				expect(Math.abs(pose.head.y - before.head.y)).toBeLessThan(0.03);
				before = pose;
			}
		}
	});

	it('runs outwards along the arm: at the top of the upbeat the elbow turns first, then the hand, then the baton', () => {
		const stroke = steps(1, 400).map((u) => 3 + u);
		const highest = (of: (phase: number) => number) => stroke.reduce((best, phase) => (of(phase) < of(best) ? phase : best));
		const elbow = highest((phase) => bachPose(4, phase, 0, 1, true).right.elbow[1]);
		const hand = highest((phase) => bachPose(4, phase, 0, 1, true).right.hand[1]);
		const tip = highest((phase) => bachPose(4, phase, 0, 1, true).tip[1]);
		expect(elbow).toBeLessThan(hand);
		expect(tip).toBeGreaterThan(hand + 0.01);
	});

	it('never bends the wrist further than a wrist goes', () => {
		for (const meter of METERS) {
			for (const phase of steps(meter, 50)) {
				const { right, baton } = bachPose(meter, phase, 0);
				const forearm = (Math.atan2(right.hand[1] - right.elbow[1], right.hand[0] - right.elbow[0]) * 180) / Math.PI;
				expect(Math.abs(-baton - forearm)).toBeLessThan(65);
			}
		}
	});

	it('leans away from the hand and keeps the head upright', () => {
		// On 3 the hand is far out to his right (the viewer's left); shortly after, he leans the other way.
		const pose = bachPose(4, 2.15, 0);
		expect(pose.torso.x).toBeGreaterThan(0.3);
		expect(pose.torso.lean).toBeGreaterThan(0.3);
		expect(Math.sign(pose.head.tilt)).toBe(-1);
	});

	it('stands ready, hand on 1, when he has not taken up the beat, and still breathes', () => {
		const ready = bachPose(4, 2.5, 0, 0);
		expect(far(ready.right.hand, [58, 93])).toBeLessThan(0.01);
		expect(ready.torso.lean).toBeCloseTo(0);
		expect(bachPose(4, 2.5, 1.15, 0).breath).toBeGreaterThan(0.9);
		expect(bachPose(4, 2.5, 1.15, 0).right.shoulder[1]).toBeLessThan(ready.right.shoulder[1]);
	});
});

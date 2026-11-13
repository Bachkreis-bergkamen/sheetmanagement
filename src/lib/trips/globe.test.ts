import { describe, expect, it } from 'vitest';
import { areaPath, facing, greatCircle, linePath, middle, project, type View } from './globe.ts';

const view: View = { center: [10, 50], r: 100, cx: 100, cy: 100 };

describe('the globe', () => {
	it('puts the middle in the middle, and hides the far side', () => {
		expect(project([10, 50], view)).toEqual([100, 100]);
		expect(facing([10, 50], view)).toBeCloseTo(1);
		expect(facing([-170, -50], view)).toBeCloseTo(-1);
		// East is right, north is up.
		const [x] = project([20, 50], view);
		const [, y] = project([10, 60], view);
		expect(x).toBeGreaterThan(100);
		expect(y).toBeLessThan(100);
	});

	it('draws an area cut at the edge, and nothing on the far side', () => {
		const near: [number, number][] = [[5, 45], [15, 45], [15, 55], [5, 55], [5, 45]];
		expect(areaPath(near, view)).toMatch(/^M[\d. ]+(L[\d. ]+)+Z$/);
		// From the middle to well beyond the edge: it follows the edge back.
		const across: [number, number][] = [[10, 50], [150, 50], [150, 30], [10, 30], [10, 50]];
		expect(areaPath(across, view)).toContain('A100 100');
		const far: [number, number][] = [[-175, -45], [-165, -45], [-165, -55], [-175, -45]];
		expect(areaPath(far, view)).toBe('');
		expect(linePath([[-170, -50], [10, 50], [12, 50]], view)).toMatch(/^M[\d. ]+L[\d. ]+$/);
	});

	it('turns to the middle of the places, along the shortest way between them', () => {
		const [lon, lat] = middle([[10, 50], [12, 44]]);
		expect(lon).toBeCloseTo(11, 0);
		expect(lat).toBeCloseTo(47, 0);
		const route = greatCircle([0, 0], [90, 0], 2);
		expect(route[1][0]).toBeCloseTo(45);
		expect(route[1][1]).toBeCloseTo(0);
	});
});

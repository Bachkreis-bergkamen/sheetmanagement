import { t } from '#lib/i18n/index.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nudged, SPOTS_KEY, ToolSpots, type SpotRoom } from './tool-spots.svelte.ts';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
afterEach(() => store.clear());

function setup(room: Partial<SpotRoom> = {}) {
	const now: SpotRoom = { layout: 'page-portrait', areaWidth: 1000, areaHeight: 800, dockWidth: 200, dockHeight: 300, ...room };
	return { now, spots: new ToolSpots(() => now) };
}

describe('ToolSpots', () => {
	it('is docked until the tools are put somewhere', () => {
		expect(setup().spots.spot).toBeNull();
	});

	it('keeps a spot per layout, inside the area, and remembers it on this device', () => {
		const { now, spots } = setup();
		spots.place({ x: 2000, y: -50 }, true);
		expect(spots.spot).toEqual({ x: 800, y: 0 });
		expect(JSON.parse(store.get(SPOTS_KEY)!)).toEqual({ 'page-portrait': { x: 800, y: 0 } });
		expect(spots.note).toBe(t.practice.viewer.toolsAt(80, 0));
		now.layout = 'full-landscape';
		expect(spots.spot).toBeNull();
		expect(setup().spots.spot).toEqual({ x: 800, y: 0 });
	});

	it('stays inside an area that got smaller, e.g. turned to portrait', () => {
		const { now, spots } = setup();
		spots.place({ x: 700, y: 400 }, false);
		now.areaWidth = 600;
		expect(spots.spot).toEqual({ x: 400, y: 400 });
	});

	it('neither remembers nor announces a spot while it is being dragged', () => {
		const { spots } = setup();
		spots.place({ x: 100, y: 100 }, false);
		expect(spots.note).toBe('');
		expect(store.size).toBe(0);
	});

	it('goes back to docked with null, unfolded', () => {
		const { spots } = setup();
		spots.place({ x: 100, y: 100 }, true);
		spots.folded = true;
		spots.place(null, true);
		expect(spots.spot).toBeNull();
		expect(spots.folded).toBe(false);
		expect(spots.note).toBe(t.practice.viewer.toolsAuto);
	});

	it('pulls a spot near an edge onto it', () => {
		const { spots } = setup();
		expect(spots.snap({ x: 10, y: 490 })).toEqual({ x: 0, y: 500 });
		expect(spots.snap({ x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
	});
});

describe('nudged', () => {
	it('moves by the arrow keys, further with shift, and docks with Escape', () => {
		expect(nudged({ x: 100, y: 100 }, 'ArrowLeft', false)).toEqual({ x: 88, y: 100 });
		expect(nudged({ x: 100, y: 100 }, 'ArrowDown', true)).toEqual({ x: 100, y: 148 });
		expect(nudged({ x: 100, y: 100 }, 'Escape', false)).toBeNull();
		expect(nudged({ x: 100, y: 100 }, 'a', false)).toBeUndefined();
	});
});

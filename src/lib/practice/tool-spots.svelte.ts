import { t } from '#lib/i18n/index.ts';
import { readLocalJson, writeLocalJson } from '#lib/local-storage.ts';

export type Spot = { x: number; y: number };

/** The sizes a spot depends on, as the viewer measures them. */
export type SpotRoom = {
	/** Which spot applies: e.g. `full-landscape` or `page-portrait`, since the stand differs. */
	layout: string;
	areaWidth: number;
	areaHeight: number;
	dockWidth: number;
	dockHeight: number;
};

export const SPOTS_KEY = 'practice-tools-spot';
/** How close to an edge the panel is pulled onto it. */
export const SNAP = 16;

function readSpots(): Record<string, Spot> {
	const value = readLocalJson(SPOTS_KEY);
	return value && typeof value === 'object' ? (value as Record<string, Spot>) : {};
}

/**
 * The practice viewer's tools where the player put them (#248): picked up by the grip and kept
 * per device, apart for each layout. Over the page, so where they cover the music is the
 * player's choice; folded to a pill they cover little. Without a spot the viewer docks them.
 * Without storage the tools stay put until the page is left.
 */
export class ToolSpots {
	spots = $state<Record<string, Spot>>(readSpots());
	folded = $state(false);
	/** Said to screen readers once the tools were moved. */
	note = $state('');
	#room: () => SpotRoom;

	constructor(room: () => SpotRoom) {
		this.#room = room;
	}

	/** Inside the area, also after a rotation or resize made it smaller. */
	clamp({ x, y }: Spot): Spot {
		const { areaWidth, areaHeight, dockWidth, dockHeight } = this.#room();
		return {
			x: Math.round(Math.min(Math.max(0, x), Math.max(0, areaWidth - dockWidth))),
			y: Math.round(Math.min(Math.max(0, y), Math.max(0, areaHeight - dockHeight)))
		};
	}

	/** A light pull to the edges and corners. */
	snap({ x, y }: Spot): Spot {
		const { areaWidth, areaHeight, dockWidth, dockHeight } = this.#room();
		const right = areaWidth - dockWidth;
		const bottom = areaHeight - dockHeight;
		return { x: x < SNAP ? 0 : right - x < SNAP ? right : x, y: y < SNAP ? 0 : bottom - y < SNAP ? bottom : y };
	}

	/** Where across and down the area, in per cent. */
	percent({ x, y }: Spot): [number, number] {
		const { areaWidth, areaHeight } = this.#room();
		return [Math.round((x / Math.max(1, areaWidth)) * 100), Math.round((y / Math.max(1, areaHeight)) * 100)];
	}

	/** The spot for the layout now, inside the area; null while docked, or before the area is measured. */
	get spot(): Spot | null {
		const { layout, areaWidth } = this.#room();
		const saved = this.spots[layout];
		return saved && areaWidth ? this.clamp(saved) : null;
	}

	/** Puts the tools at a spot, or with null back where the viewer docks them; `save` keeps it and says so. */
	place(next: Spot | null, save: boolean) {
		const { layout } = this.#room();
		const { [layout]: _, ...rest } = this.spots;
		this.spots = next ? { ...rest, [layout]: this.clamp(next) } : rest;
		if (!next) this.folded = false;
		if (save) {
			writeLocalJson(SPOTS_KEY, this.spots);
			this.note = next ? t.practice.viewer.toolsAt(...this.percent(this.clamp(next))) : t.practice.viewer.toolsAuto;
		}
	}
}

/** Moved by the arrow keys, further with shift; undefined for any other key. Escape docks them again (null). */
export function nudged(from: Spot, key: string, far: boolean): Spot | null | undefined {
	const step = far ? 48 : 12;
	const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
	if (key === 'Escape') return null;
	if (!by[key]) return undefined;
	return { x: from.x + by[key][0], y: from.y + by[key][1] };
}

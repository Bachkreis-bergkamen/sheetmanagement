/**
 * Where things go in the practice viewer (PracticeScore): the page fitted to the stage, the
 * loose pile of pages under it, and the tools beside, below or above it. Sizes only, no DOM.
 */

export type Size = { width: number; height: number };

/** A page of size `base` fitted to the stage: the whole page, or its width. Never under 100 px. */
export function fitted(base: Size, fit: 'page' | 'width', stageWidth: number, stageHeight: number): Size {
	const scale = fit === 'page' ? Math.min(stageWidth / base.width, stageHeight / base.height) : stageWidth / base.width;
	return { width: Math.max(100, Math.floor(base.width * scale)), height: Math.max(100, Math.floor(base.height * scale)) };
}

/**
 * The other pages, as a loose pile of paper under this one: a sheet or two still to come and
 * the one just played at the back, each lying a little crooked, always the same way (by its
 * number), as pages do on a stand.
 */
export type Under = { number: number; behind: boolean; depth: number };
export function pileFor(at: number, pages: number): Under[] {
	const ahead = [at + 1, at + 2].filter((number) => number <= pages);
	const under = ahead.map((number, i) => ({ number, behind: false, depth: i + 1 }));
	if (at > 1) under.push({ number: at - 1, behind: true, depth: under.length + 1 });
	return under;
}

/** -1 to 1, the same for a page every time. */
export function wobble(number: number, salt: number) {
	const x = Math.sin(number * 12.9898 + salt * 78.233) * 43758.5453;
	return (x - Math.floor(x)) * 2 - 1;
}

/** Where a sheet lies in the pile: those to come peek out to the right, the one played to the left. */
export function lying({ number, behind, depth }: Under) {
	const x = behind ? -10 + wobble(number, 1) * 4 : 5 * depth + wobble(number, 1) * 4;
	const y = 2 * depth + wobble(number, 2) * 5;
	const tilt = wobble(number, 3);
	const angle = Math.sign(tilt || 1) * (0.7 + Math.abs(tilt) * 1.3);
	return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(2)}deg)`;
}

/** Pulled aside, to the left, on its way to or from the back of the pile. */
export const ASIDE = 'translate(-58%, -1.5%) rotate(-4deg)';

/** The tools' panel width, and its distance from the page. */
export const PANEL = 260;
export const GAP = 12;

export type Dock = { place: 'side' | 'below' | 'above'; page: number; left?: string; top?: string; width?: string; height?: string };

/**
 * Where the tools go, so they never cover the music and the page never shrinks for them:
 * beside the page where its margin has room (moving the page aside, at the same size, when
 * only both margins together do), below it where a page narrower than the screen leaves room,
 * else above it in the page's flow, where in full screen the page gets smaller for it.
 * `whole` is the page as it is without the tools (#239), in the `room` it has then; `size` is
 * the page as shown. `page` is the page's left edge.
 */
export function dockFor({ fit, stageWidth, stageHeight, room, whole, size }: { fit: 'page' | 'width'; stageWidth: number; stageHeight: number; room: number; whole: Size | null; size: Size | null }): Dock {
	const width = whole?.width ?? stageWidth;
	const height = whole?.height ?? stageHeight;
	const free = stageWidth - width;
	if (fit === 'page' && free >= PANEL + GAP) {
		const left = Math.max(0, Math.min((stageWidth - width) / 2, stageWidth - PANEL - GAP - width));
		return { place: 'side', page: left, left: `${left + width + GAP}px`, top: '0px', width: `${Math.min(PANEL + 40, stageWidth - left - width - GAP)}px`, height: '100%' };
	}
	const below = room - height - GAP;
	if (fit === 'page' && size && below >= 150) {
		const left = (stageWidth - width) / 2;
		return { place: 'below', page: left, left: `${left}px`, top: `${height + GAP}px`, width: `${width}px`, height: `${below}px` };
	}
	return { place: 'above', page: Math.max(0, (stageWidth - (size?.width ?? width)) / 2) };
}

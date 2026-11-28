import { readLocalJson, writeLocalJson } from '#lib/local-storage.ts';
import { fitted, type Size } from './score-layout.ts';

/**
 * How the practice viewer (PracticeScore) lays out a part (#410): the whole page, the page at
 * its width, two pages side by side on a broad screen, or half a page at a time on a short one.
 * "Automatisch" picks for the screen; the choice is kept per device.
 */
export type View = 'auto' | 'page' | 'width' | 'spread' | 'half';
/** The view as shown: "auto" resolved for the screen and the part. */
export type Mode = Exclude<View, 'auto'>;

export const VIEWS: View[] = ['auto', 'page', 'width', 'spread', 'half'];
export const VIEW_KEY = 'practice-view';

export function readView(): View {
	const value = readLocalJson(VIEW_KEY);
	return VIEWS.includes(value as View) ? (value as View) : 'auto';
}

export function keepView(view: View) {
	writeLocalJson(VIEW_KEY, view);
}

/** Below this stage height a whole page is too small to read; half pages read better. */
export const SHORT_STAGE = 420;

/**
 * The view for the stage: two pages where both fit at the size one would have (a broad
 * screen loses nothing), half pages where the stage is short and the whole page would take
 * less than half its width (a phone held sideways), else the whole page. A one-page part is
 * never shown as two.
 */
export function modeFor(view: View, { stageWidth, stageHeight, page, pages }: { stageWidth: number; stageHeight: number; page: Size | null; pages: number }): Mode {
	if (view === 'spread') return pages > 1 ? 'spread' : 'page';
	if (view !== 'auto') return view;
	if (!page || !stageWidth || !stageHeight) return 'page';
	const one = fitted(page, 'page', stageWidth, stageHeight);
	if (pages > 1 && one.width * 2 <= stageWidth) return 'spread';
	if (stageHeight < SHORT_STAGE && one.width * 2 < stageWidth) return 'half';
	return 'page';
}

/** The pages shown with `page` on the left: one, or two in a spread; the last spread ends with the last page. */
export function shownPages(mode: Mode, page: number, pages: number): number[] {
	if (mode !== 'spread' || pages < 2) return [page];
	const left = Math.max(1, Math.min(page, pages - 1));
	return [left, left + 1];
}

/**
 * Where a turn by `step` pages goes from `page`, a spread turning two at a time; null when it
 * goes nowhere (past the first or last page).
 */
export function turnTo(mode: Mode, page: number, step: number, pages: number): number | null {
	const spread = mode === 'spread' && pages > 1;
	const left = spread ? shownPages(mode, page, pages)[0] : page;
	const last = spread ? pages - 1 : pages;
	const next = Math.max(1, Math.min(last, left + step * (spread ? 2 : 1)));
	return next === left ? null : next;
}

/**
 * The pages of a sheet side by side at one height: the sheet's size at the first page's
 * scale, and each page's share of its width.
 */
export function sideBySide(sizes: Size[]): { size: Size; shares: number[] } {
	const [first] = sizes;
	const widths = sizes.map((each) => (each.width * first.height) / each.height);
	const width = widths.reduce((sum, each) => sum + each, 0);
	return { size: { width, height: first.height }, shares: widths.map((each) => each / width) };
}

/** A sheet fitted to the stage in a view: half pages fill the stage with the page's upper half. */
export function fittedFor(mode: Mode, base: Size, stageWidth: number, stageHeight: number): Size {
	return fitted(base, mode === 'width' ? 'width' : 'page', stageWidth, mode === 'half' ? stageHeight * 2 : stageHeight);
}

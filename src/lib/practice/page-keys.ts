/** What a key does in the practice viewer (PracticeScore): turn on or back, to the first or last page, or leave full screen. */
export type PageKey = 'forward' | 'back' | 'first' | 'last' | 'leave';

/** The keys and page-turn pedals (they send these keys) that go on, and back. */
export const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']);
export const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

export type KeyPress = {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	target: { closest(selector: string): unknown } | null;
};

/**
 * What a key press does to the page; null when it's someone else's: a shortcut with ctrl, cmd
 * or alt, typing into a field, or space and Enter on a button, which press the button.
 */
export function pageKey(event: KeyPress, full: boolean): PageKey | null {
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	const target = event.target;
	if (target?.closest('input, textarea, select, [contenteditable="true"]')) return null;
	if ((event.key === ' ' || event.key === 'Enter') && target?.closest('button, a')) return null;
	if (event.key === 'Escape') return full ? 'leave' : null;
	if (NEXT.has(event.key)) return 'forward';
	if (PREVIOUS.has(event.key)) return 'back';
	if (event.key === 'Home') return 'first';
	if (event.key === 'End') return 'last';
	return null;
}

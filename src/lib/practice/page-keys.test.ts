import { describe, expect, it } from 'vitest';
import { pageKey, type KeyPress } from './page-keys.ts';

/** A key pressed on an element matching `on`, e.g. a button. */
function press(key: string, { on = '', ...modifiers }: Partial<Omit<KeyPress, 'key' | 'target'>> & { on?: string } = {}): KeyPress {
	const target = { closest: (selector: string) => (on && selector.split(', ').some((each) => each.startsWith(on)) ? {} : null) };
	return { key, ctrlKey: false, metaKey: false, altKey: false, target, ...modifiers };
}

describe('pageKey', () => {
	it('turns on and back with the arrows, page keys and pedals', () => {
		for (const key of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) expect(pageKey(press(key), false)).toBe('forward');
		for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']) expect(pageKey(press(key), false)).toBe('back');
		expect(pageKey(press('Home'), false)).toBe('first');
		expect(pageKey(press('End'), false)).toBe('last');
		expect(pageKey(press('a'), false)).toBeNull();
	});

	it('leaves full screen with Escape, and only there', () => {
		expect(pageKey(press('Escape'), true)).toBe('leave');
		expect(pageKey(press('Escape'), false)).toBeNull();
	});

	it('leaves shortcuts, typing, and space or Enter on a button alone', () => {
		expect(pageKey(press('ArrowRight', { ctrlKey: true }), false)).toBeNull();
		expect(pageKey(press('ArrowLeft', { metaKey: true }), false)).toBeNull();
		expect(pageKey(press('ArrowRight', { altKey: true }), false)).toBeNull();
		expect(pageKey(press('ArrowRight', { on: 'input' }), false)).toBeNull();
		expect(pageKey(press(' ', { on: 'button' }), false)).toBeNull();
		expect(pageKey(press('Enter', { on: 'a' }), false)).toBeNull();
		// Arrows on a button still turn: a pedal works wherever the focus is.
		expect(pageKey(press('ArrowRight', { on: 'button' }), false)).toBe('forward');
	});
});

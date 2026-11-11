import { describe, expect, it } from 'vitest';
import { noteId } from './decks.ts';
import { profile } from './instruments.ts';
import { clefLadder, openClefs, UNLOCK_AT } from './levels.ts';
import type { States } from './scheduler.ts';
import type { Clef } from './theory.ts';

const secure = { box: 5, due: 99, seen: 6, right: 6, times: [800] };
/** `count` notes on the clef's staff secure. */
const knowing = (clef: Clef, count: number): States => Object.fromEntries(Array.from({ length: count }, (_, i) => [noteId(clef, i), secure]));

describe('clefLadder', () => {
	it('gives a cellist the bass clef first, then tenor, then treble', () => {
		const cello = profile('cello');
		expect(openClefs(cello, {})).toEqual(['bass']);
		expect(openClefs(cello, knowing('bass', UNLOCK_AT - 1))).toEqual(['bass']);
		expect(openClefs(cello, knowing('bass', UNLOCK_AT))).toEqual(['bass', 'tenor']);
		expect(openClefs(cello, { ...knowing('bass', 9), ...knowing('tenor', UNLOCK_AT) })).toEqual(['bass', 'tenor', 'treble']);
		// Treble clef notes known from elsewhere don't skip the tenor.
		expect(openClefs(cello, knowing('tenor', 9))).toEqual(['bass']);
	});

	it('keeps a clef open once it was, even when notes slip back', () => {
		expect(openClefs(profile('cello'), {}, ['tenor'])).toEqual(['bass', 'tenor']);
	});

	it('counts secure notes per clef, for the hub to show', () => {
		expect(clefLadder(profile('viola'), knowing('alto', 3))).toEqual([
			{ clef: 'alto', open: true, mastered: 3 },
			{ clef: 'treble', open: false, mastered: 0 }
		]);
	});

	it('opens only one clef for instruments that read one, and both at once for a pianist', () => {
		expect(openClefs(profile('violin'), {})).toEqual(['treble']);
		expect(openClefs(profile('trumpet'), {})).toEqual(['treble']);
		expect(openClefs(profile('keys'), {})).toEqual(['treble', 'bass']);
		expect(openClefs(profile('trombone'), {})).toEqual(['bass']);
	});
});

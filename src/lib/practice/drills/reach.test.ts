import { afterEach, describe, expect, it } from 'vitest';
import { playId, playOrder } from './decks.ts';
import { profile, useReaches } from './instruments.ts';
import { afterTry, canGrow, comfortable, limits, makeReach, nextTry, readReach, writtenStep, type Reach } from './reach.ts';
import { scaleOrder } from './scales.ts';
import type { ItemState } from './scheduler.ts';
import { diatonic, pitchOf, staffPosition } from './theory.ts';

const at = (name: string) => diatonic(pitchOf(name));
const secure: ItemState = { box: 3, due: 0, seen: 3, right: 3, times: [1500] };

afterEach(() => useReaches(undefined));

describe('limits', () => {
	it('lets a trumpet grow up to the high E, no further than the staff shows', () => {
		expect(limits('trumpet')).toEqual([at('F3'), at('E6')]);
		expect(comfortable('trumpet')).toEqual([at('G3'), at('C6')]);
		expect(canGrow('trumpet')).toBe(true);
	});

	it('leaves an instrument without a wider range alone', () => {
		expect(canGrow('timpani')).toBe(false);
	});
});

describe('makeReach', () => {
	it('keeps a range within the limits and at least a fifth wide', () => {
		expect(makeReach('trumpet', at('C4'), at('D4'))).toEqual({ low: at('C4'), high: at('G4') });
		expect(makeReach('trumpet', at('C2'), at('C8'))).toEqual({ low: at('F3'), high: at('E6') });
	});
});

describe('writtenStep', () => {
	it('reads a heard note as written for the instrument, rounding inwards', () => {
		// A B♭ trumpet sounding B♭4 plays a written C5.
		expect(writtenStep('trumpet', 70, 'high')).toBe(at('C5'));
		// Sounding F♯4 on a violin: the top is F, the bottom G.
		expect(writtenStep('violin', 66, 'high')).toBe(at('F4'));
		expect(writtenStep('violin', 66, 'low')).toBe(at('G4'));
	});
});

describe('the own range in the drills', () => {
	it('asks a beginner for no note above their top', () => {
		useReaches({ trumpet: { low: at('C4'), high: at('C5') } });
		const positions = playOrder('trumpet', 'treble').map((id) => Number(id.split(':')[3]));
		expect(Math.max(...positions)).toBe(staffPosition('treble', pitchOf('C5')));
		expect(Math.min(...positions)).toBe(staffPosition('treble', pitchOf('C4')));
	});

	it('gives an experienced player the notes above the comfortable range', () => {
		useReaches({ trumpet: { low: at('F3'), high: at('E6') } });
		expect(playOrder('trumpet', 'treble')).toContain(playId('trumpet', 'treble', staffPosition('treble', pitchOf('E6'))));
	});

	it('plays fewer scales in a narrow range', () => {
		const all = scaleOrder('trumpet').length;
		useReaches({ trumpet: { low: at('C4'), high: at('C5') } });
		expect(scaleOrder('trumpet').length).toBeLessThan(all);
	});

	it('takes a clef out of play when the range doesn’t reach it, and keeps the base profile untouched', () => {
		useReaches({ cello: { low: at('C2'), high: at('G4') } });
		expect(profile('cello').range.treble).toBeUndefined();
		expect(profile('cello').range.bass).toEqual([at('C2'), at('G4')]);
		expect(profile('cello', false).range.treble).toBeDefined();
	});
});

describe('trying a new note', () => {
	const reach: Reach = { low: at('C4'), high: at('C5') };
	const edge = playId('trumpet', 'treble', staffPosition('treble', pitchOf('C5')));
	const above = playId('trumpet', 'treble', staffPosition('treble', pitchOf('D5')));

	it('waits until the top note is played securely', () => {
		expect(nextTry('trumpet', reach, ['treble'], {}, 100)).toBeNull();
		expect(nextTry('trumpet', reach, ['treble'], { [edge]: { ...secure, right: 1 } }, 100)).toBeNull();
	});

	it('tries the note above once the top is secure', () => {
		expect(nextTry('trumpet', reach, ['treble'], { [edge]: secure }, 100)).toEqual({ id: above, side: 'high', step: at('D5') });
	});

	it('widens the range when it comes, and waits longer after each miss', () => {
		expect(afterTry('trumpet', reach, 'high', true, 100)).toEqual({ low: at('C4'), high: at('D5') });
		const missed = afterTry('trumpet', reach, 'high', false, 100);
		expect(missed.high).toBe(at('C5'));
		expect(missed.tried?.high).toEqual({ day: 100, fails: 1 });
		const states = { [edge]: secure };
		// High waits two days: the low end is tried meanwhile, if there's room below.
		expect(nextTry('trumpet', missed, ['treble'], states, 101)?.side).not.toBe('high');
		expect(nextTry('trumpet', missed, ['treble'], states, 102)?.side).toBe('high');
		const twice = afterTry('trumpet', missed, 'high', false, 102);
		expect(twice.tried?.high).toEqual({ day: 102, fails: 2 });
		expect(nextTry('trumpet', twice, ['treble'], states, 104)).toBeNull();
		expect(nextTry('trumpet', twice, ['treble'], states, 105)?.side).toBe('high');
	});

	it('tries nothing beyond the instrument’s limits', () => {
		const top: Reach = { low: at('F3'), high: at('E6') };
		const states = { [playId('trumpet', 'treble', staffPosition('treble', pitchOf('E6')))]: secure, [playId('trumpet', 'treble', staffPosition('treble', pitchOf('F3')))]: secure };
		expect(nextTry('trumpet', top, ['treble'], states, 100)).toBeNull();
	});
});

describe('readReach', () => {
	it('drops what isn’t a range', () => {
		expect(readReach('trumpet', 'high')).toBeNull();
		expect(readReach('trumpet', { low: 1.5, high: 30 })).toBeNull();
		expect(readReach('trumpet', { low: at('C4'), high: at('C5'), tried: { high: { day: 3, fails: 1 }, low: { day: 'x' } } })).toEqual({
			low: at('C4'),
			high: at('C5'),
			tried: { high: { day: 3, fails: 1 } }
		});
	});
});

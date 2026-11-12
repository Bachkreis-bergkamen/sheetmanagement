import { describe, expect, it } from 'vitest';
import { knownOf, newlyOpen, progression, stageOf, stageReached, STAGES } from './progression.ts';
import type { ItemState } from './scheduler.ts';

const state = (box: number): ItemState => ({ box, due: 0, seen: 1, right: 1, times: [500] });
const never = () => false;

describe('progression', () => {
	it('opens only the basics at the start', () => {
		const open = progression({}, [], never);
		expect(STAGES.flat().filter((card) => open[card].open)).toEqual(['notes', 'keys', 'rhythm', 'play']);
		expect(stageReached(open)).toBe(0);
	});

	it('opens a drill once what it builds on is known, and says how far along it is', () => {
		const before = progression({ rhythm: 3 }, [], never);
		expect(before.pulse).toMatchObject({ open: false, needs: [{ of: 'rhythm', count: 5, have: 3 }] });
		const after = progression({ rhythm: 5 }, [], never);
		expect(after.pulse.open).toBe(true);
		expect(newlyOpen(['notes', 'keys', 'rhythm', 'play'], after)).toEqual(['pulse']);
		expect(stageReached(after)).toBe(1);
	});

	it('needs everything a drill builds on', () => {
		expect(progression({ notes: 9, rhythm: 4 }, [], never).sight.open).toBe(false);
		expect(progression({ notes: 9, rhythm: 5 }, [], never).sight.open).toBe(true);
		// Entries need sight-reading's own needs too: a level set by the placement test alone isn't enough.
		expect(progression({ sightLevel: 7 }, [], never).entry.open).toBe(false);
		expect(progression({ notes: 9, rhythm: 5, sightLevel: 2 }, [], never).entry.open).toBe(true);
	});

	it('keeps open what was opened, or practised before progression came in', () => {
		expect(progression({}, ['tune'], never).tune.open).toBe(true);
		expect(progression({}, [], (card) => card === 'scale').scale.open).toBe(true);
	});

	it('counts as known what is secure or known at first sight', () => {
		expect(knownOf(['a', 'b', 'c', 'd'], { a: state(3), b: state(5), c: state(1) })).toBe(2);
	});

	it('puts every drill in one stage', () => {
		expect(new Set(STAGES.flat()).size).toBe(STAGES.flat().length);
		expect(stageOf('tune')).toBe(3);
	});
});

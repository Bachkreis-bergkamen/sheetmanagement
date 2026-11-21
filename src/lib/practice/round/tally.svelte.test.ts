import { describe, expect, it } from 'vitest';
import { ROUND } from '#lib/practice/drills/decks.ts';
import { PULSE_ROUND } from '#lib/practice/drills/rhythm.ts';
import { roundLength, RoundTally, type RoundSource } from './tally.svelte.ts';

const order = ['notes:treble:0', 'notes:treble:1', 'notes:treble:2', 'notes:treble:3'];

function run(tally: RoundTally) {
	const ids: string[] = [];
	for (let pick = tally.pick(); pick; pick = tally.pick()) {
		ids.push(pick.id);
		tally.shown(pick);
		tally.record(true, pick.isNew, 1000);
	}
	return ids;
}

describe('roundLength', () => {
	it('is shorter for keeping the pulse, unless a length is given', () => {
		expect(roundLength(order)).toBe(ROUND);
		expect(roundLength(['pulse:90:2', 'pulse:72:2'])).toBe(PULSE_ROUND);
		expect(roundLength(['pulse:90:2', 'notes:treble:0'])).toBe(ROUND);
		expect(roundLength(order, 3)).toBe(3);
	});
});

describe('RoundTally', () => {
	it('asks as many questions as the round is long, and tallies them', () => {
		const tally = new RoundTally(() => ({ order, states: {}, length: 5 }), 100);
		expect(run(tally)).toHaveLength(5);
		expect(tally.count).toBe(5);
		expect(tally.right).toBe(5);
		expect(tally.introduced).toBeGreaterThan(0);
		expect(tally.typicalMs).toBe(1000);
	});

	it('tries the new note once, as the third question', () => {
		const source: RoundSource = { order, states: {}, length: 6, tryNote: { id: 'play:violin:treble:30' } };
		const tally = new RoundTally(() => source, 100);
		const picks = [];
		for (let pick = tally.pick(); pick; pick = tally.pick()) {
			picks.push(pick);
			tally.shown(pick);
		}
		expect(picks.map((pick) => pick.trying)).toEqual([false, false, true, false, false, false]);
		expect(picks[2].id).toBe('play:violin:treble:30');
	});

	it('follows the placement test until it ends, however long', () => {
		const asked = ['keys:0:major', 'keys:1:major', 'keys:2:major'];
		const test = () => asked.shift() ?? null;
		const tally = new RoundTally(() => ({ order, states: {}, length: 1, test, tryNote: { id: 'x' } }), 100);
		expect(run(tally)).toEqual(['keys:0:major', 'keys:1:major', 'keys:2:major']);
	});

	it('keeps the time to answer only of right answers where speed counts', () => {
		const tally = new RoundTally(() => ({ order, states: {} }), 100);
		tally.record(true, false, 2000);
		tally.record(false, false, 500);
		tally.record(true, false);
		expect(tally.times).toEqual([2000]);
		expect(tally.right).toBe(2);
		expect(tally.answers).toHaveLength(3);
	});

	it('counts a right answer only after hearing it as half a point (#371)', () => {
		const tally = new RoundTally(() => ({ order, states: {} }), 100);
		tally.record(true, false, undefined, true);
		tally.record(true, false);
		tally.record(false, false, undefined, true);
		expect(tally.rightAfterHearing).toBe(1);
		expect(tally.right).toBe(2);
		expect(tally.points).toBe(1.5);
	});

	it('starts again from nothing after the summary', () => {
		const tally = new RoundTally(() => ({ order, states: {}, length: 2 }), 100);
		run(tally);
		tally.finish();
		tally.restart();
		expect(tally).toMatchObject({ count: 0, answers: [], times: [], introduced: 0, rightAfterHearing: 0, finished: false });
		expect(tally.typicalMs).toBeNull();
		expect(run(tally)).toHaveLength(2);
	});
});

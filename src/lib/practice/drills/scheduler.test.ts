import { describe, expect, it } from 'vitest';
import { isMastered, median, pickNext, record, successRate, summary, type States } from './scheduler.ts';

const FLUENT = 2000;

describe('record', () => {
	it('puts a first answer that was right and fast high: the player knew it', () => {
		expect(record(undefined, true, 900, 100, FLUENT)).toMatchObject({ box: 3, due: 104, seen: 1, right: 1, times: [900] });
		expect(record(undefined, true, 5000, 100, FLUENT)).toMatchObject({ box: 1, due: 101 });
		expect(record(undefined, false, 900, 100, FLUENT)).toMatchObject({ box: 0, due: 100, right: 0, times: [] });
	});

	it('moves up only when right and fast, and back to learning when wrong', () => {
		const known = record(undefined, true, 5000, 100, FLUENT);
		expect(record(known, true, 1000, 101, FLUENT).box).toBe(2);
		expect(record(known, true, 4000, 101, FLUENT).box).toBe(1);
		expect(record({ ...known, box: 5 }, false, 1000, 101, FLUENT)).toMatchObject({ box: 0, due: 101 });
		// Learning again: a right answer starts over at the first box.
		expect(record({ ...known, box: 0 }, true, 1000, 101, FLUENT).box).toBe(1);
		expect(record({ ...known, box: 6 }, true, 1000, 101, FLUENT).box).toBe(6);
	});

	it('keeps the last five times of right answers', () => {
		let state = record(undefined, true, 1, 0, FLUENT);
		for (const ms of [2, 3, 4, 5, 6]) state = record(state, true, ms, 0, FLUENT);
		expect(state.times).toEqual([2, 3, 4, 5, 6]);
		expect(record(state, false, 99, 0, FLUENT).times).toEqual([2, 3, 4, 5, 6]);
	});
});

describe('isMastered', () => {
	it('needs a high box and fluent answers', () => {
		expect(isMastered({ box: 4, due: 0, seen: 5, right: 5, times: [800, 900, 1200] }, FLUENT)).toBe(true);
		expect(isMastered({ box: 4, due: 0, seen: 5, right: 5, times: [2500, 3000, 900] }, FLUENT)).toBe(false);
		expect(isMastered({ box: 3, due: 0, seen: 5, right: 5, times: [800] }, FLUENT)).toBe(false);
		expect(isMastered(undefined, FLUENT)).toBe(false);
		expect(median([3, 1, 2, 10])).toBe(2.5);
	});
});

describe('pickNext', () => {
	const order = ['a', 'b', 'c', 'd', 'e'];
	const state = (box: number, due = 0) => ({ box, due, seen: 1, right: 1, times: [500] });
	const always = (value: number) => () => value;

	it('starts with the first item', () => {
		expect(pickNext({ order, states: {}, day: 10, answers: [], recent: [] })).toEqual({ id: 'a', isNew: true });
	});

	it('brings in new items while it goes well and few are being learnt', () => {
		const states: States = { a: state(3, 20), b: state(3, 20) };
		expect(pickNext({ order, states, day: 10, answers: [true, true, true], recent: ['b'], random: always(0.9) })).toEqual({ id: 'c', isNew: true });
	});

	it('brings in nothing new while many answers are wrong', () => {
		const states: States = { a: state(1, 20), b: state(3, 20) };
		const answers = [true, false, false, true, false];
		const next = pickNext({ order, states, day: 10, answers, recent: [], random: always(0.9) });
		expect(next?.isNew).toBe(false);
	});

	it('brings in nothing new while three are being learnt', () => {
		const states: States = { a: state(1, 20), b: state(1, 20), c: state(0, 10) };
		expect(pickNext({ order, states, day: 10, answers: [true, true], recent: ['c'], random: always(0.9) })?.isNew).toBe(false);
	});

	it('asks a wrong one again soon, but not right away', () => {
		const states: States = { a: state(0, 10), b: state(3, 20) };
		expect(pickNext({ order, states, day: 10, answers: [false], recent: ['b'], random: always(0.1) })).toEqual({ id: 'a', isNew: false });
		expect(pickNext({ order, states, day: 10, answers: [true, false], recent: ['a'], random: always(0.1) })?.id).not.toBe('a');
	});

	it('mixes in a well-known one when it goes badly', () => {
		const states: States = { a: state(0, 10), b: state(0, 10), c: state(5, 40) };
		expect(pickNext({ order, states, day: 10, answers: [false, false, false], recent: [], random: always(0.1) })).toEqual({ id: 'c', isNew: false });
	});

	it('asks due ones, the shakiest first', () => {
		const states: States = { a: state(1, 9), b: state(5, 9), c: state(2, 20), d: state(3, 20), e: state(3, 20) };
		expect(pickNext({ order, states, day: 10, answers: [true], recent: [], random: always(0.99) })).toEqual({ id: 'a', isNew: false });
	});

	it('keeps going when everything is known and nothing due', () => {
		const states: States = Object.fromEntries(order.map((id, i) => [id, state(i === 2 ? 2 : 5, 99)]));
		expect(pickNext({ order, states, day: 10, answers: [true], recent: [], random: always(0.99) })).toEqual({ id: 'c', isNew: false });
		expect(pickNext({ order: ['a'], states: { a: state(5, 99) }, day: 10, answers: [true], recent: ['a'] })).toEqual({ id: 'a', isNew: false });
		expect(pickNext({ order: [], states: {}, day: 10, answers: [], recent: [] })).toBeNull();
	});

	it('measures success over the last ten answers', () => {
		expect(successRate([])).toBe(1);
		expect(successRate([false, ...Array(10).fill(true)])).toBe(1);
		expect(successRate([true, false, true, false])).toBe(0.5);
	});
});

describe('summary', () => {
	it('counts mastered and due items', () => {
		const states: States = { a: { box: 5, due: 30, seen: 9, right: 9, times: [700] }, b: { box: 1, due: 9, seen: 1, right: 1, times: [3000] } };
		expect(summary(['a', 'b', 'c'], states, 10, () => FLUENT)).toEqual({ total: 3, seen: 2, mastered: 1, due: 1, known: 0 });
	});

	it('counts items known at first sight, waiting for their check', () => {
		const states: States = { a: { box: 3, due: 12, seen: 1, right: 1, times: [700] }, b: { box: 3, due: 10, seen: 1, right: 1, times: [700] } };
		expect(summary(['a', 'b'], states, 10, () => FLUENT)).toMatchObject({ known: 1, due: 1, mastered: 0 });
	});
});

import { describe, expect, it } from 'vitest';
import { addDays, beatSeconds, GRACE_MINUTES, IDLE_MINUTES, MAX_BEAT_SECONDS, PracticeClock, practiceMonth, practiceWeek, SESSION_HOURS, treeStage, weekStart } from './practice.ts';

const h = (hours: number) => hours * 3600;

describe('treeStage', () => {
	it('grows from a seed to a seedling at 10 h, a small tree at 25 h, then a tree every 20 h', () => {
		expect(treeStage(0)).toMatchObject({ kind: 'seed', level: 0, from: 0, next: h(10), progress: 0 });
		expect(treeStage(h(9.99)).kind).toBe('seed');
		expect(treeStage(h(10))).toMatchObject({ kind: 'seedling', level: 1, from: h(10), next: h(25) });
		expect(treeStage(h(24.9)).kind).toBe('seedling');
		expect(treeStage(h(25))).toMatchObject({ kind: 'sapling', level: 2, age: 0, from: h(25), next: h(45) });
		expect(treeStage(h(45))).toMatchObject({ kind: 'tree', level: 3, age: 1, from: h(45), next: h(65) });
		expect(treeStage(h(64))).toMatchObject({ kind: 'tree', age: 1 });
		expect(treeStage(h(65))).toMatchObject({ kind: 'tree', age: 2, next: h(85) });
		expect(treeStage(h(245))).toMatchObject({ kind: 'tree', age: 11, from: h(245) });
	});

	it('shows the way to the next stage', () => {
		expect(treeStage(h(5)).progress).toBeCloseTo(0.5);
		expect(treeStage(h(17.5)).progress).toBeCloseTo(0.5);
		expect(treeStage(h(55)).progress).toBeCloseTo(0.5);
		expect(treeStage(-5)).toMatchObject({ kind: 'seed', progress: 0 });
	});
});

describe('days and periods', () => {
	it('counts weeks from Monday, also across months and years', () => {
		expect(weekStart('2026-10-24')).toBe('2026-10-19'); // a Saturday
		expect(weekStart('2026-10-19')).toBe('2026-10-19');
		expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday ends the week
		expect(weekStart('2027-01-01')).toBe('2026-12-28');
		expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // over the change to summer time
	});

	const days = [
		{ day: '2026-10-18', seconds: 600 },
		{ day: '2026-10-19', seconds: 1800 },
		{ day: '2026-10-21', seconds: 3600 },
		{ day: '2026-10-24', seconds: 900 },
		{ day: '2026-09-30', seconds: 1200 }
	];

	it('sums a week, Monday to Sunday, with empty days as 0', () => {
		const week = practiceWeek(days, '2026-10-24');
		expect(week.start).toBe('2026-10-19');
		expect(week.days.map((day) => day.seconds)).toEqual([1800, 0, 3600, 0, 0, 900, 0]);
		expect(week.total).toBe(6300);
		const before = practiceWeek(days, '2026-10-24', -1);
		expect(before.start).toBe('2026-10-12');
		expect(before.total).toBe(600);
	});

	it('sums a month, every day of it', () => {
		const october = practiceMonth(days, '2026-10-24');
		expect(october.start).toBe('2026-10-01');
		expect(october.days).toHaveLength(31);
		expect(october.total).toBe(600 + 1800 + 3600 + 900);
		const september = practiceMonth(days, '2026-10-24', -1);
		expect(september.days).toHaveLength(30);
		expect(september.total).toBe(1200);
		expect(practiceMonth([], '2028-02-10').days).toHaveLength(29);
		expect(practiceMonth([], '2026-01-31', -1).start).toBe('2025-12-01');
	});
});

describe('beatSeconds', () => {
	it('takes whole seconds up to the most one report may add', () => {
		expect(beatSeconds(30)).toBe(30);
		expect(beatSeconds(29.6)).toBe(30);
		expect(beatSeconds(10_000)).toBe(MAX_BEAT_SECONDS);
		expect(beatSeconds(-5)).toBe(0);
		expect(beatSeconds('30')).toBe(0);
		expect(beatSeconds(Number.NaN)).toBe(0);
	});
});

describe('PracticeClock', () => {
	const run = (clock: PracticeClock, from: number, seconds: number, visible = true) => {
		for (let at = from + 5000; at <= from + seconds * 1000; at += 5000) clock.tick(at, visible);
		return from + seconds * 1000;
	};

	it('counts while visible and in use', () => {
		const clock = new PracticeClock(0);
		let now = run(clock, 0, 60);
		expect(clock.take()).toBe(60);
		now = run(clock, now, 60, false);
		expect(clock.take()).toBe(0);
		clock.activity(now);
		run(clock, now, 30);
		expect(clock.take()).toBe(30);
	});

	it('pauses after a while without a touch', () => {
		const clock = new PracticeClock(0);
		const now = run(clock, 0, IDLE_MINUTES * 60 + 300);
		expect(clock.idle(now)).toBe(true);
		expect(clock.inGrace(now)).toBe(true);
		// The tick that finds it idle adds nothing yet.
		expect(clock.counted).toBe(IDLE_MINUTES * 60_000 - 5000);
	});

	it('counts the pause after all when the member touches it within the grace (#304)', () => {
		const clock = new PracticeClock(0);
		let now = run(clock, 0, IDLE_MINUTES * 60 + 300);
		clock.activity(now);
		expect(clock.counted).toBe(IDLE_MINUTES * 60_000 + 300_000);
		now = run(clock, now, 10);
		expect(clock.counted).toBe(IDLE_MINUTES * 60_000 + 310_000);
	});

	it('drops the pause once the grace is over, and counts again from the next touch', () => {
		const clock = new PracticeClock(0);
		let now = run(clock, 0, (IDLE_MINUTES + GRACE_MINUTES) * 60 + 60);
		expect(clock.inGrace(now)).toBe(false);
		clock.activity(now);
		expect(clock.counted).toBe(IDLE_MINUTES * 60_000 - 5000);
		now = run(clock, now, 10);
		expect(clock.counted).toBe(IDLE_MINUTES * 60_000 + 5000);
	});

	it('does not count a hidden pause', () => {
		const clock = new PracticeClock(0);
		let now = run(clock, 0, IDLE_MINUTES * 60);
		now = run(clock, now, 300, false);
		clock.activity(now);
		// Only the visible time up to the pause; the five minutes with the screen off add nothing.
		expect(clock.counted).toBe(IDLE_MINUTES * 60_000);
	});

	it('adds nothing for a long gap between ticks (the device slept)', () => {
		const clock = new PracticeClock(0);
		clock.tick(10 * 60_000, true);
		expect(clock.counted).toBe(0);
	});

	it('counts one opening for at most the session cap', () => {
		const clock = new PracticeClock(0);
		let now = 0;
		for (let minute = 0; minute < SESSION_HOURS * 60 + 30; minute++) {
			now = run(clock, now, 60);
			clock.activity(now);
		}
		expect(clock.full()).toBe(true);
		expect(clock.counted).toBe(SESSION_HOURS * 3600_000);
	});

	it('hands out at most one report’s worth at a time and keeps the rest', () => {
		const clock = new PracticeClock(0);
		run(clock, 0, 90);
		expect(clock.take()).toBe(MAX_BEAT_SECONDS);
		expect(clock.take()).toBe(30);
		expect(clock.take()).toBe(0);
	});
});

import { describe, expect, it } from 'vitest';
import { addAnswer, type DayStats } from './progress.ts';
import { boardOf, CHALLENGE_DAYS, effectiveSharing, overviewOf, readRows, readSharing, sharesAny, shiftDay, summaryRows, weekOf, type SummaryRow } from './sharing.ts';

describe('sharing choices', () => {
	it('reads only explicit trues', () => {
		expect(readSharing({ board: true, leaders: 'yes', parents: 1 })).toEqual({ board: true, leaders: false, parents: false });
		expect(readSharing(null)).toEqual({ board: false, leaders: false, parents: false });
		expect(sharesAny({ board: false, leaders: false, parents: true })).toBe(true);
		expect(sharesAny(null)).toBe(false);
	});

	it('holds a young player back from the board and the leaders until a parent agrees', () => {
		const all = { board: true, leaders: true, parents: true };
		expect(effectiveSharing(all, true, false)).toEqual({ board: false, leaders: false, parents: true });
		expect(effectiveSharing(all, true, true)).toEqual(all);
		expect(effectiveSharing(all, false, false)).toEqual(all);
		expect(effectiveSharing(null, false, true)).toEqual({ board: false, leaders: false, parents: false });
	});
});

describe('summary rows', () => {
	it('sums a day per skill, and what came before skills as "other"', () => {
		let days: Record<string, DayStats> = { '2026-11-10': { answers: 3, right: 2, ms: 9000 } };
		days = addAnswer(days, '2026-11-10', true, 2000, 'notes');
		days = addAnswer(days, '2026-11-12', false, 4000, 'scale');
		days = addAnswer(days, '2026-11-12', true, 3000, 'scale');
		expect(summaryRows(days, '2026-11-12')).toEqual([
			{ day: '2026-11-10', skill: 'notes', answers: 1, right: 1, seconds: 2 },
			{ day: '2026-11-10', skill: 'other', answers: 3, right: 2, seconds: 9 },
			{ day: '2026-11-12', skill: 'scale', answers: 2, right: 1, seconds: 7 }
		]);
	});

	it('leaves out days older than the window', () => {
		const days = { '2026-10-01': { answers: 3, right: 2, ms: 9000 } };
		expect(summaryRows(days, '2026-11-12')).toEqual([]);
	});

	it('checks rows from a request', () => {
		const row = { day: '2026-11-12', skill: 'notes', answers: 10, right: 12, seconds: 99_999 };
		expect(readRows([row], '2026-11-12')).toEqual([{ ...row, right: 10, seconds: 6 * 3600 }]);
		expect(readRows([{ ...row, day: '2026-01-01' }], '2026-11-12')).toEqual([]);
		expect(readRows([{ ...row, skill: '<script>' }], '2026-11-12')).toBeNull();
		expect(readRows({}, '2026-11-12')).toBeNull();
	});
});

describe('the weekly board', () => {
	it('runs Monday to Sunday', () => {
		expect(weekOf('2026-11-12')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
		expect(weekOf('2026-11-09')[0]).toBe('2026-11-09');
		expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('ranks by days practised, first names only, ties sharing a place', () => {
		const week = weekOf('2026-11-12');
		const people = [
			{ email: 'a@x', name: 'Anna Alt' },
			{ email: 'b@x', name: 'Ben Bach' },
			{ email: 'c@x', name: 'Cem Cello' }
		];
		const rows = [
			...week.slice(0, CHALLENGE_DAYS).map((day) => ({ email: 'b@x', day })),
			{ email: 'a@x', day: week[0] },
			{ email: 'a@x', day: week[0] },
			{ email: 'c@x', day: week[1] },
			{ email: 'c@x', day: '2026-11-01' }
		];
		expect(boardOf(people, rows, week, 'c@x')).toEqual([
			{ name: 'Ben', days: 5, met: true, me: false, place: 1 },
			{ name: 'Anna', days: 1, met: false, me: false, place: 2 },
			{ name: 'Cem', days: 1, met: false, me: true, place: 2 }
		]);
	});
});

describe('the overview for leaders and parents', () => {
	it('sums the last four weeks per skill and per week', () => {
		const rows: SummaryRow[] = [
			{ day: '2026-11-12', skill: 'notes', answers: 20, right: 15, seconds: 300 },
			{ day: '2026-11-12', skill: 'scale', answers: 4, right: 4, seconds: 240 },
			{ day: '2026-11-03', skill: 'notes', answers: 20, right: 17, seconds: 300 },
			{ day: '2026-09-01', skill: 'notes', answers: 99, right: 0, seconds: 999 }
		];
		const overview = overviewOf(rows, '2026-11-12');
		expect(overview).toMatchObject({ days: 2, minutes: 14, answers: 44, last: '2026-11-12', weeks: [0, 0, 1, 1] });
		expect(overview.right).toBeCloseTo(36 / 44);
		expect(overview.skills.map((skill) => skill.skill)).toEqual(['notes', 'scale']);
	});
});

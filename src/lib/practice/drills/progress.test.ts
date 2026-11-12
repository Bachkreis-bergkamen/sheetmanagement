import { describe, expect, it } from 'vitest';
import { addAnswer, dayKey, readData, streak, type DayStats } from './progress.ts';
import { profileFor } from './instruments.ts';

const practised = (...dates: string[]): Record<string, DayStats> => Object.fromEntries(dates.map((date) => [date, { answers: 3, right: 2, ms: 9000 }]));
const at = (date: string) => new Date(`${date}T12:00:00`);

describe('streak', () => {
	it('counts days in a row up to today', () => {
		expect(streak({}, at('2026-11-11'))).toBe(0);
		expect(streak(practised('2026-11-09', '2026-11-10', '2026-11-11'), at('2026-11-11'))).toBe(3);
	});

	it('isn’t broken by today not practised yet, or by one rest day', () => {
		expect(streak(practised('2026-11-09', '2026-11-10'), at('2026-11-11'))).toBe(2);
		expect(streak(practised('2026-11-07', '2026-11-08', '2026-11-10', '2026-11-11'), at('2026-11-11'))).toBe(4);
	});

	it('is broken by two days off', () => {
		expect(streak(practised('2026-11-06', '2026-11-07', '2026-11-10', '2026-11-11'), at('2026-11-11'))).toBe(2);
		expect(streak(practised('2026-11-08'), at('2026-11-11'))).toBe(0);
	});
});

describe('days', () => {
	it('adds answers to the day, a long pause counting a minute at most', () => {
		const days = addAnswer(addAnswer({}, '2026-11-11', true, 1500), '2026-11-11', false, 600_000);
		expect(days['2026-11-11']).toEqual({ answers: 2, right: 1, ms: 61_500 });
		expect(dayKey(at('2026-01-05'))).toBe('2026-01-05');
	});

	it('reads back what was stored, dropping anything malformed', () => {
		const data = readData({
			items: { 'notes:treble:2': { box: 2, due: 5, seen: 3, right: 2, times: [900, 'x'] }, broken: { box: 'a' } },
			days: { '2026-11-11': { answers: 4, right: 3, ms: 100 }, yesterday: { answers: 1 } },
			settings: { instrument: 'viola' }
		});
		expect(data.items).toEqual({ 'notes:treble:2': { box: 2, due: 5, seen: 3, right: 2, times: [900] } });
		expect(Object.keys(data.days)).toEqual(['2026-11-11']);
		expect(data.settings.instrument).toBe('viola');
		expect(readData(null).items).toEqual({});
	});
});

describe('profileFor', () => {
	it('knows the orchestra’s instruments by their names', () => {
		const cases: [string, string | null][] = [
			['Violine 1', 'violin'],
			['Bratsche', 'viola'],
			['Violoncello', 'cello'],
			['Kontrabass', 'doubleBass'],
			['Klarinette in B', 'clarinet'],
			['Bassklarinette', 'bassClarinet'],
			['Altsaxophon', 'altoSax'],
			['Englischhorn', 'englishHorn'],
			['Horn in F', 'horn'],
			['Flügelhorn', 'trumpet'],
			['Tenorhorn', 'euphonium'],
			['Posaune', 'trombone'],
			['Querflöte', 'flute'],
			['Pauken', 'timpani'],
			['Klavier', 'keys'],
			['Sopran', 'highVoice'],
			['Bass', 'lowVoice'],
			['Schlagwerk', null]
		];
		for (const [name, id] of cases) expect(profileFor(name), name).toBe(id);
	});
});

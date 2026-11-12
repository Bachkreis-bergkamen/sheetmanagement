import { describe, expect, it } from 'vitest';
import { concertKey, ConcertNames, concertRef, numericDate, splitConcertRef } from './concert-ref.ts';
import { parseFuzzyDate } from './dates.ts';

const concert = (title: string, date: string) => ({ title, date: parseFuzzyDate(date) });

describe('concert names and days', () => {
	it('writes dates as the orchestra does', () => {
		expect(['1957-12-21', '1957-12', '1957'].map((date) => numericDate(parseFuzzyDate(date)!))).toEqual(['21.12.1957', '12.1957', '1957']);
	});

	it('compares name and day however they are written', () => {
		expect(concertKey('Weihnachtskonzert', '21.12.1957')).toBe(concertKey(' weihnachtskonzert ', '1957-12-21'));
		expect(concertKey('Weihnachtskonzert', '1957')).not.toBe(concertKey('Weihnachtskonzert', '1958'));
	});

	it('reads the date in brackets, and only a date', () => {
		expect(splitConcertRef('Weihnachtskonzert (21.12.1957)')).toEqual({ title: 'Weihnachtskonzert', date: { year: 1957, month: 12, day: 21 } });
		expect(splitConcertRef('Konzert (mit Chor)')).toBeNull();
	});

	it('adds the date only when the name is shared', () => {
		expect(concertRef(concert('Sommerkonzert', '1962'), false)).toBe('Sommerkonzert');
		expect(concertRef(concert('Sommerkonzert', '1962'), true)).toBe('Sommerkonzert (1962)');
	});

	it('finds a concert by its name, or by name and date when the name is shared', () => {
		const first = concert('Weihnachtskonzert', '1957-12-21');
		const second = concert('Weihnachtskonzert', '1958-12-20');
		const odd = concert('Jubiläum (1960)', '1960');
		const names = new ConcertNames([first, second, odd]);
		expect(names.find('Weihnachtskonzert')).toBe('ambiguous');
		expect(names.get('weihnachtskonzert (20.12.1958)')).toBe(second);
		expect(names.get('Weihnachtskonzert (1957-12-21)')).toBe(first);
		expect(names.get('Weihnachtskonzert (1959)')).toBeUndefined();
		expect(names.get('Jubiläum (1960)')).toBe(odd);
		expect(names.ref(first)).toBe('Weihnachtskonzert (21.12.1957)');
		expect(names.ref(odd)).toBe('Jubiläum (1960)');
	});
});

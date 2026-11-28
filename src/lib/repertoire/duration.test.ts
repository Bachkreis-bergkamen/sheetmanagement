import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration, programLength, roundMinutes, startTimes } from './duration.ts';

describe('parseDuration', () => {
	it.each([
		['7:30', 450],
		['7.30', 450],
		["7'30", 450],
		["7'30''", 450],
		['7′30″', 450],
		['07:05', 425],
		['1:02:00', 3720],
		['7', 420],
		['7 Min.', 420],
		['ca. 7 min', 420],
		['7,5 min', 450],
		['7 Minuten', 420],
		['7 min 30 s', 450],
		['  12:00  ', 720]
	])('reads %s', (text, seconds) => {
		expect(parseDuration(text)).toBe(seconds);
	});

	it.each(['', 'lang', '7:75', '0', '0:00', '99:99:99', '500:00:00', 'abc 7'])('rejects %s', (text) => {
		expect(parseDuration(text)).toBeUndefined();
	});
});

describe('formatDuration', () => {
	it('writes minutes and seconds, hours when needed', () => {
		expect(formatDuration(450)).toBe('7:30');
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(3720)).toBe('1:02:00');
	});

	it('round-trips through parseDuration', () => {
		for (const seconds of [30, 450, 599, 3600, 3725]) expect(parseDuration(formatDuration(seconds))).toBe(seconds);
	});
});

describe('programLength', () => {
	it('adds what is known and counts the gaps', () => {
		expect(programLength([450, undefined, 600, undefined])).toEqual({ seconds: 1050, known: 2, missing: 2 });
		expect(programLength([])).toEqual({ seconds: 0, known: 0, missing: 0 });
	});

	it('rounds to whole minutes, at least one', () => {
		expect(roundMinutes(1050)).toBe(18);
		expect(roundMinutes(10)).toBe(1);
	});
});

describe('startTimes', () => {
	it('add up the pieces before, until one has no duration', () => {
		expect(startTimes([300, 450, undefined, 600])).toEqual([0, 300, 750, undefined]);
		expect(startTimes([])).toEqual([]);
	});
});

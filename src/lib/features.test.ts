import { describe, expect, it } from 'vitest';
import { ALL_ON, featureOfPath, resolveFeatures } from './features.ts';

describe('resolveFeatures', () => {
	it('has everything on by default, except what a deployment must turn on itself', () => {
		expect(resolveFeatures()).toEqual({ features: { ...ALL_ON, tickets: false }, unknown: [] });
	});

	it('turns on what FEATURES_ON or the preset names, and FEATURES_OFF wins', () => {
		expect(resolveFeatures({}, '', 'Karten').features.tickets).toBe(true);
		expect(resolveFeatures({ tickets: true }).features.tickets).toBe(true);
		expect(resolveFeatures({}, 'karten', 'tickets').features.tickets).toBe(false);
		expect(resolveFeatures({}, '', 'tikets').unknown).toEqual(['tikets']);
	});

	it('turns off what FEATURES_OFF names, by key or German word, on top of the preset', () => {
		const { features, unknown } = resolveFeatures({ offline: false }, 'Leihmaterial, gema;anwesenheit  calendarFeed');
		expect(Object.entries(features).filter(([, on]) => !on).map(([key]) => key).sort()).toEqual(
			['attendance', 'calendarFeed', 'loans', 'musicReport', 'offline', 'tickets'].sort()
		);
		expect(unknown).toEqual([]);
	});

	it('returns words that name no feature', () => {
		expect(resolveFeatures({}, 'leihmaterial, gemma').unknown).toEqual(['gemma']);
	});
});

describe('featureOfPath', () => {
	it('knows the pages and files of each feature', () => {
		expect(featureOfPath('/leihmaterial')).toBe('loans');
		expect(featureOfPath('/wuensche')).toBe('wishes');
		expect(featureOfPath('/kalender/abc.ics')).toBe('calendarFeed');
		expect(featureOfPath('/kalender/abc/anwesenheit')).toBe('attendance');
		expect(featureOfPath('/kalender/abc/anwesenheit/__data.json')).toBe('attendance');
		expect(featureOfPath('/kalender/abc/musikfolge.csv')).toBe('musicReport');
		for (const path of ['/kalender/abc/karten', '/einlass/abc', '/karte/xyz', '/api/karten/abc', '/api/einlass/abc']) {
			expect(featureOfPath(path)).toBe('tickets');
		}
	});

	it('leaves every other page alone', () => {
		for (const path of ['/', '/kalender', '/kalender/abc', '/kalender/abc/drucken', '/leihmaterialien', '/stuecke/wuensche', '/kartei']) {
			expect(featureOfPath(path)).toBeUndefined();
		}
	});
});

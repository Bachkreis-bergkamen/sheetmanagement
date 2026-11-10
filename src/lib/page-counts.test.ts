import { describe, expect, it } from 'vitest';
import { daysBefore, isPageRoute } from './page-counts.ts';

describe('isPageRoute', () => {
	it('takes the app’s route patterns', () => {
		for (const route of ['/', '/stuecke/[id]', '/kalender/[id]/anwesenheit', '/einstellungen/tabelle/datenbank', '/kalender/[id=ics]']) expect(isPageRoute(route)).toBe(true);
	});

	it('refuses addresses, search, the API and anything long or odd', () => {
		for (const route of ['stuecke', '/stuecke?q=bach', '/api/suche', '/<script>', '/' + 'a'.repeat(80), 42, null, '/Stücke']) expect(isPageRoute(route)).toBe(false);
	});
});

describe('daysBefore', () => {
	it('counts back across months and years', () => {
		expect(daysBefore('2026-11-08', 30)).toBe('2026-10-09');
		expect(daysBefore('2026-01-05', 10)).toBe('2025-12-26');
	});
});

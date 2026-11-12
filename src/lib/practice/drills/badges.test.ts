import { describe, expect, it } from 'vitest';
import { badgeProgress, badgesFor, newBadges } from './badges.ts';
import { noteId } from './decks.ts';
import { emptyData, readData, type DrillData } from './progress.ts';

const secure = { box: 5, due: 99, seen: 6, right: 6, times: [800] };
const slow = { box: 5, due: 99, seen: 6, right: 6, times: [9000] };
const withItems = (ids: string[], state = secure): DrillData => ({ ...emptyData(), items: Object.fromEntries(ids.map((id) => [id, state])) });
const byId = (instrument: Parameters<typeof badgesFor>[0], id: string) => badgesFor(instrument).find((badge) => badge.id === id)!;

describe('badgesFor', () => {
	it('gives each of the instrument’s clefs its own badges', () => {
		const ids = badgesFor('cello').map((badge) => badge.id);
		expect(ids).toEqual(expect.arrayContaining(['staff:bass', 'staff:tenor', 'staff:treble', 'ledger:bass']));
		expect(badgesFor('violin').some((badge) => badge.id === 'staff:bass')).toBe(false);
	});

	it('has transposing badges only for instruments that transpose', () => {
		expect(badgesFor('trumpet').map((badge) => badge.id)).toEqual(expect.arrayContaining(['trans:trumpet', 'parts:trumpet']));
		expect(badgesFor('violin').some((badge) => badge.id.startsWith('trans:') || badge.id.startsWith('parts:'))).toBe(false);
		expect(byId('violin', 'keys:sharps').need).toBe(7);
	});
});

describe('earning badges', () => {
	it('needs every item secure: right and fast', () => {
		const staff = byId('violin', 'staff:treble');
		const nine = Array.from({ length: 9 }, (_, i) => noteId('treble', i));
		expect(badgeProgress(staff, withItems(nine.slice(0, 7)), 'violin', 0)).toBe(7);
		expect(newBadges([staff], withItems(nine.slice(0, 8)), 'violin', 0)).toEqual([]);
		expect(newBadges([staff], withItems(nine), 'violin', 0)).toEqual(['staff:treble']);
		// Right but slow isn't secure yet.
		expect(newBadges([staff], withItems(nine, slow), 'violin', 0)).toEqual([]);
	});

	it('counts levels and days in a row', () => {
		const badges = badgesFor('violin');
		const data = { ...emptyData(), settings: { sight: { violin: { level: 4, good: 0, poor: 0 } } } };
		expect(newBadges(badges, data, 'violin', 7)).toEqual(['sight:violin:4', 'streak:7']);
	});

	it('keeps a badge once earned', () => {
		const staff = byId('violin', 'staff:treble');
		expect(newBadges([staff], { ...emptyData(), badges: { 'staff:treble': '2026-11-12' } }, 'violin', 0)).toEqual([]);
		expect(readData({ badges: { 'staff:treble': '2026-11-12', broken: 3, odd: 'yesterday' } }).badges).toEqual({ 'staff:treble': '2026-11-12' });
	});
});

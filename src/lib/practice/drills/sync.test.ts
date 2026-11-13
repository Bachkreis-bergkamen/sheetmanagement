import { describe, expect, it } from 'vitest';
import { emptyData, readData, type DrillData } from './progress.ts';
import { mergeData, sharedCopy, withDevice } from './sync.ts';

const item = (seen: number, due: number, box = 2) => ({ box, due, seen, right: seen, times: [900] });
const data = (change: Partial<DrillData>): DrillData => ({ ...emptyData(), ...change });

describe('merging progress from two devices', () => {
	it('keeps what was practised on either', () => {
		const phone = data({ items: { a: item(5, 10), b: item(1, 3) }, days: { '2026-11-12': { answers: 9, right: 8, ms: 9000 } }, opened: ['bass'] });
		const laptop = data({ items: { a: item(3, 12), c: item(2, 4) }, days: { '2026-11-12': { answers: 4, right: 4, ms: 5000 }, '2026-11-13': { answers: 2, right: 1, ms: 2000 } }, opened: ['tenor'] });
		const merged = mergeData(phone, laptop);
		expect(merged.items).toEqual({ a: item(5, 10), b: item(1, 3), c: item(2, 4) });
		expect(merged.days['2026-11-12'].answers).toBe(9);
		expect(Object.keys(merged.days).sort()).toEqual(['2026-11-12', '2026-11-13']);
		expect(merged.opened.sort()).toEqual(['bass', 'tenor']);
	});

	it('is the same whichever side merges, and merging again changes nothing', () => {
		const a = data({ items: { x: item(2, 5), y: item(4, 9) }, badges: { first: '2026-11-10' }, unlocked: ['notes'], changed: 10 });
		const b = data({ items: { x: item(3, 4) }, badges: { first: '2026-11-08', ear: '2026-11-12' }, unlocked: ['keys'], changed: 20 });
		const ab = mergeData(a, b);
		const ba = mergeData(b, a);
		expect(ab.items).toEqual(ba.items);
		expect(ab.badges).toEqual({ first: '2026-11-08', ear: '2026-11-12' });
		expect(ab.badges).toEqual(ba.badges);
		expect(ab.unlocked?.sort()).toEqual(['keys', 'notes']);
		expect(mergeData(ab, b)).toEqual(ab);
	});

	it('takes the choices changed last, but the higher level and a placement once taken', () => {
		const old = data({ settings: { instrument: 'viola', sound: false, placed: '2026-11-01', sight: { viola: { level: 4, good: 1, poor: 0 } } }, changed: 100 });
		const fresh = data({ settings: { instrument: 'cello', sight: { viola: { level: 2, good: 0, poor: 0 }, cello: { level: 3, good: 0, poor: 0 } } }, changed: 200 });
		const merged = mergeData(old, fresh);
		expect(merged.settings.instrument).toBe('cello');
		expect(merged.settings.sound).toBe(false);
		expect(merged.settings.placed).toBe('2026-11-01');
		expect(merged.settings.sight).toEqual({ viola: { level: 4, good: 1, poor: 0 }, cello: { level: 3, good: 0, poor: 0 } });
		expect(merged.changed).toBe(200);
	});

	it('keeps the newer reflection', () => {
		const a = data({ reflection: { day: '2026-11-12', text: 'Altschlüssel' } });
		const b = data({ reflection: { day: '2026-11-13', text: 'Terzen' } });
		expect(mergeData(a, b).reflection?.text).toBe('Terzen');
		expect(mergeData(b, a).reflection?.text).toBe('Terzen');
	});

	it('drops what came before a reset, on whichever side it was', () => {
		const before = data({ items: { a: item(9, 30) }, days: { '2026-11-01': { answers: 50, right: 40, ms: 60_000 } }, unsent: 30 });
		const reset = data({ since: 5000, unlocked: [] });
		expect(mergeData(before, reset)).toEqual({ ...reset, unsent: 30 });
		expect(mergeData(reset, before)).toEqual(reset);
		// Practice after the reset counts again.
		const after = data({ since: 5000, items: { b: item(1, 2) } });
		expect(mergeData(reset, after).items).toEqual({ b: item(1, 2) });
	});

	it('leaves what belongs to this device on it', () => {
		const local = data({ settings: { tapOffset: 40, sound: true }, unsent: 120 });
		const copy = sharedCopy(local);
		expect(copy.settings).toEqual({ sound: true });
		expect(copy.unsent).toBe(0);
		expect(withDevice(mergeData(local, data({ settings: { tapOffset: -80 }, changed: 9 })), local).settings.tapOffset).toBe(40);
		expect(withDevice(copy, local)).toEqual(local);
	});

	it('reads back the reset and change times', () => {
		expect(readData({ since: 5000, changed: 6000 })).toMatchObject({ since: 5000, changed: 6000 });
		expect(readData({ since: 'x', changed: -1 })).not.toHaveProperty('since');
	});
});

import { describe, expect, it } from 'vitest';
import * as t from '#lib/i18n/texts.ts';
import type { Badge } from '#lib/practice/drills/badges.ts';
import { profile } from '#lib/practice/drills/instruments.ts';
import type { PlacementResult } from '#lib/practice/drills/placement.ts';
import { emptyData } from '#lib/practice/drills/progress.ts';
import type { States } from '#lib/practice/drills/scheduler.ts';
import { STAGES, type CardState, type DrillCard } from '#lib/practice/drills/progression.ts';
import {
	badgeName,
	cardOf,
	currentStage,
	dailyPlan,
	drillOrders,
	keepPractised,
	KINDS,
	nextDailyStep,
	placeInto,
	previewClef,
	previewNotes,
	shownKinds,
	stageList,
	treeSeconds,
	warmupScale
} from './hub.ts';

const item = (due: number) => ({ box: 3, due, seen: 1, right: 1, times: [900] });
/** Only these drills open; `progression` alone opens those that need nothing too. */
const open = (...open: DrillCard[]) =>
	Object.fromEntries(STAGES.flat().map((card) => [card, { open: open.includes(card), needs: [] }])) as unknown as Record<DrillCard, CardState>;

describe('cardOf and keepPractised', () => {
	it('knows the drill an item belongs to', () => {
		expect(cardOf('notes:treble:3')).toBe('notes');
		expect(cardOf('keys:2:minor')).toBe('keys');
		expect(cardOf('nothing:1')).toBeNull();
	});

	it('keeps open the drills practised before progression came in, once', () => {
		const drills = { ...emptyData(), items: { 'keys:0:major': item(1) }, settings: { sight: { violin: { level: 2, good: 0, poor: 0 } } } };
		keepPractised(drills);
		expect(drills.unlocked).toEqual(['keys', 'sight']);
		drills.unlocked = [];
		keepPractised(drills);
		expect(drills.unlocked).toEqual([]);
	});

	it('doesn’t count sight-reading as practised when the placement test set its level', () => {
		const drills = { ...emptyData(), settings: { placed: '2026-11-01', sight: { violin: { level: 2, good: 0, poor: 0 } } } };
		keepPractised(drills);
		expect(drills.unlocked).toEqual([]);
	});
});

describe('drillOrders and shownKinds', () => {
	it('reads notes in each clef, and has no items for melodies', () => {
		const orders = drillOrders(['bass', 'tenor'], 'cello');
		expect(orders.notes.some((id) => id.includes('bass'))).toBe(true);
		expect(orders.notes.some((id) => id.includes('tenor'))).toBe(true);
		expect(orders.sight).toEqual([]);
		expect(orders.mix.length).toBeGreaterThan(orders.notes.length);
	});

	it('shows transposing, scales and tuning only where there are any, and melodies only where read', () => {
		const orders = drillOrders(['treble'], 'violin');
		const shown = (kinds: typeof KINDS) => kinds.map((each) => each.kind);
		expect(shown(shownKinds(orders, true))).toEqual(KINDS.map((each) => each.kind).filter((kind) => kind !== 'trans' || orders.trans.length));
		const none = { ...orders, trans: [], scale: [], tune: [] };
		expect(shown(shownKinds(none, false))).not.toEqual(expect.arrayContaining(['trans', 'scale', 'tune', 'sight', 'entry']));
		expect(shown(shownKinds(none, false))).toContain('notes');
	});
});

describe('previews', () => {
	it('shows transposing in treble clef, the rest in the clef read first, spelt in the key', () => {
		expect(previewClef('trans', 'bass')).toBe('treble');
		expect(previewClef('notes', 'bass')).toBe('bass');
		expect(previewNotes('scale', 'treble')).toHaveLength(3);
		expect(previewNotes('rhythm', 'treble')).toEqual([]);
		// Two sharps, D major: the C in the bass clef's second space is a C sharp, the A in treble isn't.
		expect(previewNotes('mix', 'bass')[0]).toMatchObject({ step: 0, alter: 1 });
		expect(previewNotes('mix', 'treble')[0]).toMatchObject({ step: 5, alter: 0 });
	});
});

describe('stages', () => {
	it('lists the stages with drills shown, counting those open, the daily round on top once featured', () => {
		const cards = open('notes', 'mix');
		const stages = stageList(KINDS, cards, false);
		expect(stages.map((stage) => stage.number)).toEqual(STAGES.map((_, i) => i));
		expect(stages[0].open).toBe(1);
		const featured = stageList(KINDS, cards, true);
		expect(featured.flatMap((stage) => stage.shown.map((each) => each.kind))).not.toContain('mix');
	});

	it('works in the last stage with a drill open', () => {
		expect(currentStage(stageList(KINDS, open('notes'), false))).toBe(0);
		const later = STAGES.findIndex((stage) => stage.includes('sight'));
		expect(currentStage(stageList(KINDS, open('notes', 'sight'), false))).toBe(later);
	});
});

describe('the daily round', () => {
	it('warms up with a scale and reads a melody only once those are open', () => {
		expect(dailyPlan(open(), 'scale:x')).toEqual(['review', 'done']);
		expect(dailyPlan(open('scale', 'sight'), 'scale:x')).toEqual(['warmup', 'review', 'sight', 'done']);
		expect(dailyPlan(open('scale'), null)).toEqual(['review', 'done']);
	});

	it('goes on step by step, and ends', () => {
		const steps = dailyPlan(open('scale', 'sight'), 'scale:x');
		expect(nextDailyStep(steps, 'warmup')).toBe('review');
		expect(nextDailyStep(steps, 'sight')).toBe('done');
		expect(nextDailyStep(steps, 'done')).toBe('done');
	});

	it('warms up with the most overdue scale met, else the first new one', () => {
		const order = ['scale:a', 'scale:b', 'scale:c'];
		expect(warmupScale(order, { 'scale:c': item(4), 'scale:b': item(2) })).toBe('scale:b');
		expect(warmupScale(order, {})).toBe('scale:a');
		expect(warmupScale([], {})).toBeNull();
	});
});

describe('placeInto', () => {
	const prof = profile('violin');
	const orders = drillOrders(['treble'], 'violin');
	const result = (more: Partial<PlacementResult> = {}): PlacementResult =>
		({ states: { 'notes:treble:0': item(5) }, opened: ['treble'], expert: false, sightLevel: 3, entryLevel: 2, skills: [], ...more }) as PlacementResult;

	it('adds what was found, never over progress there is, and where melodies start', () => {
		const drills = { ...emptyData(), items: { 'notes:treble:0': item(99) } as States };
		placeInto(drills, result({ states: { 'notes:treble:0': item(5), 'notes:treble:1': item(5) } }), { prof, instrument: 'violin', orders, day: 1, today: '2026-11-21' });
		expect(drills.items['notes:treble:0'].due).toBe(99);
		expect(drills.items['notes:treble:1'].due).toBe(5);
		expect(drills.opened).toEqual(['treble']);
		expect(drills.settings).toMatchObject({ placed: '2026-11-21', sight: { violin: { level: 3 } }, entry: { violin: { level: 2 } } });
	});

	it('keeps a sight-reading level already reached', () => {
		const drills = { ...emptyData(), settings: { sight: { violin: { level: 6, good: 1, poor: 0 } } } };
		placeInto(drills, result(), { prof, instrument: 'violin', orders, day: 1 });
		expect(drills.settings.sight?.violin?.level).toBe(6);
	});

	it('opens everything for a professional, the rest counted as mastered', () => {
		const drills = emptyData();
		placeInto(drills, result({ expert: true }), { prof, instrument: 'violin', orders, day: 1 });
		expect(drills.unlocked).toEqual(expect.arrayContaining(STAGES.flat()));
		expect(orders.keys.every((id) => drills.items[id])).toBe(true);
		expect(drills.opened).toEqual(expect.arrayContaining(prof.clefs));
	});
});

describe('badgeName and treeSeconds', () => {
	it('names a badge by what it stands for', () => {
		const badge = (kind: Badge['kind']) => ({ id: 'x', group: 'read', kind, items: [], need: 1 }) as Badge;
		expect(badgeName(badge({ type: 'staff', clef: 'bass' }))).toBe(t.drills.badges.staff(t.drills.clefs.bass));
		expect(badgeName(badge({ type: 'streak', days: 7 }))).toBe(t.drills.badges.streak(7));
		expect(badgeName(badge({ type: 'rhythm' }))).toBe(t.drills.badges.rhythm);
	});

	it('grows the tree with what was sent and, with practice time on, what waits to be', () => {
		expect(treeSeconds(100, 20, 5, true)).toBe(125);
		expect(treeSeconds(100, 20, 5, false)).toBe(120);
		expect(treeSeconds(null, 0, 5, true)).toBe(5);
	});
});

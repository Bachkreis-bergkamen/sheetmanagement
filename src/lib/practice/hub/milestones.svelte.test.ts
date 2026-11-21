import { describe, expect, it } from 'vitest';
import type { Badge } from '#lib/practice/drills/badges.ts';
import { STAGES, type CardState, type DrillCard } from '#lib/practice/drills/progression.ts';
import { Milestones, type Standing } from './milestones.svelte.ts';

const badge = (id: string) => ({ id, group: 'read', kind: { type: 'rhythm' }, items: [], need: 1 }) as Badge;
const BADGES = [badge('a'), badge('b')];
const standing = (open: DrillCard[], clefs: Standing['clefs'], earned: Record<string, string> = {}, shown: DrillCard[] = ['notes', 'keys', 'ear']): Standing => ({
	clefs,
	unlocked: open,
	cards: Object.fromEntries(STAGES.flat().map((card) => [card, { open: open.includes(card), needs: [] }])) as unknown as Record<DrillCard, CardState>,
	shown,
	badges: BADGES,
	earned
});

describe('Milestones', () => {
	it('celebrates the clef, drills and badges that opened during the round', () => {
		let now = standing(['notes'], ['treble'], { a: '2026-11-01' });
		const milestones = new Milestones(() => now);
		milestones.remember();
		now = standing(['notes', 'keys', 'ear'], ['treble', 'alto'], { a: '2026-11-01', b: '2026-11-21' });
		milestones.announce();
		expect(milestones.clef).toBe('alto');
		expect(milestones.cards).toEqual(['keys', 'ear']);
		expect(milestones.badges.map((each) => each.id)).toEqual(['b']);
	});

	it('only announces drills this instrument shows', () => {
		let now = standing(['notes'], ['treble']);
		const milestones = new Milestones(() => now);
		milestones.remember();
		now = standing(['notes', 'keys', 'trans'], ['treble']);
		milestones.announce();
		expect(milestones.cards).toEqual(['keys']);
	});

	it('forgets the last celebration when the next round starts', () => {
		let now = standing([], ['treble']);
		const milestones = new Milestones(() => now);
		milestones.remember();
		now = standing(['notes'], ['treble', 'bass'], { a: 'x' });
		milestones.announce();
		milestones.remember();
		expect(milestones).toMatchObject({ clef: null, cards: [], badges: [] });
		milestones.announce();
		expect(milestones.cards).toEqual([]);
	});
});

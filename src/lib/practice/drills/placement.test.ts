import { describe, expect, it } from 'vitest';
import { EAR_ORDER, KEY_ORDER, notesOrder } from './decks.ts';
import { profile } from './instruments.ts';
import { makePlacement, nextProbe, placementResult, progress, recordProbe, type Placement } from './placement.ts';
import { seeded } from './sight.ts';

/** Answer the test as a player who knows `known` items, right and fast; everything else wrong. */
function take(placement: Placement, known: (id: string) => boolean, slow = () => false) {
	const random = seeded(1);
	const asked: string[] = [];
	for (let id = nextProbe(placement, random); id; id = nextProbe(placement, random)) {
		asked.push(id);
		recordProbe(placement, id, known(id), slow() ? 9000 : 900);
		if (asked.length > 200) throw new Error('The test never ends');
	}
	return asked;
}

describe('the placement test', () => {
	it('ends soon for a beginner, having asked a little of each skill', () => {
		const placement = makePlacement(profile('violin'));
		const asked = take(placement, () => false);
		expect(asked.map((id) => id.split(':')[0])).toEqual(['notes', 'keys', 'ear']);
		const result = placementResult(placement, 100, seeded(2));
		expect(result.states).toEqual({});
		expect(result.sightLevel).toBe(1);
		expect(result.entryLevel).toBe(1);
		expect(progress(placement)).toBe(1);
	});

	it('climbs through everything for someone who knows it all, in a few minutes', () => {
		const placement = makePlacement(profile('violin'));
		const asked = take(placement, () => true);
		// About 3 probes per band: well under fifty questions.
		expect(asked.length).toBeLessThan(50);
		const result = placementResult(placement, 100, seeded(2));
		for (const id of [...notesOrder('treble'), ...KEY_ORDER, ...EAR_ORDER]) expect(result.states[id], id).toMatchObject({ box: 3, seen: 1 });
		expect(result.sightLevel).toBe(7);
		expect(result.opened).toEqual(['treble']);
	});

	it('stops a skill at the first band not known', () => {
		const placement = makePlacement(profile('violin'));
		// Knows keys with up to two accidentals (majors and minors), not more.
		const twoAccidentals = new Set(KEY_ORDER.slice(0, 10));
		take(placement, (id) => !id.startsWith('keys') || twoAccidentals.has(id));
		const result = placementResult(placement, 100, seeded(2));
		const keys = result.skills.find((each) => each.skill.kind === 'keys')!;
		expect(keys.passed).toBe(2);
		expect(result.states[KEY_ORDER[9]]).toBeDefined();
		expect(result.states[KEY_ORDER[10]]).toBeUndefined();
		expect(result.sightLevel).toBe(3);
	});

	it('takes right but slow as not known yet', () => {
		const placement = makePlacement(profile('violin'));
		take(placement, () => true, () => true);
		expect(placementResult(placement, 100).states).toEqual({});
	});

	it('tests a cello’s tenor clef only once its bass clef reads well', () => {
		const beginner = makePlacement(profile('cello'));
		const asked = take(beginner, (id) => !id.startsWith('notes'));
		expect(asked.some((id) => id.startsWith('notes:tenor'))).toBe(false);

		const reader = makePlacement(profile('cello'));
		const all = take(reader, (id) => !id.startsWith('notes:treble'));
		expect(all.some((id) => id.startsWith('notes:tenor'))).toBe(true);
		const result = placementResult(reader, 100);
		expect(result.opened).toEqual(['bass', 'tenor']);
	});

	it('spreads the known items over the next days, never today', () => {
		const placement = makePlacement(profile('flute'));
		take(placement, () => true);
		const due = Object.values(placementResult(placement, 100, seeded(3)).states).map((state) => state.due);
		expect(Math.min(...due)).toBeGreaterThanOrEqual(101);
		expect(Math.max(...due)).toBeLessThanOrEqual(104);
		expect(new Set(due).size).toBeGreaterThan(1);
	});

	it('keeps sight-reading easy while only the landmark notes are known', () => {
		const placement = makePlacement(profile('violin'));
		const landmarks = new Set(notesOrder('treble').slice(0, 5));
		take(placement, (id) => !id.startsWith('notes') || landmarks.has(id));
		expect(placementResult(placement, 100).sightLevel).toBe(2);
	});
});

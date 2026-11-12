import { EAR_ORDER, FLUENT_MS, KEY_ORDER, kindOf, notesOrder } from './decks.ts';
import type { InstrumentProfile } from './instruments.ts';
import { median, type ItemState, type States } from './scheduler.ts';
import { MAX_LEVEL } from './sight.ts';
import type { Clef } from './theory.ts';
import { MAX_ENTRY_LEVEL } from './together.ts';

/**
 * The placement test (#300): a few minutes on first use, so an experienced player doesn't start
 * at middle C and C major. Each skill's items are cut into bands of growing difficulty, in the
 * order they're learnt; the test climbs them, a few probes a band. A band whose probes all come
 * right and fast is known, and the next is tried; the first one that isn't ends that skill.
 * Known items are then put on the schedule as known but to be checked soon, so a lucky guess
 * shows up within days; nothing is marked mastered by the test alone.
 */

export type PlacementSkill = { kind: 'notes'; clef: Clef } | { kind: 'keys' } | { kind: 'ear' };

interface Part {
	skill: PlacementSkill;
	bands: string[][];
	/** Probes asked per band. */
	probes: number;
	/** Bands known so far, and the band being probed. */
	passed: number;
	asked: { id: string; correct: boolean; ms: number }[];
	done: boolean;
}

export interface Placement {
	parts: Part[];
	/** Index of the part being tested. */
	at: number;
}

/** Cut `order` into bands of these sizes, the last taking what's left. */
function cut(order: string[], sizes: number[]): string[][] {
	const bands: string[][] = [];
	let from = 0;
	for (const size of sizes) {
		if (from >= order.length) break;
		bands.push(order.slice(from, from + size));
		from += size;
	}
	if (from < order.length) bands[bands.length - 1].push(...order.slice(from));
	return bands;
}

/**
 * The test for an instrument: note reading in its first clef, then (for each further clef, once
 * the one before it is read well) in that clef; keys; intervals. Notes: the landmark notes, the
 * rest of the staff, the first ledger lines, the farther ones. Keys: by accidentals, majors before
 * minors. Intervals: the distinct ones, then together, then the easily confused.
 */
export function makePlacement(instrument: InstrumentProfile): Placement {
	const clefs = instrument.clefs.filter((clef) => instrument.range[clef]);
	return {
		parts: [
			...clefs.map((clef) => ({ skill: { kind: 'notes', clef } as const, bands: cut(notesOrder(clef), [5, 4, 6, 6]), probes: 3, passed: 0, asked: [], done: false })),
			{ skill: { kind: 'keys' }, bands: cut(KEY_ORDER, [5, 5, 4, 4, 6, 6]), probes: 3, passed: 0, asked: [], done: false },
			{ skill: { kind: 'ear' }, bands: cut(EAR_ORDER, [6, 6, 6, 6]), probes: 2, passed: 0, asked: [], done: false }
		],
		at: 0
	};
}

const fast = (answer: { id: string; correct: boolean; ms: number }) => answer.correct && answer.ms <= FLUENT_MS[kindOf(answer.id)];

/** The answers in the band being probed. */
const current = (part: Part) => part.asked.filter((answer) => part.bands[part.passed]?.includes(answer.id));

/** The next item to ask, or null when the test is over. */
export function nextProbe(placement: Placement, random: () => number = Math.random): string | null {
	while (placement.at < placement.parts.length) {
		const part = placement.parts[placement.at];
		// A further clef is tested only if the one before it was read beyond the landmarks.
		const before = placement.parts[placement.at - 1];
		if (!part.done && part.skill.kind === 'notes' && before?.skill.kind === 'notes' && before.passed < 2) part.done = true;
		if (!part.done) {
			const band = part.bands[part.passed];
			const asked = new Set(current(part).map((answer) => answer.id));
			const left = band.filter((id) => !asked.has(id));
			if (left.length) return left[Math.floor(random() * left.length)];
			part.done = true;
		}
		placement.at++;
	}
	return null;
}

/** An answer to the probe asked; moves the test on. */
export function recordProbe(placement: Placement, id: string, correct: boolean, ms: number) {
	const part = placement.parts[placement.at];
	if (!part || part.done) return;
	part.asked.push({ id, correct, ms });
	const band = current(part);
	const wrong = band.filter((answer) => !fast(answer)).length;
	if (wrong) {
		// Not known right and fast: this skill starts here.
		part.done = true;
	} else if (band.length >= Math.min(part.probes, part.bands[part.passed].length)) {
		part.passed++;
		if (part.passed >= part.bands.length) part.done = true;
	}
}

/** How far through the test, 0 to 1, for a progress bar. */
export function progress(placement: Placement): number {
	const total = placement.parts.reduce((sum, part) => sum + part.bands.length, 0);
	const done = placement.parts.reduce((sum, part) => sum + (part.done ? part.bands.length : part.passed), 0);
	return total ? done / total : 1;
}

export interface PlacementResult {
	/** Items to put on the schedule, as known. */
	states: States;
	/** Clefs read well enough to open on the ladder. */
	opened: Clef[];
	/** Bands known of each skill. */
	skills: { skill: PlacementSkill; passed: number; bands: number }[];
	sightLevel: number;
	entryLevel: number;
}

/**
 * What the test found. Known items come back within the next few days (spread out, so they
 * don't all fall on one), each with the typical time of the test's answers. Sight-reading starts
 * at a level matching the keys and notes read: no harder than the keys allow, no harder than two
 * if only the staff's landmarks are known.
 */
export function placementResult(placement: Placement, day: number, random: () => number = Math.random): PlacementResult {
	const states: States = {};
	const opened: Clef[] = [];
	for (const part of placement.parts) {
		const times = part.asked.filter(fast).map((answer) => Math.round(answer.ms));
		const typical = times.length ? Math.round(median(times)) : FLUENT_MS[part.skill.kind];
		for (const id of part.bands.slice(0, part.passed).flat()) {
			const state: ItemState = { box: 3, due: day + 1 + Math.floor(random() * 4), seen: 1, right: 1, times: [typical] };
			states[id] = state;
		}
		if (part.skill.kind === 'notes' && part.passed >= 2) opened.push(part.skill.clef);
	}
	const passed = (kind: PlacementSkill['kind']) => Math.max(0, ...placement.parts.filter((part) => part.skill.kind === kind).map((part) => part.passed));
	const keys = passed('keys');
	const notes = passed('notes');
	// Keys passed: 0, then the majors with up to 2, their minors, up to 4 majors, minors, 5 to 7.
	const byKeys = [1, 2, 3, 4, 5, 6, 7][keys];
	const sightLevel = Math.min(MAX_LEVEL, byKeys, notes < 2 ? 2 : MAX_LEVEL);
	return {
		states,
		opened,
		skills: placement.parts.map((part) => ({ skill: part.skill, passed: part.passed, bands: part.bands.length })),
		sightLevel,
		entryLevel: Math.min(MAX_ENTRY_LEVEL, Math.max(1, sightLevel - 1))
	};
}

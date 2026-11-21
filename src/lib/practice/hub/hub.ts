import * as t from '#lib/i18n/texts.ts';
import type { IconName } from '#lib/components/Icon.svelte';
import { EAR_DECK, FLUENT_MS, interleave, KEY_ORDER, kindOf, notesOrder, playOrder, transOrder } from '#lib/practice/drills/decks.ts';
import type { InstrumentProfile, ProfileId } from '#lib/practice/drills/instruments.ts';
import { masteredState, type PlacementResult } from '#lib/practice/drills/placement.ts';
import { dayKey, type DrillData } from '#lib/practice/drills/progress.ts';
import { STAGES, type CardState, type DrillCard } from '#lib/practice/drills/progression.ts';
import { PULSE_ORDER, RHYTHM_ORDER } from '#lib/practice/drills/rhythm.ts';
import { scaleOrder } from '#lib/practice/drills/scales.ts';
import type { States } from '#lib/practice/drills/scheduler.ts';
import type { Badge } from '#lib/practice/drills/badges.ts';
import { tuneOrder } from '#lib/practice/drills/together.ts';
import { alterInKey, pitchAt, type Clef, type Pitch } from '#lib/practice/drills/theory.ts';

/** The drills of the Übebereich, each a card on the page. */
export type Kind = DrillCard;

/** The drill card an item belongs to. */
export const cardOf = (id: string): DrillCard | null => {
	const kind = kindOf(id) as string;
	return (STAGES.flat() as string[]).includes(kind) ? (kind as DrillCard) : null;
};

/** Progress from before progression came in: the drills practised then stay open. */
export function keepPractised(drills: DrillData) {
	if (drills.unlocked) return;
	drills.unlocked = STAGES.flat().filter((card) =>
		card === 'sight' || card === 'entry' ? !!drills.settings[card] && !drills.settings.placed : Object.keys(drills.items).some((id) => cardOf(id) === card)
	);
}

/** Each drill's questions in order, for the instrument and the clefs read. */
export function drillOrders(clefs: Clef[], instrument: ProfileId): Record<Kind, string[]> {
	const notes = interleave(...clefs.map(notesOrder));
	return {
		mix: interleave(notes, KEY_ORDER, EAR_DECK),
		notes,
		keys: KEY_ORDER,
		ear: EAR_DECK,
		rhythm: RHYTHM_ORDER,
		pulse: PULSE_ORDER,
		play: interleave(...clefs.map((clef) => playOrder(instrument, clef))),
		scale: scaleOrder(instrument),
		// Sight-reading and entries have no items: every melody is new.
		sight: [],
		entry: [],
		tune: tuneOrder(instrument),
		trans: transOrder(instrument)
	};
}

/** Drills where notes are played: the range is asked for first, once per instrument, where it can grow. */
export const PLAYED: Kind[] = ['play', 'scale', 'sight', 'entry', 'tune'];

export const KINDS: { kind: Kind; icon: IconName }[] = [
	{ kind: 'mix', icon: 'sparkle' },
	{ kind: 'notes', icon: 'note' },
	{ kind: 'keys', icon: 'tag' },
	{ kind: 'ear', icon: 'headphones' },
	{ kind: 'rhythm', icon: 'activity' },
	{ kind: 'pulse', icon: 'clock' },
	{ kind: 'play', icon: 'gauge' },
	{ kind: 'scale', icon: 'music' },
	{ kind: 'sight', icon: 'eye' },
	{ kind: 'entry', icon: 'users' },
	{ kind: 'tune', icon: 'sliders' },
	{ kind: 'trans', icon: 'refresh' }
];

/**
 * The drills for this instrument: transposing only for instruments that transpose or read
 * parts in other keys; scales, tuning and sight-reading only for those that play them.
 */
export const shownKinds = (orders: Record<Kind, string[]>, readsMelodies: boolean) =>
	KINDS.filter(({ kind }) =>
		kind === 'sight' || kind === 'entry' ? readsMelodies : (kind !== 'trans' && kind !== 'scale' && kind !== 'tune') || orders[kind].length
	);

/**
 * A small picture for each card, as staff positions (0 the bottom line, 8 the top), so the
 * notes sit on the staff in whichever clef is shown; spelt in the key, as the drill would.
 */
export const PREVIEW: Record<Kind, { fifths?: number; positions?: number[]; together?: boolean }> = {
	mix: { fifths: 2, positions: [3] },
	notes: { positions: [2] },
	keys: { fifths: -3 },
	ear: { positions: [1, 5] },
	rhythm: {},
	pulse: {},
	sight: {},
	entry: {},
	tune: { positions: [1, 3, 5], together: true },
	play: { positions: [5] },
	scale: { fifths: 1, positions: [2, 3, 4] },
	trans: { positions: [4] }
};

/** Transposing is read in treble clef; every other picture in the clef the member reads first. */
export const previewClef = (kind: Kind, firstClef: Clef): Clef => (kind === 'trans' ? 'treble' : firstClef);

export function previewNotes(kind: Kind, firstClef: Clef): Pitch[] {
	const { positions = [], fifths = 0 } = PREVIEW[kind];
	return positions.map((position) => {
		const pitch = pitchAt(previewClef(kind, firstClef), position);
		return { ...pitch, alter: alterInKey(pitch.step, fifths) };
	});
}

export type Stage = { number: number; shown: typeof KINDS; open: number };

/**
 * Each stage with its drills for this instrument and how many are open, for the strip and the
 * headings; the daily round, once `featured`, has its own card on top, not one in its stage.
 */
export const stageList = (kinds: typeof KINDS, cards: Record<DrillCard, CardState>, featured: boolean): Stage[] =>
	STAGES.map((stage, number) => {
		const shown = kinds.filter(({ kind }) => (stage as string[]).includes(kind) && !(kind === 'mix' && featured));
		return { number, shown, open: shown.filter(({ kind }) => cards[kind].open).length };
	}).filter((stage) => stage.shown.length);

/** The stage the member is working in: the last one with a drill open. */
export const currentStage = (stages: Stage[]) => stages.reduce((at, stage) => (stage.open ? stage.number : at), 0);

/**
 * The daily round (#315): about five minutes, the daily goal, made of what's due. A scale to
 * warm up over a drone, once scales are open; the notes, keys and intervals due for review;
 * one new melody at sight, once sight-reading is open; and a line for what was hard. Short,
 * mixed and regular, as spacing research suggests.
 */
export type DailyStep = 'warmup' | 'review' | 'sight' | 'done';

/** Questions in the review step: with a warm-up and a melody around it, fewer than a full round. */
export const DAILY_REVIEW = 8;

export const dailyPlan = (cards: Record<DrillCard, CardState>, warmup: string | null): DailyStep[] => [
	...(cards.scale.open && warmup ? (['warmup'] as const) : []),
	'review',
	...(cards.sight.open ? (['sight'] as const) : []),
	'done'
];

export const nextDailyStep = (steps: DailyStep[], step: DailyStep): DailyStep => steps[steps.indexOf(step) + 1] ?? 'done';

/** The scale to warm up with: the one most overdue among those met, else the next new one. */
export const warmupScale = (order: string[], items: States): string | null =>
	order.filter((id) => items[id]).sort((a, b) => items[a].due - items[b].due)[0] ?? order[0] ?? null;

/**
 * What the placement test found, into the member's progress: known items they haven't met
 * yet (never over progress they have), clefs to open, and where sight-reading and entries
 * start (only if not started yet). A professional gets every drill and clef open, and what the
 * test didn't ask counted as mastered too.
 */
export function placeInto(
	drills: DrillData,
	result: PlacementResult,
	{ prof, instrument, orders, day, today = dayKey() }: { prof: InstrumentProfile; instrument: ProfileId; orders: Record<Kind, string[]>; day: number; today?: string }
) {
	for (const [id, state] of Object.entries(result.states)) drills.items[id] ??= state;
	drills.opened = [...new Set([...drills.opened, ...result.opened])];
	if (result.expert) {
		const all = [...prof.clefs.flatMap((clef) => [...notesOrder(clef), ...playOrder(instrument, clef)]), ...Object.values(orders).flat()];
		for (const id of new Set(all)) drills.items[id] ??= masteredState(day, FLUENT_MS[kindOf(id)] * 0.6);
		drills.opened = [...new Set([...drills.opened, ...prof.clefs])];
		drills.unlocked = [...new Set([...(drills.unlocked ?? []), ...STAGES.flat()])];
	}
	const level = (value: number) => ({ level: value, good: 0, poor: 0 });
	drills.settings = {
		...drills.settings,
		placed: today,
		sight: { ...drills.settings.sight, [instrument]: drills.settings.sight?.[instrument] ?? level(result.sightLevel) },
		entry: { ...drills.settings.entry, [instrument]: drills.settings.entry?.[instrument] ?? level(result.entryLevel) }
	};
}

/** A badge's name, from what it stands for. */
export function badgeName(badge: Badge): string {
	const bx = t.drills.badges;
	const kind = badge.kind;
	switch (kind.type) {
		case 'staff':
			return bx.staff(t.drills.clefs[kind.clef]);
		case 'ledger':
			return bx.ledger(t.drills.clefs[kind.clef]);
		case 'keys':
			return bx.keys[kind.set];
		case 'ear':
			return bx.ear(kind.harmonic);
		case 'trans':
			return bx.trans(kind.parts);
		case 'sight':
			return bx.sight(kind.level);
		case 'streak':
			return bx.streak(kind.days);
		case 'scales':
			return bx.scales(kind.octaves);
		default:
			return bx[kind.type];
	}
}

/**
 * The practice tree's time as it stands: the total from the server, with what this visit has
 * sent since and what's still waiting to be sent, so it grows as the member practises.
 */
export const treeSeconds = (server: number | null | undefined, sent: number, unsent: number, practising: boolean) =>
	(server ?? 0) + sent + (practising ? unsent : 0);

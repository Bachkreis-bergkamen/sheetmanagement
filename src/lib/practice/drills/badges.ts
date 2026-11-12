import { CHORD_ORDER, EAR_ORDER, FLUENT_MS, KEY_ORDER, keyId, kindOf, noteId, notesOrder, playOrder, transOrder } from './decks.ts';
import { profile, type ProfileId } from './instruments.ts';
import type { DrillData } from './progress.ts';
import { PULSE_ORDER, RHYTHM_ORDER } from './rhythm.ts';
import { OCTAVES, scaleOrder, type Octaves } from './scales.ts';
import { isMastered } from './scheduler.ts';
import { MAX_LEVEL } from './sight.ts';
import { MAX_ENTRY_LEVEL, tuneOrder } from './together.ts';
import type { Clef } from './theory.ts';

/**
 * Badges in the Übebereich (#300): each stands for something the member can now do, not for
 * points. A set of items all secure (right and fast, as the scheduler counts mastery), a level
 * reached in sight-reading or entries, or regular practice. Rewards that mark competence support
 * motivation; rewards for mere activity tend to crowd it out (Deci, Koestner & Ryan 1999). Once
 * earned, a badge stays, even if a note slips back after a pause.
 */

export type BadgeGroup = 'read' | 'hear' | 'play' | 'steady';

export type BadgeKind =
	| { type: 'staff'; clef: Clef }
	| { type: 'ledger'; clef: Clef }
	| { type: 'keys'; set: 'sharps' | 'flats' | 'minor' }
	| { type: 'ear'; harmonic: boolean }
	| { type: 'chords' }
	| { type: 'rhythm' }
	| { type: 'pulse' }
	| { type: 'play' }
	| { type: 'scales'; octaves: Octaves }
	| { type: 'trans'; parts: boolean }
	| { type: 'tune' }
	| { type: 'sight'; level: number }
	| { type: 'entry'; level: number }
	| { type: 'streak'; days: number };

export interface Badge {
	id: string;
	group: BadgeGroup;
	kind: BadgeKind;
	/** Items that must all be secure; none for a level or a streak. */
	items: string[];
	/** How many there are to reach: items, a level, days. */
	need: number;
}

/** Levels of sight-reading worth a badge: halfway, and the top. */
const SIGHT_LEVELS = [Math.ceil(MAX_LEVEL / 2), MAX_LEVEL];
const STREAKS = [7, 30];
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const items = (id: string, group: BadgeGroup, kind: BadgeKind, list: string[]): Badge[] => (list.length ? [{ id, group, kind, items: list, need: list.length }] : []);

/** The badges for an instrument, in the order they're usually earned within each group. */
export function badgesFor(instrument: ProfileId): Badge[] {
	const { clefs } = profile(instrument);
	const trans = transOrder(instrument);
	return [
		...clefs.flatMap((clef) => [
			...items(`staff:${clef}`, 'read', { type: 'staff', clef }, range(0, 8).map((position) => noteId(clef, position))),
			...items(`ledger:${clef}`, 'read', { type: 'ledger', clef }, notesOrder(clef))
		]),
		...items('keys:sharps', 'read', { type: 'keys', set: 'sharps' }, range(1, 7).map((fifths) => keyId(fifths, 'major'))),
		...items('keys:flats', 'read', { type: 'keys', set: 'flats' }, range(1, 7).map((fifths) => keyId(-fifths, 'major'))),
		...items('keys:minor', 'read', { type: 'keys', set: 'minor' }, KEY_ORDER.filter((id) => id.endsWith(':minor'))),
		...items('ear:melodic', 'hear', { type: 'ear', harmonic: false }, EAR_ORDER.filter((id) => id.endsWith(':melodic'))),
		...items('ear:harmonic', 'hear', { type: 'ear', harmonic: true }, EAR_ORDER.filter((id) => id.endsWith(':harmonic'))),
		...items('chords', 'hear', { type: 'chords' }, CHORD_ORDER),
		...items('rhythm', 'hear', { type: 'rhythm' }, RHYTHM_ORDER),
		...items('pulse', 'hear', { type: 'pulse' }, PULSE_ORDER),
		...items(`play:${instrument}`, 'play', { type: 'play' }, clefs.flatMap((clef) => playOrder(instrument, clef))),
		// One octave keeps the id it had before scales went over more octaves, so it stays earned.
		...OCTAVES.flatMap((octaves) =>
			items(octaves === 1 ? `scales:${instrument}` : `scales${octaves}:${instrument}`, 'play', { type: 'scales', octaves }, scaleOrder(instrument, octaves))
		),
		...items(`trans:${instrument}`, 'play', { type: 'trans', parts: false }, trans.filter((id) => id.includes(':concert:'))),
		...items(`parts:${instrument}`, 'play', { type: 'trans', parts: true }, trans.filter((id) => !id.includes(':concert:'))),
		...items(`tune:${instrument}`, 'play', { type: 'tune' }, tuneOrder(instrument)),
		...SIGHT_LEVELS.map((level): Badge => ({ id: `sight:${instrument}:${level}`, group: 'play', kind: { type: 'sight', level }, items: [], need: level })),
		{ id: `entry:${instrument}`, group: 'play', kind: { type: 'entry', level: MAX_ENTRY_LEVEL }, items: [], need: MAX_ENTRY_LEVEL },
		...STREAKS.map((days): Badge => ({ id: `streak:${days}`, group: 'steady', kind: { type: 'streak', days }, items: [], need: days }))
	];
}

/** How far along a badge is: secure items, the level reached, or days in a row. */
export function badgeProgress(badge: Badge, data: DrillData, instrument: ProfileId, streakDays: number): number {
	const { kind } = badge;
	if (kind.type === 'sight') return Math.min(badge.need, data.settings.sight?.[instrument]?.level ?? 0);
	if (kind.type === 'entry') return Math.min(badge.need, data.settings.entry?.[instrument]?.level ?? 0);
	if (kind.type === 'streak') return Math.min(badge.need, streakDays);
	return badge.items.filter((id) => isMastered(data.items[id], FLUENT_MS[kindOf(id)])).length;
}

/**
 * Badges reached now and not earned before, with the day: to add to `data.badges` and to
 * celebrate. A badge whose progress later slips stays earned.
 */
export function newBadges(badges: Badge[], data: DrillData, instrument: ProfileId, streakDays: number): string[] {
	const earned = data.badges ?? {};
	return badges.filter((badge) => !earned[badge.id] && badgeProgress(badge, data, instrument, streakDays) >= badge.need).map((badge) => badge.id);
}

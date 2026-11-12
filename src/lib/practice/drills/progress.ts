import type { ProfileId } from './instruments.ts';
import type { States } from './scheduler.ts';
import { MAX_LEVEL, type SightLevel } from './sight.ts';
import { MAX_ENTRY_LEVEL } from './together.ts';
import { CLEFS, type Clef } from './theory.ts';

/**
 * What the Übebereich keeps on the device (#300): every item's progress, and per day how much
 * was practised. Nothing of it is sent anywhere.
 */

export interface DayStats {
	answers: number;
	right: number;
	/** Time spent answering, in milliseconds. */
	ms: number;
}

export interface DrillSettings {
	instrument?: ProfileId;
	clef?: Clef;
	sound?: boolean;
	/** Milliseconds from a click to a tap on this device, measured once for the rhythm drill. */
	tapOffset?: number;
	/** Scales: a drone under them, the metronome, and the cents kept back until the end. */
	drone?: 'off' | 'tonic' | 'fifth';
	click?: boolean;
	hideCents?: boolean;
	/** Sight-reading: the level per instrument, and bars disappearing just before they're played. */
	sight?: Partial<Record<ProfileId, SightLevel>>;
	readAhead?: boolean;
	/** Playing together: the entries' level per instrument, and a second voice under sight-reading. */
	entry?: Partial<Record<ProfileId, SightLevel>>;
	duet?: boolean;
	/** The placement test: the day it was taken, or "skipped" when the member started from the beginning. */
	placed?: string;
}

/** Levels per instrument read back, anything malformed dropped. */
function readLevels(value: unknown, max: number): Partial<Record<ProfileId, SightLevel>> {
	const levels: Partial<Record<ProfileId, SightLevel>> = {};
	for (const [id, state] of Object.entries(value && typeof value === 'object' ? value : {})) {
		if (state && Number.isInteger(state.level) && state.level >= 1 && state.level <= max) {
			levels[id as ProfileId] = { level: state.level, good: state.good | 0, poor: state.poor | 0 };
		}
	}
	return levels;
}

export interface DrillData {
	version: 1;
	items: States;
	/** By local date, "2026-11-11". */
	days: Record<string, DayStats>;
	settings: DrillSettings;
	/** Clefs opened on the ladder (#300); they stay open. */
	opened: Clef[];
	/** Seconds of practice not yet counted for the practice tree (offline, or the request failed). */
	unsent: number;
}

export const emptyData = (): DrillData => ({ version: 1, items: {}, days: {}, settings: {}, opened: [], unsent: 0 });

/** Data read back from storage, with anything malformed dropped. */
export function readData(value: unknown): DrillData {
	const data = emptyData();
	if (!value || typeof value !== 'object') return data;
	const raw = value as Partial<DrillData>;
	for (const [id, state] of Object.entries(raw.items ?? {})) {
		if (state && Number.isInteger(state.box) && Number.isFinite(state.due) && Array.isArray(state.times)) {
			data.items[id] = { box: state.box, due: state.due, seen: state.seen | 0, right: state.right | 0, times: state.times.filter(Number.isFinite) };
		}
	}
	for (const [day, stats] of Object.entries(raw.days ?? {})) {
		if (/^\d{4}-\d{2}-\d{2}$/.test(day) && stats && Number.isFinite(stats.answers)) data.days[day] = { answers: stats.answers | 0, right: stats.right | 0, ms: stats.ms | 0 };
	}
	if (raw.settings && typeof raw.settings === 'object') {
		data.settings = { ...raw.settings };
		const offset = raw.settings.tapOffset;
		if (offset !== undefined && !(Number.isFinite(offset) && Math.abs(offset) <= 250)) delete data.settings.tapOffset;
		if (!['off', 'tonic', 'fifth', undefined].includes(raw.settings.drone)) delete data.settings.drone;
		if (raw.settings.sight !== undefined) data.settings.sight = readLevels(raw.settings.sight, MAX_LEVEL);
		if (raw.settings.entry !== undefined) data.settings.entry = readLevels(raw.settings.entry, MAX_ENTRY_LEVEL);
	}
	if (Array.isArray(raw.opened)) data.opened = raw.opened.filter((clef): clef is Clef => (CLEFS as readonly string[]).includes(clef));
	if (Number.isFinite(raw.unsent) && raw.unsent! > 0) data.unsent = Math.min(MAX_UNSENT, Math.round(raw.unsent!));
	return data;
}

/** At most this much kept waiting for the tree: a few days offline, not a tab left open for weeks. */
export const MAX_UNSENT = 3 * 3600;

/** The local date, "2026-11-11". */
export const dayKey = (date = new Date()) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function addAnswer(days: Record<string, DayStats>, day: string, correct: boolean, ms: number): Record<string, DayStats> {
	const today = days[day] ?? { answers: 0, right: 0, ms: 0 };
	// A question left open while away doesn't count as an hour of practice.
	return { ...days, [day]: { answers: today.answers + 1, right: today.right + (correct ? 1 : 0), ms: today.ms + Math.min(ms, 60_000) } };
}

/**
 * Days in a row with practice, up to today. One day off in between doesn't break it (a rest day
 * is part of good practice, and a streak lost to one missed day discourages more than it
 * motivates); two in a row do. Today not practised yet doesn't break it either.
 */
export function streak(days: Record<string, DayStats>, today = new Date()): number {
	let count = 0;
	let missed = 0;
	const date = new Date(today);
	for (let i = 0; i < 400; i++) {
		const practised = (days[dayKey(date)]?.answers ?? 0) > 0;
		if (practised) {
			count++;
			missed = 0;
		} else if (i > 0 && ++missed >= 2) break;
		date.setDate(date.getDate() - 1);
	}
	return count;
}

/** A daily goal in minutes, not points: short and regular beats long and rare. */
export const DAILY_GOAL_MINUTES = 5;

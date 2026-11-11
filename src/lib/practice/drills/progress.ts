import type { ProfileId } from './instruments.ts';
import type { States } from './scheduler.ts';
import type { Clef } from './theory.ts';

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

export interface DrillData {
	version: 1;
	items: States;
	/** By local date, "2026-11-11". */
	days: Record<string, DayStats>;
	settings: { instrument?: ProfileId; clef?: Clef; sound?: boolean };
}

export const emptyData = (): DrillData => ({ version: 1, items: {}, days: {}, settings: {} });

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
	if (raw.settings && typeof raw.settings === 'object') data.settings = { ...raw.settings };
	return data;
}

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

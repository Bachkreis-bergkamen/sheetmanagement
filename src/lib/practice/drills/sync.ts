import type { ProfileId } from './instruments.ts';
import type { Reach } from './reach.ts';
import type { ItemState } from './scheduler.ts';
import type { SightLevel } from './sight.ts';
import type { DayStats, DrillData, DrillSettings } from './progress.ts';

/**
 * The Übebereich's progress on more than one device: each keeps its own copy, the server keeps
 * one per account, and copies are merged rather than replaced, so practice on a phone that was
 * offline isn't lost when the laptop saved something meanwhile. Merging is the same on the
 * device and on the server, and merging twice changes nothing.
 *
 * What was practised only grows: an item seen more often, a day with more answers, a clef or
 * drill opened, a badge earned, a note reached. Choices (instrument, clef, sound) come from the copy changed
 * last. A reset starts over everywhere: a copy from before it is dropped.
 */

/** At most this much JSON from a device; a member's whole progress is far less. */
export const MAX_SYNC_BYTES = 512 * 1024;

/** What stays on the device and never goes to the server or another device. */
const DEVICE_SETTINGS = ['tapOffset'] as const satisfies (keyof DrillSettings)[];

/** The copy that goes to the server: without what belongs to this device alone. */
export function sharedCopy(data: DrillData): DrillData {
	const settings = { ...data.settings };
	for (const key of DEVICE_SETTINGS) delete settings[key];
	return { ...data, settings, unsent: 0 };
}

/** `merged` with this device's own part of `local` back in. */
export function withDevice(merged: DrillData, local: DrillData): DrillData {
	const settings = { ...merged.settings };
	for (const key of DEVICE_SETTINGS) {
		if (local.settings[key] === undefined) delete settings[key];
		else (settings as Record<string, unknown>)[key] = local.settings[key];
	}
	return { ...merged, settings, unsent: local.unsent };
}

/** The item practised more; on a tie the one due later (it was answered better). */
function laterItem(a: ItemState, b: ItemState): ItemState {
	if (a.seen !== b.seen) return a.seen > b.seen ? a : b;
	return b.due > a.due ? b : a;
}

/** The day with more answers counted, whole: its skills belong to its totals. */
const fullerDay = (a: DayStats, b: DayStats) => (b.answers > a.answers || (b.answers === a.answers && b.ms > a.ms) ? b : a);

/** The higher level per instrument; on the same level the one further along it. */
function higherLevels(a: DrillSettings['sight'], b: DrillSettings['sight']): DrillSettings['sight'] {
	if (!a || !b) return a ?? b;
	const levels: Partial<Record<ProfileId, SightLevel>> = { ...a };
	for (const [id, level] of Object.entries(b) as [ProfileId, SightLevel][]) {
		const mine = levels[id];
		if (!mine || level.level > mine.level || (level.level === mine.level && level.good > mine.good)) levels[id] = level;
	}
	return levels;
}

/**
 * The wider range per instrument, edge by edge: a note reached on one device is reached. Each
 * edge keeps the tries of the copy it came from; on the same edge, `newer`'s.
 */
function widerReach(a: DrillSettings['reach'], b: DrillSettings['reach'], newer: DrillSettings['reach']): DrillSettings['reach'] {
	if (!a || !b) return a ?? b;
	const reach: Partial<Record<ProfileId, Reach>> = { ...a };
	for (const [id, theirs] of Object.entries(b) as [ProfileId, Reach][]) {
		const mine = reach[id];
		if (!mine) {
			reach[id] = theirs;
			continue;
		}
		const first = newer === b ? theirs : mine;
		const second = first === theirs ? mine : theirs;
		const low = second.low < first.low ? second : first;
		const high = second.high > first.high ? second : first;
		const tried = { ...(low.tried?.low ? { low: low.tried.low } : {}), ...(high.tried?.high ? { high: high.tried.high } : {}) };
		reach[id] = { low: low.low, high: high.high, ...(tried.low || tried.high ? { tried } : {}) };
	}
	return reach;
}

function mergeRecords<T>(a: Record<string, T>, b: Record<string, T>, pick: (a: T, b: T) => T): Record<string, T> {
	const merged = { ...a };
	for (const [key, value] of Object.entries(b)) merged[key] = key in merged ? pick(merged[key], value) : value;
	return merged;
}

const union = <T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined => (a || b ? [...new Set([...(a ?? []), ...(b ?? [])])] : undefined);

/**
 * Two copies of the same member's progress as one. `a` is this side's copy (the device's, or
 * the server's), whose `unsent` time stays; ties go to it.
 */
export function mergeData(a: DrillData, b: DrillData): DrillData {
	const sinceA = a.since ?? 0;
	const sinceB = b.since ?? 0;
	// Reset on one side after the other last saw it: what came before the reset is gone.
	if (sinceA !== sinceB) return sinceA > sinceB ? a : { ...b, unsent: a.unsent };

	const newer = (b.changed ?? 0) > (a.changed ?? 0) ? b : a;
	const older = newer === a ? b : a;
	const settings: DrillSettings = { ...older.settings, ...newer.settings };
	const sight = higherLevels(a.settings.sight, b.settings.sight);
	const entry = higherLevels(a.settings.entry, b.settings.entry);
	if (sight) settings.sight = sight;
	if (entry) settings.entry = entry;
	const reach = widerReach(a.settings.reach, b.settings.reach, newer.settings.reach);
	if (reach) settings.reach = reach;
	// The placement test, once taken or skipped, isn't offered again on another device.
	const placed = a.settings.placed ?? b.settings.placed;
	if (placed) settings.placed = placed;

	const badges = a.badges || b.badges ? mergeRecords(a.badges ?? {}, b.badges ?? {}, (x, y) => (y < x ? y : x)) : undefined;
	const reflection = !a.reflection || !b.reflection ? (a.reflection ?? b.reflection) : b.reflection.day > a.reflection.day ? b.reflection : a.reflection.day > b.reflection.day ? a.reflection : newer.reflection;

	const merged: DrillData = {
		version: 1,
		items: mergeRecords(a.items, b.items, laterItem),
		days: mergeRecords(a.days, b.days, fullerDay),
		settings,
		opened: union(a.opened, b.opened)!,
		unsent: a.unsent
	};
	const unlocked = union(a.unlocked, b.unlocked);
	if (unlocked) merged.unlocked = unlocked;
	if (badges) merged.badges = badges;
	if (reflection) merged.reflection = reflection;
	if (a.since) merged.since = a.since;
	const changed = Math.max(a.changed ?? 0, b.changed ?? 0);
	if (changed) merged.changed = changed;
	return merged;
}

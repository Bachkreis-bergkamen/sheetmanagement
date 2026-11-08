import { t } from '#lib/i18n/index.ts';
import { normalize } from './sheet.ts';

/** How urgent a scan is: for gaps in "Fehlende Stimmen" and for reports handed to the scanning team. */
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** "hoch" (or "high", "High") as a priority; anything else is none. */
export function parsePriority(value: string | undefined): Priority | undefined {
	const word = normalize(value ?? '');
	if (!word) return undefined;
	return PRIORITIES.find((priority) => normalize(t.sheetValues.priority[priority]) === word || priority === word);
}

/** Sorts by priority, high first; none after low. */
export const priorityRank = (priority: Priority | undefined) => (priority ? PRIORITIES.indexOf(priority) : PRIORITIES.length);

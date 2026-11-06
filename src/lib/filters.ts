/**
 * Filters for a list (the archive's pieces, the calendar's dates), several at once: within a
 * group any chosen option may match ("A-Orchester" or "Ehemalige"), across groups all must
 * ("Ehemalige" and "Mit Lücken"). The same rules count what each option would leave, so the
 * panel can say so before it's tapped.
 */

export interface FilterOption<T> {
	value: string;
	label: string;
	test: (item: T) => boolean;
}

export interface FilterGroup<T> {
	key: string;
	label: string;
	options: FilterOption<T>[];
}

/** Whether an item passes the chosen options: one per group that has any chosen. */
export function passes<T>(item: T, groups: FilterGroup<T>[], chosen: readonly string[]): boolean {
	return groups.every((group) => {
		const picked = group.options.filter((option) => chosen.includes(option.value));
		return !picked.length || picked.some((option) => option.test(item));
	});
}

export function applyFilters<T>(items: readonly T[], groups: FilterGroup<T>[], chosen: readonly string[]): T[] {
	return items.filter((item) => passes(item, groups, chosen));
}

/** How many items there'd be with this option chosen too (or as they are, when it already is). */
export function countWith<T>(items: readonly T[], groups: FilterGroup<T>[], chosen: readonly string[], value: string): number {
	const next = chosen.includes(value) ? chosen : [...chosen, value];
	return items.reduce((n, item) => n + (passes(item, groups, next) ? 1 : 0), 0);
}

/** Only values some option still has: a filter from an earlier visit may be gone. */
export function known<T>(groups: FilterGroup<T>[], chosen: readonly string[]): string[] {
	const values = new Set(groups.flatMap((group) => group.options.map((option) => option.value)));
	return chosen.filter((value) => values.has(value));
}

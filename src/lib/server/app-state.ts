import { getStore } from './db/index.ts';

/**
 * The app's own small settings, kept as JSON under a key in the store rather than in the
 * sheet: what is published, music-list scopes, invitation links.
 */

/**
 * What is kept under `key`, checked by `accept`; `accept(undefined)` when nothing is kept or
 * it doesn't parse. A store that can't be read throws, so a change saved after it never
 * replaces what it couldn't see; readers that only show the value catch that themselves.
 */
export async function readState<T>(key: string, accept: (value: unknown) => T): Promise<T> {
	const text = await getStore().getState(key);
	let value: unknown;
	try {
		value = text ? JSON.parse(text) : undefined;
	} catch {
		value = undefined;
	}
	return accept(value);
}

export const writeState = (key: string, value: unknown): Promise<void> => getStore().setState(key, JSON.stringify(value));

export const stringsIn = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

export const recordIn = <T>(value: unknown): Record<string, T> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {});

/** An object of these entries in key order, so the stored text only changes with its content. */
export const sortedByKey = <T>(entries: Iterable<[string, T]>): Record<string, T> => Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));

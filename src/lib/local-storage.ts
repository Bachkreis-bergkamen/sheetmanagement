/**
 * Small choices remembered in this browser. Storage can be blocked (private mode, a setting)
 * or full, and doesn't exist on the server: then nothing is remembered and nothing breaks.
 */

/** What is kept under `key`; null when nothing is, undefined when storage can't be read at all. */
export function readLocal(key: string): string | null | undefined {
	try {
		return localStorage.getItem(key);
	} catch {
		return undefined;
	}
}

/** What is kept under `key` as JSON; undefined when nothing is, or it can't be read. */
export function readLocalJson(key: string): unknown {
	try {
		const text = localStorage.getItem(key);
		return text === null ? undefined : JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** Keeps `value` under `key`, or with null forgets it. Returns whether that worked. */
export function writeLocal(key: string, value: string | null): boolean {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

export const writeLocalJson = (key: string, value: unknown): boolean => writeLocal(key, JSON.stringify(value));

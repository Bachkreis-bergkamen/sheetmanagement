import { describe, expect, it } from 'vitest';
import * as de from './de/index.ts';
import * as en from './en/index.ts';
import type { Texts } from './types.ts';

// Every area in English too: a module missing from en/index.ts fails the type check here (#356).
const complete: Texts = en;

/** Every text as a string: functions are called with sample arguments of their kind. */
function strings(value: unknown, path = ''): [string, string][] {
	if (typeof value === 'string') return [[path, value]];
	if (typeof value === 'function') {
		// Numbers and words alternating, then only words, then lists of words ("Nicht umbenannt: …").
		const n = value.length;
		const tries = [
			Array.from({ length: n }, (_, i) => (i % 2 ? 'Beispiel' : 2)),
			Array.from({ length: n }, () => 'Beispiel'),
			Array.from({ length: n }, () => ['Beispiel'])
		];
		for (const args of tries) {
			try {
				return strings(value(...args), path);
			} catch {
				// Try the next kind of arguments.
			}
		}
		return [];
	}
	if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
	if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
	return [];
}

/** Names that keep their spelling in English. */
const ALLOWED = /Bärenreiter|Beispiel|Härtel/g;

describe('English texts (#124)', () => {
	it('have no German letters or words left', () => {
		const german = strings(complete)
			.filter(([, text]) => /[äöüÄÖÜß„]|\b(und|nicht|bitte|oder|wird)\b/i.test(text.replace(ALLOWED, '')))
			.map(([path, text]) => `${path}: ${text}`);
		expect(german).toEqual([]);
	});

	it('have the same texts as German, none left empty where German has words', () => {
		const english = new Map(strings(complete));
		const missing = strings(de)
			.filter(([path, text]) => text.trim() && !english.get(path)?.trim())
			.map(([path]) => path);
		expect(missing).toEqual([]);
	});
});

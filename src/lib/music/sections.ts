/**
 * Most piece folders hold one set of parts. Some hold several in subfolders:
 * a symphony with a folder per movement ("1er Satz", "4ter Satz"), or the parts the
 * orchestra plays directly in the folder plus the complete work in "Komplett".
 * Each set is a section, shown as its own tab on the piece page.
 */

/**
 * Labels in natural order ("Violine 2" before "Violine 10"). One shared collator: localeCompare
 * with options builds a new one on every call, which made a catalog cost ~70 ms of CPU (#69).
 */
export const byLabel = new Intl.Collator('de', { numeric: true });

export type SectionKind =
	/** The files directly in the piece folder, next to subfolders: what is played. */
	| 'played'
	/** One movement, e.g. "1er Satz". */
	| 'movement'
	/** The complete work, e.g. "Komplett". */
	| 'complete'
	/** Any other subfolder, shown by its name. */
	| 'other';

export interface SectionName {
	label: string;
	kind: SectionKind;
	movement?: number;
}

const MOVEMENT = [/^\s*(\d+)\s*(?:\.|er|ter|te|tr|r)?\s*satz\b/i, /\bsatz\s*(\d+)\b/i, /^\s*(\d+)\s*(?:\.|er|ter)?\s*mov(?:ement)?\b/i, /\bmov(?:ement)?\s*(\d+)\b/i];
const COMPLETE = /\b(komplett|vollständig|gesamt|gesamtausgabe|complete|full)\b/i;

/** "1er Satz" → "1. Satz", "Komplett" → "Komplett", anything else stays as it is. */
export function sectionName(folderName: string): SectionName {
	const name = folderName.trim();
	for (const pattern of MOVEMENT) {
		const number = Number(pattern.exec(name)?.[1]);
		if (number) return { label: `${number}. Satz`, kind: 'movement', movement: number };
	}
	if (COMPLETE.test(name)) return { label: 'Komplett', kind: 'complete' };
	return { label: name, kind: 'other' };
}

/**
 * The movement all given file names share, e.g. "Mendelssohn 4 - Satz 2 - Flöte I" → 2.
 * Used to name the played section; undefined when the files don't agree.
 */
export function sharedMovement(fileNames: string[]): number | undefined {
	const numbers = fileNames.map((name) => Number(/\bsatz\s*(\d+)\b/i.exec(name)?.[1]) || undefined);
	const first = numbers[0];
	return first !== undefined && numbers.every((n) => n === first) ? first : undefined;
}

const NUMBER = String.raw`\d{1,2}`;
const JOIN = String.raw`\s*(?:,|&|\+|-|–|\bund\b|\band\b|\bbis\b|\bto\b)\s*`;
const WORD = String.raw`(?:s[aä]tze?|mov(?:ement)?s?\.?)`;
/** "Satz 2", "Sätze 1–3", "movements 2 & 4"; or with the numbers first, the last one an ordinal: "2. Satz", "1. & 3. Satz". */
const MOVEMENTS = new RegExp(
	String.raw`(?<![a-zäöü])${WORD}\s*(${NUMBER}\.?(?:${JOIN}${NUMBER}\.?)*)|((?:\b${NUMBER}\.?${JOIN})*\b${NUMBER}(?:\.|er|ter|te|st|nd|rd|th))\s*${WORD}(?![a-zäöü])`,
	'i'
);
const RANGE = /-|–|bis|to/i;

/**
 * The movements a programme row's note names (#361): "2. Satz" → [2], "Sätze 1–3" → [1, 2, 3],
 * "1. & 4. Satz, ohne Wiederholung" → [1, 4]. Empty when it names none: the whole piece.
 * "2 Sätze" is a count, not a movement.
 */
export function movementsIn(note: string | undefined): number[] {
	const match = note ? MOVEMENTS.exec(note) : null;
	if (!match) return [];
	const found = new Set<number>();
	let last: number | undefined;
	let range = false;
	for (const token of (match[1] ?? match[2]).split(/(\d{1,2})/)) {
		if (!/^\d/.test(token)) {
			range = RANGE.test(token);
			continue;
		}
		const number = Number(token);
		if (range && last !== undefined) for (let n = Math.min(last, number); n <= Math.max(last, number); n++) found.add(n);
		found.add(number);
		last = number;
	}
	found.delete(0);
	return [...found].sort((a, b) => a - b);
}

/** The note with these movements named in it, in place of the ones it named: [2, 4] → "2. & 4. Satz"; none: the whole piece. */
export function withMovements(note: string, movements: number[]): string {
	const rest = note
		.replace(MOVEMENTS, '')
		.replace(/^[\s,;·–-]+|[\s,;·–-]+$/g, '')
		.replace(/\s{2,}/g, ' ');
	const sorted = [...new Set(movements)].sort((a, b) => a - b);
	const named = sorted.length ? `${sorted.map((n) => `${n}.`).join(' & ')} Satz` : '';
	return [named, rest].filter(Boolean).join(', ');
}

/** Played first, then movements in order, other folders by name, the complete work last. */
export function compareSections(a: SectionName, b: SectionName): number {
	const rank = { played: 0, movement: 1, other: 2, complete: 3 } as const;
	return (
		rank[a.kind] - rank[b.kind] ||
		(a.movement ?? 0) - (b.movement ?? 0) ||
		byLabel.compare(a.label, b.label)
	);
}

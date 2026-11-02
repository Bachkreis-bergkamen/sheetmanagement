import type { OrchestraConfig } from '#lib/config/index.ts';
import { instrumentLabel } from './instrument-label.ts';
import { matchParts, type InstrumentChoice } from './my-parts.ts';
import { createInstrumentMatcher, parsePartName, type InstrumentMatcher } from './part-name.ts';
import type { Part } from './types.ts';

/**
 * A piece's Besetzung (#249): the instruments its score is written for, kept as text in the
 * piece's row ("Flöte 1 & 2; Oboe; Geige 1 & 2") and read from the names at the left of the
 * score's first system. Compared with the parts in Drive, it tells a missing part from one
 * the piece simply doesn't have.
 */

/**
 * The words scores use, mostly Italian, in the singular and plural, as the instrument names the
 * part names already know. Longest first, so "clarinetto basso" wins over "clarinetto".
 */
const SCORE_WORDS: [RegExp, string][] = (
	[
		['clarinett[oi] bass[oi]|clarinette basse|bass clarinets?', 'Bassklarinette'],
		['corno inglese|cor anglais|english horn', 'Englischhorn'],
		['contrabbass[oi]|contrebasses?|double bass(es)?|contrabass(es)?', 'Kontrabass'],
		['violoncell[oi]|violoncelles?|cellos?|celli', 'Violoncello'],
		['ottavino|piccolo|petite flûte', 'Piccolo'],
		['flaut[oi]|flûtes?|flutes?', 'Flöte'],
		['obo[ei]|hautbois|oboes?', 'Oboe'],
		['clarinett[oi]|clarinettes?|clarinets?', 'Klarinette'],
		['fagott[oi]|bassons?|bassoons?', 'Fagott'],
		['corn[oi]|cors?|horns?', 'Horn'],
		['tromb[ae]|trompettes?|trumpets?', 'Trompete'],
		['trombon[ei]|trombones?', 'Posaune'],
		['timpani|timbales|timpano', 'Pauke'],
		['violin[oi]|violons?|violins?', 'Geige'],
		['viol[ae]|altos?', 'Viola'],
		['bass[oi]', 'Kontrabass'],
		['pianoforte|piano', 'Klavier'],
		['arpa|harpe|harp', 'Harfe'],
		['organo|orgue|organ', 'Orgel'],
		['cembalo|clavecin|harpsichord', 'Cembalo']
	] as const
).map(([words, name]) => [new RegExp(`(?<![\\p{L}])(?:${words})(?![\\p{L}])`, 'giu'), name]);

/** Joiners scores write between instruments: "Violoncello e Basso". */
const JOINER = /\s+(?:e|et|and|und)\s+/gi;

/** "a 2" (two players from one staff) as the part numbers it means. */
const PLAYERS = /\ba\s*([2-4])\b/gi;

export interface ScoredVoice {
	instrument: string;
	/** Part numbers; empty when the instrument has one part. */
	numbers: number[];
}

const matchers = new WeakMap<object, InstrumentMatcher>();
function matcherFor(config: OrchestraConfig): InstrumentMatcher {
	let matcher = matchers.get(config.instruments);
	if (!matcher) {
		matcher = createInstrumentMatcher(config.instruments);
		matchers.set(config.instruments, matcher);
	}
	return matcher;
}

/** A score's or the sheet's name for instruments in the words the part names know. */
function plain(label: string, config: OrchestraConfig): string {
	const known = new Set(config.instruments.map((instrument) => instrument.name));
	let text = label.replace(PLAYERS, (_, count: string) => Array.from({ length: Number(count) }, (_, i) => i + 1).join(' & '));
	for (const [words, name] of SCORE_WORDS) if (known.has(name)) text = text.replace(words, name);
	return text.replace(JOINER, ' & ');
}

/** The voices one name stands for: "Flauto I, II" → Flöte 1 and 2. Scores and reductions aren't voices. */
function voicesOf(label: string, config: OrchestraConfig): ScoredVoice[] {
	const parsed = parsePartName(plain(label, config), 'application/pdf', config.naming, matcherFor(config));
	if (parsed.kind === 'partitur') return [];
	return parsed.voices;
}

/** Voices of one instrument together, numbers merged: "Violino I" and "Violino II" → Geige 1 & 2. */
function merge(voices: ScoredVoice[]): ScoredVoice[] {
	const byInstrument = new Map<string, Set<number>>();
	for (const { instrument, numbers } of voices) {
		const known = byInstrument.get(instrument) ?? new Set<number>();
		for (const number of numbers) known.add(number);
		byInstrument.set(instrument, known);
	}
	return [...byInstrument].map(([instrument, numbers]) => ({ instrument, numbers: [...numbers].sort((a, b) => a - b) }));
}

/** The Besetzung as written in the piece's row; names that aren't instruments are left out. */
export function readInstrumentation(text: string | undefined, config: OrchestraConfig): ScoredVoice[] {
	return merge((text ?? '').split(/[;\n]+/).flatMap((entry) => (entry.trim() ? voicesOf(entry, config) : [])));
}

/**
 * A line as text recognition reads it, with its usual slips undone: "|" and "l" for the Roman
 * I ("Violino |", "Corni 1. Il."), and "a 2" run into the word before ("Oboia 2", "in Ba 2").
 */
export function tidyRecognised(line: string): string {
	return line
		.replace(/\|/g, 'I')
		.replace(/(?<![\p{L}])(?:Il|lI|ll|Ill|lll)(?![\p{L}])/gu, (match) => 'I'.repeat(match.length))
		.replace(/(?<=\p{L}*(?:i|(?<![\p{L}])[A-H]))a\s+([2-4])(?!\d)/gu, ' a $1');
}

/** "Flöte 1 & 2", with the deployment's label for the instrument. */
export function voiceText({ instrument, numbers }: ScoredVoice): string {
	return numbers.length ? `${instrumentLabel(instrument)} ${numbers.join(' & ')}` : instrumentLabel(instrument);
}

/**
 * The Besetzung from the names at the left of a score's first system: tempo words, titles and
 * other text there don't name an instrument and drop out. Empty when no name was found.
 */
export function instrumentationFromScore(labels: string[], config: OrchestraConfig): string {
	return merge(labels.flatMap((label) => voicesOf(label, config)))
		.map(voiceText)
		.join('; ');
}

/**
 * The voices of the Besetzung without a part to play from. A part for several instruments
 * ("Violoncello & Kontrabass") or a shared one ("C-Stimmen") counts for each it covers.
 */
export function missingVoices(voices: ScoredVoice[], parts: Part[], config: OrchestraConfig): ScoredVoice[] {
	const covered = (choice: InstrumentChoice) => {
		const match = matchParts(parts, choice, config);
		return match.own.length > 0 || match.shared.length > 0;
	};
	return voices.flatMap(({ instrument, numbers }) => {
		const missing = numbers.length ? numbers.filter((number) => !covered({ instrument, numbers: [number] })) : covered({ instrument, numbers: [] }) ? [] : [0];
		if (!missing.length) return [];
		return [{ instrument, numbers: missing.filter((number) => number > 0) }];
	});
}

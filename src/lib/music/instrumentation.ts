import type { OrchestraConfig } from '#lib/config/index.ts';
import { instrumentLabel } from './instrument-label.ts';
import { matchParts, playedParts, type InstrumentChoice } from './my-parts.ts';
import { createInstrumentMatcher, parsePartName, type InstrumentMatcher } from './part-name.ts';
import type { Part, PieceDetail } from './types.ts';

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
		['clarinett[oi] (contr)?alt[oi]|clarinette alto|alto clarinets?', 'Altklarinette'],
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
	/** A generic part's instruments: "Percussion 1: Triangel & Becken". */
	holds?: string[];
	/** The soloist, out front: "Solo Geige" beside the section's "Geige 1 & 2". */
	solo?: boolean;
	/** The key its parts are written in, when it isn't the instrument's usual one: "Horn 1 & 2 in Es". */
	key?: string;
}

/** The word for a soloist in the Besetzung, as in the part names ("Solo Geige"). */
const SOLO = 'Solo';

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

/** The key a voice is written in, kept only for an instrument with keys and when it isn't its usual one. */
export function unusualKey(instrument: string, key: string | undefined, config: OrchestraConfig): string | undefined {
	const keys = config.instruments.find((each) => each.name === instrument)?.keys;
	return key && keys?.length && key !== keys[0] ? key : undefined;
}

/** The voices one name stands for: "Flauto I, II" → Flöte 1 and 2. Scores and reductions aren't voices. */
function voicesOf(label: string, config: OrchestraConfig): ScoredVoice[] {
	const parsed = parsePartName(plain(label, config), 'application/pdf', config.naming, matcherFor(config));
	if (parsed.kind === 'partitur') return [];
	// "Percussion 1: Triangel & Becken" is one voice of the Besetzung, not three.
	const holder = parsed.voices.find((voice) => voice.holds?.length);
	const voices = (holder ? [holder] : parsed.voices).map(({ transposition, ...voice }) => {
		const key = unusualKey(voice.instrument, transposition, config);
		return key ? { ...voice, key } : voice;
	});
	return parsed.kind === 'solo' ? voices.map((voice) => ({ ...voice, solo: true })) : voices;
}

/**
 * Voices of one instrument together, numbers merged: "Violino I" and "Violino II" → Geige 1 & 2.
 * A generic part naming its instruments stays apart, its instruments merged instead:
 * "Percussion 1: Triangel" and "Percussion 1: Becken" → Percussion 1: Triangel & Becken.
 */
function merge(voices: ScoredVoice[]): ScoredVoice[] {
	const merged = new Map<string, ScoredVoice>();
	for (const { instrument, numbers, holds, solo, key: written } of voices) {
		// The soloist stays apart from the section of the same instrument, a part in another key too.
		const key = (solo ? 'solo|' : '') + (holds?.length ? `${instrument}|${[...numbers].sort().join(',')}` : instrument) + (written ? `|${written}` : '');
		const known = merged.get(key) ?? {
			instrument,
			numbers: [],
			...(holds?.length ? { holds: [] } : {}),
			...(solo ? { solo } : {}),
			...(written ? { key: written } : {})
		};
		for (const number of numbers) if (!known.numbers.includes(number)) known.numbers.push(number);
		for (const held of holds ?? []) if (!known.holds!.includes(held)) known.holds!.push(held);
		merged.set(key, known);
	}
	return [...merged.values()].map((voice) => ({ ...voice, numbers: voice.numbers.sort((a, b) => a - b) }));
}

/** The Besetzung as written in the piece's row; names that aren't instruments are left out. */
export function readInstrumentation(text: string | undefined, config: OrchestraConfig): ScoredVoice[] {
	return merge((text ?? '').split(/[;\n]+/).flatMap((entry) => (entry.trim() ? voicesOf(entry, config) : [])));
}

/** Entries of the Besetzung that name no instrument the app knows: kept as written when it's edited. */
export function unreadEntries(text: string | undefined, config: OrchestraConfig): string[] {
	return (text ?? '')
		.split(/[;\n]+/)
		.map((entry) => entry.trim())
		.filter((entry) => entry && !voicesOf(entry, config).length);
}

/** The Besetzung written back as the sheet keeps it: "Flöte 1 & 2; Oboe", then what wasn't read. */
export function writeInstrumentation(voices: ScoredVoice[], unread: string[] = []): string {
	return [...merge(voices.filter((voice) => voice.instrument)).map(voiceText), ...unread].join('; ');
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

/** "Flöte 1 & 2", "Horn 1 & 2 in Es", with the deployment's label for the instrument. */
export function voiceText({ instrument, numbers, holds, solo, key }: ScoredVoice): string {
	const name = solo ? `${SOLO} ${instrumentLabel(instrument)}` : instrumentLabel(instrument);
	const text = (numbers.length ? `${name} ${numbers.join(' & ')}` : name) + (key ? ` in ${key}` : '');
	return holds?.length ? `${text}: ${holds.map(instrumentLabel).join(' & ')}` : text;
}

/**
 * One instrument of the Besetzung as the picker shows it: its numbers, and for a generic part
 * the instruments each of them names (number 0: the part without a number).
 */
export interface PickedVoice {
	instrument: string;
	numbers: number[];
	held: Record<number, string[]>;
	/** It has a soloist ("Solo Geige"). */
	solo?: boolean;
	/** With a soloist: the section plays too, also without numbers ("Solo Flöte; Flöte"). */
	tutti?: boolean;
	/** The key, when it isn't the instrument's usual one ("Es" for a horn). */
	key?: string;
}

/** The Besetzung's voices as the picker shows them, one per instrument. */
export function pickedVoices(voices: ScoredVoice[]): PickedVoice[] {
	const picked = new Map<string, PickedVoice>();
	for (const { instrument, numbers, holds, solo, key } of voices) {
		const voice: PickedVoice = picked.get(instrument) ?? { instrument, numbers: [], held: {} };
		if (key && !voice.key) voice.key = key;
		if (solo) {
			voice.solo = true;
			picked.set(instrument, voice);
			continue;
		}
		voice.tutti = true;
		for (const number of numbers) if (!voice.numbers.includes(number)) voice.numbers.push(number);
		if (holds?.length) for (const number of numbers.length ? numbers : [0]) voice.held[number] = [...new Set([...(voice.held[number] ?? []), ...holds])];
		picked.set(instrument, voice);
	}
	return [...picked.values()].map(({ tutti, ...voice }) => ({
		...voice,
		// Only a soloist needs to say whether the section plays too.
		...(voice.solo ? { tutti: !!tutti } : {}),
		numbers: voice.numbers.sort((a, b) => a - b)
	}));
}

/** The picker's voices back as the Besetzung's: a generic part once per number that names instruments. */
export function scoredVoices(picked: PickedVoice[]): ScoredVoice[] {
	return picked.flatMap(({ instrument, numbers, held, solo, tutti, key }): ScoredVoice[] => {
		const keyed = key ? { key } : {};
		const soloist: ScoredVoice[] = solo ? [{ instrument, numbers: [], solo: true, ...keyed }] : [];
		// A soloist alone ("Solo Klavier") unless the section has parts or is said to play.
		if (solo && !tutti && !numbers.length && !held[0]?.length) return soloist;
		const keys = numbers.length ? numbers : [0];
		const naming = keys.filter((number) => held[number]?.length);
		if (!naming.length) return [...soloist, { instrument, numbers: [...numbers], ...keyed }];
		const plain = keys.filter((number) => !naming.includes(number) && number > 0);
		return ([
			...soloist,
			...naming.map((number) => ({ instrument, numbers: number ? [number] : [], holds: [...held[number]], ...keyed })),
			...(plain.length ? [{ instrument, numbers: plain, ...keyed }] : [])
		] as ScoredVoice[]).sort((a, b) => Number(!a.solo) - Number(!b.solo) || (a.numbers[0] ?? 0) - (b.numbers[0] ?? 0));
	});
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
 * The Besetzung from the parts there are, for a piece without a score to read it from: each
 * part's instruments with their numbers, merged ("Flöte 1", "Flöte 2" → Flöte 1 & 2). A generic
 * part keeps what it names ("Percussion 1: Triangel & Becken"); scores, recordings and files
 * without an instrument drop out. Empty when no part names an instrument.
 */
export function instrumentationFromParts(parts: Pick<Part, 'kind' | 'voices'>[]): string {
	const voices = parts.flatMap((part): ScoredVoice[] => {
		if (part.kind === 'partitur' || part.kind === 'audio' || part.kind === 'sonstiges') return [];
		// "Percussion 1: Triangel & Becken" is one voice of the Besetzung, not three.
		const holder = part.voices.find((voice) => voice.holds?.length);
		const own = (holder ? [holder] : part.voices).map(({ instrument, numbers, holds }) => ({ instrument, numbers: [...numbers], ...(holds?.length ? { holds: [...holds] } : {}) }));
		return part.kind === 'solo' ? own.map((voice) => ({ ...voice, solo: true })) : own;
	});
	return merge(voices).map(voiceText).join('; ');
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
	return voices.flatMap(({ instrument, numbers, holds, solo }): ScoredVoice[] => {
		if (solo) {
			// The soloist's own part, or the instrument's only one when the section doesn't play.
			const own = parts.some((part) => part.kind === 'solo' && part.instruments.includes(instrument));
			const alone = !voices.some((voice) => voice.instrument === instrument && !voice.solo) && covered({ instrument, numbers: [] });
			return own || alone ? [] : [{ instrument, numbers: [], solo }];
		}
		const missing = numbers.length ? numbers.filter((number) => !covered({ instrument, numbers: [number] })) : covered({ instrument, numbers: [] }) ? [] : [0];
		if (!missing.length) return [];
		return [{ instrument, numbers: missing.filter((number) => number > 0), ...(holds ? { holds } : {}) }];
	});
}

/**
 * The voices of a piece's Besetzung without a part in the section people play; none for a
 * piece without parts, whose status already says so.
 */
export function unscoredVoices(
	detail: Pick<PieceDetail, 'parts' | 'sections'> | undefined,
	instrumentation: string | undefined,
	config: OrchestraConfig
): ScoredVoice[] {
	if (!detail?.parts.length || !instrumentation?.trim()) return [];
	return missingVoices(readInstrumentation(instrumentation, config), playedParts(detail), config);
}

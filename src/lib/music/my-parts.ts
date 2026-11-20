import type { Instrument, OrchestraConfig } from '#lib/config/index.ts';
import { createInstrumentMatcher, parsePartName, type InstrumentMatcher } from './part-name.ts';
import { instrumentLabel } from './instrument-label.ts';
import { formatNumbers } from './text.ts';
import type { Part, PieceDetail, Section } from './types.ts';

/**
 * Which parts of a piece someone plays from: "Meine Noten" for one member, and the
 * instrumentation check for a whole programme. Both use the instruments and numbers
 * the file-name parser read, plus the orchestra's shared parts (B-Stimmen …).
 */

/** What a member plays, e.g. Geige I & II or Klarinette (any part). */
export interface InstrumentChoice {
	instrument: string;
	/** Part numbers, ascending. Empty: every part of the instrument. */
	numbers: number[];
	/**
	 * For a generic part (Schlagwerk): the instruments this player has and plays, from the
	 * orchestra's instrument sets. Then only their parts reach them; without it, all of them do.
	 */
	plays?: string[];
}

const matchers = new WeakMap<readonly Instrument[], InstrumentMatcher>();
const matcherFor = (config: OrchestraConfig) => {
	let matcher = matchers.get(config.instruments);
	if (!matcher) matchers.set(config.instruments, (matcher = createInstrumentMatcher(config.instruments)));
	return matcher;
};

const ascending = (numbers: number[]) => [...new Set(numbers)].sort((a, b) => a - b);

/**
 * Adds an instrument; the same one twice gets all its numbers, or every part if one entry says so,
 * and everything either plays (or all of it, if one entry has no setup).
 */
function addChoice(choices: InstrumentChoice[], instrument: string, numbers: number[], plays?: string[]) {
	const known = choices.find((choice) => choice.instrument === instrument);
	if (!known) {
		choices.push({ instrument, numbers: ascending(numbers), ...(plays?.length ? { plays: [...new Set(plays)] } : {}) });
		return;
	}
	if (known.numbers.length) known.numbers = numbers.length ? ascending([...known.numbers, ...numbers]) : [];
	if (known.plays) {
		if (plays?.length) known.plays = [...new Set([...known.plays, ...plays])];
		else delete known.plays;
	}
}

// "Stabspiele ohne Marimba & Vibraphon"; English words read too.
const WITHOUT = /^(.+?)\s+(?:ohne|außer|without|except)\s+(.+)$/i;
const withoutWord = (config: OrchestraConfig) => (config.locale.startsWith('de') ? 'ohne' : 'without');
const instrumentsIn = (text: string, config: OrchestraConfig) => parsePartName(text, 'text/plain', config.naming, matcherFor(config)).instruments;
const setNamed = (name: string, config: OrchestraConfig) =>
	Object.entries(config.instrumentSets ?? {}).find(([set]) => set.toLowerCase() === name.trim().toLowerCase())?.[1];

/** What's in a setup's brackets: sets ("Trommeln", "Stabspiele ohne Marimba") and single instruments. */
function readPlays(text: string, config: OrchestraConfig): string[] {
	const plays: string[] = [];
	for (const item of text.split(/[,;]/)) {
		if (!item.trim()) continue;
		const without = WITHOUT.exec(item.trim());
		const set = setNamed(without ? without[1] : item, config);
		if (!set) plays.push(...instrumentsIn(item, config));
		else {
			const left = without ? new Set(without[2].split(/\s*(?:&|\+|\bund\b|\band\b)\s*/i).flatMap((name) => instrumentsIn(name, config))) : new Set();
			plays.push(...set.filter((name) => !left.has(name)));
		}
	}
	return plays;
}

/**
 * Reads what members write in "Instrument", the way part file names are read, comma-separated
 * for several: "Geige I & II, Viola", "2. Violine", "Cello", "Flöte, Oboe II". One entry per
 * instrument, in the order written; unrecognised parts are left out. A percussionist's setup
 * follows in brackets: "Schlagwerk (Trommeln, Stabspiele ohne Marimba, Pauke)".
 */
export function parseInstruments(text: string, config: OrchestraConfig): InstrumentChoice[] {
	const choices: InstrumentChoice[] = [];
	// Commas inside the brackets belong to the setup.
	for (const item of text.split(/[,;](?![^()]*\))/)) {
		if (!item.trim()) continue;
		const setup = /^(.*?)\s*\((.*)\)\s*$/.exec(item);
		const plays = setup ? readPlays(setup[2], config) : undefined;
		parsePartName(setup ? setup[1] : item, 'text/plain', config.naming, matcherFor(config)).voices.forEach((voice, i) =>
			addChoice(choices, voice.instrument, voice.numbers, i === 0 ? plays : undefined)
		);
	}
	return choices;
}

/**
 * A setup as few words as the sets allow: a whole set by its name, most of one "… ohne …",
 * the rest one by one: "Trommeln, Stabspiele ohne Marimba, Kuhglocke".
 */
export function formatPlays(plays: string[], config: OrchestraConfig): string {
	const words: string[] = [];
	const left = new Set(plays);
	for (const [name, set] of Object.entries(config.instrumentSets ?? {})) {
		const have = set.filter((instrument) => left.has(instrument));
		if (!have.length) continue;
		if (have.length === set.length) words.push(name);
		else if (set.length > 2 && have.length * 2 > set.length)
			words.push(`${name} ${withoutWord(config)} ${set.filter((instrument) => !left.has(instrument)).map(instrumentLabel).join(' & ')}`);
		else continue;
		for (const instrument of have) left.delete(instrument);
	}
	const order = new Map(config.instruments.map((instrument, i) => [instrument.name, i]));
	words.push(...[...left].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)).map(instrumentLabel));
	return words.join(', ');
}

/**
 * What a member plays at one date: the part they gave with their answer ("Geige II" of
 * "Geige I & II, Viola"), else everything they play. A percussionist's setup stays with them.
 */
export function playingAt(choices: InstrumentChoice[], said: InstrumentChoice[]): InstrumentChoice[] {
	if (!said.length) return choices;
	return said.map((choice) => {
		const own = choices.find((other) => other.instrument === choice.instrument);
		return own?.plays && !choice.plays ? { ...choice, plays: own.plays } : choice;
	});
}

/** Someone's parts one by one, to pick the one they play at a date: "Geige I", "Geige II", "Viola". */
export function sectionsOf(choices: InstrumentChoice[]): string[] {
	return choices.flatMap((choice) =>
		choice.numbers.length ? choice.numbers.map((n) => formatInstrument({ instrument: choice.instrument, numbers: [n] })) : [formatInstrument(choice)]
	);
}

/** The first instrument only, where one is enough (e.g. a missing part's label). */
export function parseInstrument(text: string, config: OrchestraConfig): InstrumentChoice | null {
	return parseInstruments(text, config)[0] ?? null;
}

/** "Violine I & II", "Klarinette": how a choice is shown and stored back in "Instrument" (read again through the aliases). */
export function formatInstrument(choice: InstrumentChoice): string {
	const name = instrumentLabel(choice.instrument);
	return choice.numbers.length ? `${name} ${formatNumbers(choice.numbers)}` : name;
}

/** "Geige I & II, Viola"; with the config, as it's stored, setups too: "Schlagwerk (Trommeln, Pauken)". */
export function formatInstruments(choices: InstrumentChoice[], config?: OrchestraConfig): string {
	return choices
		.map((choice) => (config && choice.plays?.length ? `${formatInstrument(choice)} (${formatPlays(choice.plays, config)})` : formatInstrument(choice)))
		.join(', ');
}

/** The instruments of the orchestra's sets: in the profile, picked under the percussion, not on their own. */
export const setInstruments = (config: OrchestraConfig) => new Set(Object.values(config.instrumentSets ?? {}).flat());

/**
 * A profile's choices with what the sets hold folded into the percussion: "Pauke, Marimba"
 * reads "Schlagwerk (Pauken, Marimba)", where it's picked now. Already "Schlagwerk" with every
 * part, it stays that.
 */
export function foldIntoSets(choices: InstrumentChoice[], config: OrchestraConfig): InstrumentChoice[] {
	const inSets = setInstruments(config);
	const at = choices.findIndex((choice) => inSets.has(choice.instrument));
	if (at < 0) return choices;
	const plays = choices.filter((choice) => inSets.has(choice.instrument)).map((choice) => choice.instrument);
	const rest = choices.filter((choice) => !inSets.has(choice.instrument));
	const generic = rest.find((choice) => setsFor(choice.instrument, config).length);
	if (generic) return rest.map((choice) => (choice === generic && choice.plays ? { ...choice, plays: [...new Set([...choice.plays, ...plays])] } : choice));
	const percussion = config.instruments.find((instrument) => setsFor(instrument.name, config).length)?.name;
	if (!percussion) return choices;
	const folded = { instrument: percussion, numbers: [], plays };
	return [...choices.slice(0, at).filter((choice) => !inSets.has(choice.instrument)), folded, ...choices.slice(at).filter((choice) => !inSets.has(choice.instrument))];
}

/**
 * The sets a generic instrument's player picks from in their profile: all of them, the timpani
 * too, when it can hold what they name (Schlagwerk, Percussion), else none (Chor).
 */
export function setsFor(instrument: string, config: OrchestraConfig): { name: string; instruments: string[] }[] {
	const holds = new Set(config.instruments.find((each) => each.name === instrument)?.holds ?? []);
	const sets = Object.entries(config.instrumentSets ?? {});
	if (!sets.some(([, set]) => set.some((name) => holds.has(name)))) return [];
	return sets.map(([name, instruments]) => ({ name, instruments }));
}

/** Part numbers members pick from. */
export const PART_NUMBERS = [1, 2, 3, 4];

/**
 * Reads the instrument picker's fields: "instrument" once per row, "number" as "<row>:<n>", a
 * percussionist's setup as "plays" "<row>:<instrument>". Unknown instruments and empty rows are
 * dropped; the same instrument twice is merged.
 */
export function choicesFromForm(data: FormData, allowed: string[]): InstrumentChoice[] {
	const instruments = data.getAll('instrument').map((value) => String(value));
	const numbers = data.getAll('number').map((value) => String(value).split(':').map(Number));
	const plays = data.getAll('plays').map((value) => {
		const [row, ...name] = String(value).split(':');
		return [Number(row), name.join(':')] as const;
	});
	const choices: InstrumentChoice[] = [];
	instruments.forEach((instrument, row) => {
		if (allowed.includes(instrument)) {
			addChoice(
				choices,
				instrument,
				numbers.filter(([r, n]) => r === row && PART_NUMBERS.includes(n)).map(([, n]) => n),
				plays.filter(([r, name]) => r === row && allowed.includes(name)).map(([, name]) => name)
			);
		}
	});
	return choices;
}

/** Shared parts that include the instrument, e.g. Klarinette → ["B-Stimmen", "Holz"]. */
export function sharedPartsFor(instrument: string, config: OrchestraConfig): string[] {
	return Object.entries(config.sharedParts ?? {})
		.filter(([, players]) => players.includes(instrument))
		.map(([name]) => name);
}

/** Parts that aren't music for a player: recordings and unrecognised files. */
const isPlayable = (part: Part) => part.kind !== 'audio' && part.kind !== 'sonstiges';

/** The part is written for this instrument, with this number or for every number. */
function isOwn(part: Part, choice: InstrumentChoice): boolean {
	return part.voices.some(
		(voice) =>
			voice.instrument === choice.instrument &&
			(!choice.numbers.length || !voice.numbers.length || voice.numbers.some((n) => choice.numbers.includes(n)))
	);
}

export interface PartMatch {
	/** Written for the instrument (and number): "Geige II", "Geige I & II", "Violoncello & Kontrabass". */
	own: Part[];
	/** Shared parts the instrument may play from: "C-Stimmen", "Holz". */
	shared: Part[];
}

/**
 * The sections people play: the files directly in the piece folder, as the piece page opens
 * them. A piece kept as a folder per movement has none of those: then every movement is
 * played (#361), or only the `movements` a programme names, where the piece has them.
 */
export function playedSections(detail: Pick<PieceDetail, 'sections'>, movements: number[] = []): Section[] {
	const first = detail.sections[0];
	if (!first) return [];
	if (first.kind !== 'movement') return [first];
	const all = detail.sections.filter((section) => section.kind === 'movement');
	const named = all.filter((section) => section.movement !== undefined && movements.includes(section.movement));
	return named.length ? named : all;
}

/** The movements a piece is kept in, when it has a folder for each: what a programme can pick from. */
export function movementsOf(detail: Pick<PieceDetail, 'sections'>): number[] {
	const played = playedSections(detail);
	return played.length > 1 ? played.flatMap((section) => section.movement ?? []) : [];
}

/**
 * The parts of the sections people play (see playedSections). A movement's parts say which
 * one they are for ("Viola · 2. Satz"), as a player gets one of each.
 */
export function playedParts(detail: Pick<PieceDetail, 'parts' | 'sections'>, movements?: number[]): Part[] {
	if (!detail.sections.length) return detail.parts.filter(isPlayable);
	const played = new Map(playedSections(detail, movements).map((section) => [section.key, section]));
	return detail.parts.flatMap((part) => {
		const section = played.get(part.section);
		if (!section || !isPlayable(part)) return [];
		return section.kind === 'movement' && section.label ? [{ ...part, label: `${part.label} · ${section.label}` }] : [part];
	});
}

/** The parts of each section on their own, in their order; one group when they don't say. */
function bySection(parts: Part[]): Part[][] {
	const groups = new Map<string | undefined, Part[]>();
	for (const part of parts) groups.set(part.section, [...(groups.get(part.section) ?? []), part]);
	return [...groups.values()];
}

/**
 * With a setup: a part naming what it holds ("Percussion I: Triangel & Becken") only if one of
 * those is played, and the parts of every instrument played ("Triangel", "Stabspiele").
 */
function fitsSetup(part: Part, plays: string[]): boolean {
	const holder = part.voices.find((voice) => voice.holds?.length);
	return !holder || holder.holds!.some((held) => plays.includes(held));
}

/**
 * The parts someone with this instrument plays from. Each section is matched on its own: with
 * several movements, a player gets their part of every one, whatever the others are called.
 */
export function matchParts(parts: Part[], choice: InstrumentChoice, config: OrchestraConfig): PartMatch {
	const matches = bySection(parts).map((section) => matchSection(section, choice, config));
	if (matches.length <= 1) return matches[0] ?? { own: [], shared: [] };
	return { own: matches.flatMap((match) => match.own), shared: matches.flatMap((match) => match.shared) };
}

function matchSection(parts: Part[], choice: InstrumentChoice, config: OrchestraConfig): PartMatch {
	const plays = choice.plays;
	// A setup leaves out the shared parts of the set instruments not played (Marimba for one without mallets).
	const inSets = setInstruments(config);
	const groups = new Set(sharedPartsFor(choice.instrument, config).filter((group) => !plays || !inSets.has(group) || plays.includes(group)));
	let own = parts.filter((part) =>
		plays
			? fitsSetup(part, plays) && (isOwn(part, choice) || part.voices.some((voice) => plays.includes(voice.instrument)))
			: isOwn(part, choice)
	);
	// The soloist's part only when there is nothing else for the instrument.
	const regular = own.filter((part) => part.kind !== 'solo');
	if (regular.length) own = regular;
	// "Geige II" beats a plain "Geige", which is then usually the first violins' part.
	const exact = own.filter((part) =>
		part.voices.some((voice) => voice.instrument === choice.instrument && voice.numbers.some((n) => choice.numbers.includes(n)))
	);
	if (exact.length) own = exact;
	// Whoever reads the score also reads its reductions ("Klavierauszug", "Streicherauszug").
	const readsScore = config.instruments.some((instrument) => instrument.name === choice.instrument && instrument.family === 'partitur');
	const shared = parts.filter(
		(part) =>
			!own.includes(part) &&
			(!plays || fitsSetup(part, plays)) &&
			(part.instruments.some((name) => groups.has(name)) || (readsScore && part.kind === 'partitur'))
	);
	return { own, shared };
}

/**
 * How well a piece is covered for one instrument, for the instrumentation check:
 * its own part is there · a shared part covers it · its part is marked FEHLT/LEER/UNVOLLSTÄNDIG · nothing.
 */
export type Coverage = 'own' | 'shared' | 'problem' | 'none';

export function coverage(parts: Part[], instrument: string, config: OrchestraConfig): Coverage {
	// With several movements, the one covered worst counts: a part missing in one is missing.
	const worstFirst: Coverage[] = ['none', 'problem', 'shared', 'own'];
	const each = bySection(parts).map((section): Coverage => {
		const { own, shared } = matchSection(section, { instrument, numbers: [] }, config);
		if (own.some((part) => part.status === 'ok')) return 'own';
		if (shared.some((part) => part.status === 'ok')) return 'shared';
		return own.length || shared.length ? 'problem' : 'none';
	});
	return worstFirst.find((level) => each.includes(level)) ?? 'none';
}

/**
 * The instruments a programme needs, in the configured order: everything with its own
 * part in one of the pieces. Shared-part names ("B-Stimmen") and the score are left out.
 */
export function programInstruments(pieces: Part[][], config: OrchestraConfig): string[] {
	// Pure group names ("B-Stimmen", "Holz") aren't columns; "Schlagwerk" is a group and an instrument.
	const sharedParts = config.sharedParts ?? {};
	const players = new Set(Object.values(sharedParts).flat());
	const shared = new Set(Object.keys(sharedParts).filter((name) => !players.has(name)));
	const used = new Set(
		pieces.flat().flatMap((part) => (part.kind === 'partitur' ? [] : part.instruments.filter((name) => !shared.has(name))))
	);
	return config.instruments
		.filter((instrument) => used.has(instrument.name) && instrument.family !== 'partitur' && !instrument.voice)
		.map((instrument) => instrument.name);
}

/** "Weihnachtskonzert 2026" → "weihnachtskonzert-2026"; umlauts spelled out so the name works everywhere. */
export function slug(text: string): string {
	return text
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** The merged PDF's name: "herbstkonzert-komplett-violoncello.pdf". */
export function mergedFileName(concert: string, instrument: string): string {
	return `${[slug(concert), 'komplett', slug(instrument)].filter(Boolean).join('-')}.pdf`;
}

/** Instruments a person plays or a missing part can be for: no shared parts, numbered voices or family parts. */
export function playableInstruments(config: OrchestraConfig): string[] {
	return config.instruments
		.filter((instrument) => !instrument.voice && instrument.family !== 'sonstige' && instrument.name !== 'Holz' && instrument.name !== 'Blech')
		.map((instrument) => instrument.name);
}

/** The usual orchestra instruments, offered first; every instrument when the config marks none. */
export function commonInstruments(config: OrchestraConfig): string[] {
	const marked = config.instruments.filter((instrument) => instrument.common).map((instrument) => instrument.name);
	return marked.length ? marked : config.instruments.map((instrument) => instrument.name);
}

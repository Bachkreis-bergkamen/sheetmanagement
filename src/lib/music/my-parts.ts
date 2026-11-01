import type { Instrument, OrchestraConfig } from '#lib/config/index.ts';
import { createInstrumentMatcher, parsePartName, type InstrumentMatcher } from './part-name.ts';
import { instrumentLabel } from './instrument-label.ts';
import { formatNumbers } from './text.ts';
import type { Part, PieceDetail } from './types.ts';

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
}

const matchers = new WeakMap<readonly Instrument[], InstrumentMatcher>();
const matcherFor = (config: OrchestraConfig) => {
	let matcher = matchers.get(config.instruments);
	if (!matcher) matchers.set(config.instruments, (matcher = createInstrumentMatcher(config.instruments)));
	return matcher;
};

const ascending = (numbers: number[]) => [...new Set(numbers)].sort((a, b) => a - b);

/** Adds an instrument; the same one twice gets all its numbers, or every part if one entry says so. */
function addChoice(choices: InstrumentChoice[], instrument: string, numbers: number[]) {
	const known = choices.find((choice) => choice.instrument === instrument);
	if (!known) choices.push({ instrument, numbers: ascending(numbers) });
	else if (known.numbers.length) known.numbers = numbers.length ? ascending([...known.numbers, ...numbers]) : [];
}

/**
 * Reads what members write in "Instrument", the way part file names are read, comma-separated
 * for several: "Geige I & II, Viola", "2. Violine", "Cello", "Flöte, Oboe II". One entry per
 * instrument, in the order written; unrecognised parts are left out.
 */
export function parseInstruments(text: string, config: OrchestraConfig): InstrumentChoice[] {
	const choices: InstrumentChoice[] = [];
	for (const item of text.split(/[,;]/)) {
		if (!item.trim()) continue;
		for (const voice of parsePartName(item, 'text/plain', config.naming, matcherFor(config)).voices) {
			addChoice(choices, voice.instrument, voice.numbers);
		}
	}
	return choices;
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

/** "Geige I & II, Viola" */
export function formatInstruments(choices: InstrumentChoice[]): string {
	return choices.map(formatInstrument).join(', ');
}

/** Part numbers members pick from. */
export const PART_NUMBERS = [1, 2, 3, 4];

/**
 * Reads the instrument picker's fields: "instrument" once per row, "number" as "<row>:<n>".
 * Unknown instruments and empty rows are dropped; the same instrument twice is merged.
 */
export function choicesFromForm(data: FormData, allowed: string[]): InstrumentChoice[] {
	const instruments = data.getAll('instrument').map((value) => String(value));
	const numbers = data.getAll('number').map((value) => String(value).split(':').map(Number));
	const choices: InstrumentChoice[] = [];
	instruments.forEach((instrument, row) => {
		if (allowed.includes(instrument)) {
			addChoice(choices, instrument, numbers.filter(([r, n]) => r === row && PART_NUMBERS.includes(n)).map(([, n]) => n));
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

/** The parts of the section people play (the first one), as the piece page opens them. */
export function playedParts(detail: Pick<PieceDetail, 'parts' | 'sections'>): Part[] {
	const played = detail.sections[0]?.key;
	return detail.parts.filter((part) => isPlayable(part) && (played === undefined || part.section === played));
}

export function matchParts(parts: Part[], choice: InstrumentChoice, config: OrchestraConfig): PartMatch {
	const groups = new Set(sharedPartsFor(choice.instrument, config));
	let own = parts.filter((part) => isOwn(part, choice));
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
		(part) => !own.includes(part) && (part.instruments.some((name) => groups.has(name)) || (readsScore && part.kind === 'partitur'))
	);
	return { own, shared };
}

/**
 * How well a piece is covered for one instrument, for the instrumentation check:
 * its own part is there · a shared part covers it · its part is marked FEHLT/LEER/UNVOLLSTÄNDIG · nothing.
 */
export type Coverage = 'own' | 'shared' | 'problem' | 'none';

export function coverage(parts: Part[], instrument: string, config: OrchestraConfig): Coverage {
	const { own, shared } = matchParts(parts, { instrument, numbers: [] }, config);
	if (own.some((part) => part.status === 'ok')) return 'own';
	if (shared.some((part) => part.status === 'ok')) return 'shared';
	return own.length || shared.length ? 'problem' : 'none';
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

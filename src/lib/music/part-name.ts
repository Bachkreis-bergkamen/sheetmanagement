import type { Instrument, InstrumentFamily, NamingRules } from '#lib/config/index.ts';
import { formatNumbers, isOrdinal, parseNumeral, tokenize } from './text.ts';
import type { PartKind, PartStatus } from './types.ts';

interface AliasEntry {
	tokens: string[];
	instrument: Instrument;
	index: number;
	/** For a variant ("Triangle" of "Percussion"): the note it leaves in the part's name. */
	note?: string;
}

/** Instrument names and aliases as token lists, longest first, so "bass clarinet" wins over "bass". */
export interface InstrumentMatcher {
	aliases: AliasEntry[];
	/** The same aliases by their first word, so a word is checked against a few, not all. */
	byFirstToken: Map<string, AliasEntry[]>;
	order: Map<Instrument, number>;
}

export function createInstrumentMatcher(instruments: Instrument[]): InstrumentMatcher {
	const aliases: AliasEntry[] = [];
	instruments.forEach((instrument, index) => {
		for (const label of [instrument.name, ...(instrument.aliases ?? [])]) {
			aliases.push({ tokens: tokenize(label), instrument, index });
		}
		for (const variant of instrument.variants ?? []) {
			aliases.push({ tokens: tokenize(variant), instrument, index, note: variant });
		}
	});
	aliases.sort((a, b) => b.tokens.length - a.tokens.length);
	const byFirstToken = new Map<string, AliasEntry[]>();
	for (const alias of aliases) {
		const first = alias.tokens[0];
		byFirstToken.set(first, [...(byFirstToken.get(first) ?? []), alias]);
	}
	return { aliases, byFirstToken, order: new Map(instruments.map((instrument, index) => [instrument, index])) };
}

function matchAt(tokens: string[], start: number, matcher: InstrumentMatcher): AliasEntry | undefined {
	return matcher.byFirstToken
		.get(tokens[start])
		?.find((alias) => alias.tokens.every((token, i) => tokens[start + i] === token));
}

interface Item {
	instrument: Instrument;
	numbers: number[];
	transposition?: string;
	/** "/" means alternative instruments, otherwise they are combined ("&"). */
	joiner: string;
}

export interface ParsedPart {
	/** As shown in the app, with the instruments' display labels: "Bratsche". */
	label: string;
	/** As the naming convention writes it, with the instruments' file-name words: "Viola". */
	fileLabel: string;
	kind: PartKind;
	family?: InstrumentFamily;
	instruments: string[];
	/** Each instrument with its part numbers: "Geige I & II" → [{ instrument: "Geige", numbers: [1, 2] }]. */
	voices: Voice[];
	notes: string[];
	status: PartStatus;
	featured: boolean;
	/** Words the parser couldn't place; a name with some isn't safe to rename automatically. */
	unrecognized: string[];
	/** Sort position: instrument order, then part number. */
	order: number;
}

export interface Voice {
	instrument: string;
	/** Empty when the file has no number, i.e. it's for every player of the instrument. */
	numbers: number[];
	/** For a generic part ("Percussion I: Triangel & Becken"): the instruments it names. */
	holds?: string[];
	/** The key it is written in, as the name gives it: "Horn II in Es" → "Es". */
	transposition?: string;
}

// ":" after a voice or a generic part: "Stimme 3: Flöte", "Percussion I: Triangel".
const JOINERS = new Set(['+', '&', '/', ',', 'und', 'and', '–', ':', 'or', 'oder']);
/** Joiners for alternative instruments: "Oboe or Clarinet" is one part for either. */
const ALTERNATIVES = new Set(['/', 'or', 'oder']);

interface NamingWords {
	statusWords: Record<string, PartStatus>;
	transpositionKeys: string[][];
	noteKeys: { tokens: string[]; text: string }[];
	ignored: Set<string>;
}

const wordsByNaming = new WeakMap<NamingRules, NamingWords>();

/**
 * The convention's words, tokenized once per naming rules rather than once per file: a
 * catalog parses ~2000 file names, and doing this each time cost ~40 ms of CPU (#69).
 */
function wordsOf(naming: NamingRules): NamingWords {
	let words = wordsByNaming.get(naming);
	if (!words) {
		words = {
			statusWords: {
				...naming.statusAliases,
				[naming.status.missing.toLowerCase()]: 'missing',
				[naming.status.empty.toLowerCase()]: 'empty',
				[naming.status.incomplete.toLowerCase()]: 'incomplete'
			},
			transpositionKeys: Object.keys(naming.transpositions)
				.map((key) => key.split(' '))
				.sort((a, b) => b.length - a.length),
			// Notes can span several words ("mit Notizen"), so they are matched like instruments.
			noteKeys: Object.keys(naming.partNotes)
				.map((key) => ({ tokens: tokenize(key), text: naming.partNotes[key] }))
				.sort((a, b) => b.tokens.length - a.tokens.length),
			ignored: new Set(naming.ignoredWords?.map((word) => word.toLowerCase()))
		};
		wordsByNaming.set(naming, words);
	}
	return words;
}

/**
 * Reads a part file name in the orchestra's convention ("BWV 147 - Geige II - LEER.pdf")
 * or in older styles ("Best_of_Bach-ViolinII.pdf", "1. Violine.pdf", "Horn in F 2.pdf").
 *
 * @param prefix Text shared by all files of the piece (see `sharedPrefix`), removed first.
 */
export function parsePartName(
	fileName: string,
	mimeType: string,
	naming: NamingRules,
	matcher: InstrumentMatcher,
	prefix = ''
): ParsedPart {
	let name = fileName
		.trim()
		.replace(/\.[a-z0-9]{2,4}$/i, '')
		// The extension typed into the name as well: "Pianopdf.pdf"
		.replace(/(?<=[a-z])pdf$/i, '')
		// A copy's suffix from Drive or the desktop: "Horn- (1).pdf"
		.replace(/\s+\(\d+\)$/, '');
	const featured = name.startsWith(naming.featuredPrefix);
	if (featured) name = name.slice(naming.featuredPrefix.length).trim();
	if (prefix && name.startsWith(prefix)) name = name.slice(prefix.length);

	const notes: string[] = [];
	// Movement numbers glued to the front: "Dvorak_9-4_Viola" → after the prefix "4_Viola".
	const movement = /^(\d{1,2})[_-](?=\D)/.exec(name);
	if (movement) {
		notes.push(`${naming.movementNote ?? 'Satz'} ${Number(movement[1])}`);
		name = name.slice(movement[0].length);
	}

	const tokens = tokenize(name);
	const { statusWords, transpositionKeys, noteKeys, ignored } = wordsOf(naming);
	const noteAt = (at: number) => noteKeys.find((note) => note.tokens.every((t, k) => tokens[at + k] === t));

	const voice = matcher.aliases.find((alias) => alias.instrument.voice)?.instrument;
	const items: Item[] = [];
	const unknown: string[] = [];
	let status: PartStatus = 'ok';
	let pendingNumbers: number[] = [];
	/** A key written before the instrument: "F Horn", "B-flat Clarinet". */
	let pendingTransposition: string | undefined;
	let joiner = '&';
	let afterUnknownWord = false;

	const readTransposition = (at: number, requireIn: boolean, allowAmbiguous = false, noLetters = false): [string | undefined, number] => {
		const hasIn = tokens[at] === 'in';
		if (requireIn && !hasIn) return [undefined, at];
		const from = hasIn ? at + 1 : at;
		for (const key of transpositionKeys) {
			// Without "in", only unambiguous keys count ("Bb", "Es", "F"), not "a" or "c";
			// after strings no single letter at all ("Geige I B" is a version, "Bass Es" a key).
			if (!hasIn && key.length === 1 && key[0].length === 1 && (noLetters || (!allowAmbiguous && ['a', 'c', 'd'].includes(key[0])))) continue;
			if (key.every((token, i) => tokens[from + i] === token)) {
				return [naming.transpositions[key.join(' ')], from + key.length];
			}
		}
		return [undefined, at];
	};

	/** "B.C."/"BC" (bass clef) or "T.C."/"TC" (treble clef), as tokens at `at`. */
	const clefAt = (at: number): { note: string; length: number } | undefined => {
		const token = tokens[at];
		if ((token === 'b' || token === 't') && tokens[at + 1] === 'c') return { note: `${token.toUpperCase()}.C.`, length: 2 };
		if (token === 'bc' || token === 'tc') return { note: `${token[0].toUpperCase()}.C.`, length: 1 };
		return undefined;
	};

	/**
	 * A key directly followed by an instrument: [key, index of the instrument]. "C Flöte"
	 * counts too, but not an article ("a Violin") or a letter before strings, which don't transpose.
	 */
	const keyBeforeInstrument = (at: number): [string, number] | undefined => {
		const [transposition, after] = readTransposition(at, false);
		if (transposition) return matchAt(tokens, after, matcher) ? [transposition, after] : undefined;
		const [loose, next] = readTransposition(at, false, tokens[at] !== 'a');
		const instrument = loose ? matchAt(tokens, next, matcher)?.instrument : undefined;
		return instrument && instrument.family !== 'streicher' ? [loose!, next] : undefined;
	};

	/** Part numbers before the instrument, maybe with a key: "1. Violine", "1. und 2. F Horn", "2nd B-flat Trumpet". */
	const numbersBeforeInstrument = (at: number): { numbers: number[]; transposition?: string; after: number } | undefined => {
		const numbers: number[] = [];
		let k = at;
		while (parseNumeral(tokens[k]) !== undefined) {
			numbers.push(parseNumeral(tokens[k])!);
			k++;
			if (['+', '&', ',', 'und'].includes(tokens[k]) && parseNumeral(tokens[k + 1]) !== undefined) k++;
			else break;
		}
		if (!numbers.length) return undefined;
		if (matchAt(tokens, k, matcher)) return { numbers, after: k };
		const key = keyBeforeInstrument(k);
		return key ? { numbers, transposition: key[0], after: key[1] } : undefined;
	};

	let i = 0;
	while (i < tokens.length) {
		const token = tokens[i];
		const note = noteAt(i);
		if (note) {
			if (!notes.includes(note.text)) notes.push(note.text);
			i += note.tokens.length;
			afterUnknownWord = false;
			continue;
		}
		const match = matchAt(tokens, i, matcher);

		if (match) {
			afterUnknownWord = false;
			if (match.note && !notes.includes(match.note)) notes.push(match.note);
			const item: Item = {
				instrument: match.instrument,
				numbers: pendingNumbers,
				transposition: pendingTransposition,
				joiner
			};
			pendingNumbers = [];
			pendingTransposition = undefined;
			joiner = '&';
			i += match.tokens.length;
			const leadingNumbers = item.numbers.length;

			// Numbers and transposition may come in either order: "Horn in F 2", "Saxophon Eb 1+2".
			for (let round = 0; round < 2; round++) {
				// Clef markings for baritone parts: "B.C." (bass clef), "T.C." (treble clef).
				const clef = clefAt(i);
				if (clef) {
					if (!notes.includes(clef.note)) notes.push(clef.note);
					i += clef.length;
				}
				let joined = false;
				while (parseNumeral(tokens[i]) !== undefined) {
					// "1. Trompete-1. Klarinette": the second "1" belongs to the next instrument,
					// but in "Part 4 + 5 Cello" the "5" still belongs to the voice.
					if (item.numbers.length > 0 && !joined && matchAt(tokens, i + 1, matcher)) break;
					item.numbers.push(parseNumeral(tokens[i])!);
					i++;
					joined = false;
					const next = parseNumeral(tokens[i + 1]);
					if (tokens[i] === '–' && next !== undefined) {
						for (let n = item.numbers[item.numbers.length - 1] + 1; n <= next; n++) item.numbers.push(n);
						i += 2;
					} else if (['+', '&', ',', 'und'].includes(tokens[i]) && next !== undefined) {
						i++;
						joined = true;
					}
				}
				// Singers aren't transposed: "Gesang B" means the bass voice, kept as a note below.
				if (!item.transposition && item.instrument.family !== 'gesang') {
					const strings = item.instrument.family === 'streicher';
					// Right after a wind instrument "C" and "D" are keys ("Trumpet-C"); "a" only
					// at the end, since "Flöte a 2" means both players.
					const ambiguous = tokens[i] !== 'a' || i === tokens.length - 1;
					const [transposition, after] = readTransposition(i, false, ambiguous, strings);
					if (transposition) {
						item.transposition = transposition;
						i = after;
						// One part for two keys: "Clarinets in A+B".
						while (['+', '&', '/', 'und'].includes(tokens[i]) && !matchAt(tokens, i + 1, matcher)) {
							const [also, next] = readTransposition(i + 1, false, true, strings);
							if (!also) break;
							item.transposition += ` & ${also}`;
							i = next;
						}
					}
				}
			}
			// "II Trompete 1": numbers on both sides, so one of them belongs to something else.
			if (leadingNumbers && item.numbers.length > leadingNumbers) unknown.push(...item.numbers.slice(leadingNumbers).map(String));
			items.push(item);
			continue;
		}

		// "Section II Violine": II belongs to "Section". An ordinal ("1st") never does.
		const wasAfterUnknownWord = afterUnknownWord && !isOrdinal(token);
		afterUnknownWord = false;
		const leading = numbersBeforeInstrument(i);
		const clef = clefAt(i);
		if (statusWords[token]) {
			status = statusWords[token];
		} else if (clef && (items.length > 0 || matchAt(tokens, i + clef.length, matcher))) {
			// "Phantom-BC-Baritone", "Baritone Viola TC": the clef of the part next to it.
			if (!notes.includes(clef.note)) notes.push(clef.note);
			i += clef.length;
			continue;
		} else if (leading && (!wasAfterUnknownWord || leading.numbers.length > 1)) {
			// "1. Violine", "2.Flöte" (but not "Section II Violine", where II belongs to "Section";
			// a list like "Dance 1. und 2. F Horn" is clear even after a word)
			({ numbers: pendingNumbers, transposition: pendingTransposition, after: i } = leading);
			continue;
		} else if (parseNumeral(token) !== undefined && voice && readTransposition(i + 1, false, true)[0]) {
			// Flexible voices written as "3Es", "1C": voice 3 in Es.
			const [transposition, after] = readTransposition(i + 1, false, true);
			items.push({ instrument: voice, numbers: [parseNumeral(token)!], transposition, joiner });
			i = after;
			continue;
		} else if (JOINERS.has(token)) {
			if (ALTERNATIVES.has(token)) joiner = '/';
		} else if (ignored.has(token)) {
			// A source like "IMSLP": says nothing about the part.
		} else if (token === 'in' && items.length > 0) {
			const [transposition, after] = readTransposition(i, true);
			if (transposition && !items[items.length - 1].transposition) {
				items[items.length - 1].transposition = transposition;
				i = after;
				continue;
			}
		} else if (keyBeforeInstrument(i)) {
			const [transposition, after] = keyBeforeInstrument(i)!;
			pendingTransposition = transposition;
			i = after;
			continue;
		} else if (/^[a-d]$/.test(token) && items[items.length - 1]?.instrument.family === 'streicher') {
			// Versions of one string part, e.g. by difficulty: "Geige I A", "Geige I B".
			const version = token.toUpperCase();
			if (!notes.includes(version)) notes.push(version);
		} else {
			unknown.push(token);
			afterUnknownWord = true;
		}
		i++;
	}

	// "Horn I & Horn II" → "Horn I & II"; "Kontrabass / Stringbass" → "Kontrabass".
	for (let k = items.length - 1; k > 0; k--) {
		const [previous, current] = [items[k - 1], items[k]];
		if (previous.instrument === current.instrument && previous.transposition === current.transposition) {
			for (const n of current.numbers) if (!previous.numbers.includes(n)) previous.numbers.push(n);
			items.splice(k, 1);
		}
	}
	// A voice always leads: "Cello Part 5" reads "Stimme 5: Violoncello".
	const voiceIndex = items.findIndex((item) => item.instrument.voice);
	if (voiceIndex > 0) items.unshift(...items.splice(voiceIndex, 1));
	// A generic part leads the instruments it names: "Percussion I: Triangel & Becken", "Chor: Sopran & Alt".
	const holderIndex =
		voiceIndex < 0 && items.length > 1
			? items.findIndex(
					(item) =>
						item.instrument.holds &&
						items.every((other) => other === item || (item.instrument.holds!.includes(other.instrument.name) && other.joiner !== '/'))
				)
			: -1;
	if (holderIndex > 0) items.unshift(...items.splice(holderIndex, 1));
	const holder = holderIndex >= 0 ? items[0] : undefined;

	const describe = (item: Item, display: boolean) =>
		[
			display ? (item.instrument.label ?? item.instrument.name) : item.instrument.name,
			// Voices are counted ("Stimme 3"), instrument parts use roman numbers ("Horn II").
			item.instrument.voice ? item.numbers.join(' & ') : formatNumbers(item.numbers),
			item.transposition ? `in ${item.transposition}` : ''
		]
			.filter(Boolean)
			.join(' ');

	// A voice ("Stimme 3") followed by instruments reads "Stimme 3: Flöte & Oboe".
	const join = (display: boolean) => {
		let text = '';
		items.forEach((item, index) => {
			const part = describe(item, display);
			if (index === 0) text = part;
			else if (index === 1 && (items[0].instrument.voice || holder)) text += `: ${part}`;
			else if (holder) text += ` & ${part}`;
			else text += ` ${item.joiner} ${part}`;
		});
		return text;
	};
	let label = join(true);
	let fileLabel = join(false);

	// Voice parts of singers ("Gesang SA", "Gesang B") keep their short voice names.
	let unrecognized = unknown;
	if (items.length > 0 && items.every((item) => item.instrument.family === 'gesang')) {
		const isVoice = (token: string) => /^[satb]{1,4}$/.test(token);
		const voices = unknown.filter(isVoice).map((t) => t.toUpperCase());
		if (voices.length) {
			label += ` ${voices.join(' ')}`;
			fileLabel += ` ${voices.join(' ')}`;
		}
		unrecognized = unknown.filter((token) => !isVoice(token));
	}

	const soloNote = naming.partNotes.solo ?? 'Solo';
	if (items.length === 0 && notes.includes(soloNote)) {
		// "Barcarolle-Solo.pdf": the solo part, instrument not named.
		label = fileLabel = soloNote;
	}

	const first = items[0];
	const isAudio = mimeType.startsWith('audio/');
	let kind: PartKind;
	if (isAudio) kind = 'audio';
	else if (!first && notes.includes(soloNote)) kind = 'solo';
	else if (!first) kind = 'sonstiges';
	else if (first.instrument.family === 'partitur') kind = 'partitur';
	else if (featured || notes.includes(soloNote)) kind = 'solo';
	// A generic part is one player's, whatever it names: "Percussion I: Triangel & Becken".
	else if ((!holder && items.filter((item) => !item.instrument.voice).length > 1) || first.numbers.length > 1) kind = 'sammelstimme';
	else kind = 'stimme';

	if (!label) {
		// Nothing recognised: show the readable rest of the name.
		label = fileLabel = name.replace(/[_]+/g, ' ').replace(/\s+-\s+/g, ' – ').trim() || fileName;
	}

	const instrumentIndex = first ? (matcher.order.get(first.instrument) ?? 999) : 999;
	const order =
		(kind === 'partitur' ? 0 : kind === 'solo' ? 1 : kind === 'audio' || kind === 'sonstiges' ? 9 : 2) * 1_000_000 +
		instrumentIndex * 1000 +
		(first?.numbers[0] ?? 0) * 10 +
		Math.min(items.length, 9);

	return {
		label,
		fileLabel,
		kind,
		family: first?.instrument.family,
		instruments: [...new Set(items.filter((i) => !i.instrument.voice).map((i) => i.instrument.name))],
		voices: items
			.filter((i) => !i.instrument.voice)
			.map((i) =>
				i === holder
					? { instrument: i.instrument.name, numbers: [...i.numbers], holds: items.slice(1).map((held) => held.instrument.name) }
					: { instrument: i.instrument.name, numbers: [...i.numbers], ...(i.transposition ? { transposition: i.transposition } : {}) }
			),
		notes,
		status,
		featured,
		unrecognized,
		order
	};
}

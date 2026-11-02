import type { NamingRules } from '#lib/config/index.ts';
import { parsePartName, type InstrumentMatcher } from './part-name.ts';
import { sharedPrefix } from './text.ts';

/**
 * The naming-convention check: which part files in a folder don't follow
 * "<Kurztitel> - <Stimme>[ - STATUS].pdf", and what they should be called. A name is
 * only suggested when the parser understood every word of it; anything else is left
 * for a person to look at, never guessed.
 */

export interface NamingFile {
	id: string;
	name: string;
	mimeType: string;
}

/** ok: follows the convention · rename: a safe new name exists · unclear: needs a person · skip: not a part (recordings). */
export type NameState = 'ok' | 'rename' | 'unclear' | 'skip';

export interface NameCheck {
	id: string;
	name: string;
	state: NameState;
	/** The name in the convention, for "rename". */
	suggested?: string;
	/** What the parser read the part as, to help with "unclear". */
	label: string;
	/** Why it's unclear: the words the parser couldn't place. */
	unrecognized: string[];
	/** Or why else: the name it would get belongs to another file already. */
	taken?: string;
}

const GOOGLE_APPS = 'application/vnd.google-apps.';
const BRACKETS = /[()[\]{}]/g;

const withoutFeatured = (name: string, naming: NamingRules) =>
	name.startsWith(naming.featuredPrefix) ? name.slice(naming.featuredPrefix.length).trim() : name;

/** "Fame - Geige I.pdf" → "Fame - Geige I" */
const stem = (name: string) => name.replace(/\.[a-z0-9]{2,4}$/i, '').trim();

/** "Mendelssohn 4 - Satz 2 - Geige I - LEER" → "Mendelssohn 4": everything before the part. */
function titleHead(name: string, naming: NamingRules): string | undefined {
	const sep = naming.separator;
	let parts = name.split(sep).map((part) => part.trim());
	if (parts.length < 2) return undefined;
	const statusWords = Object.values(naming.status).map((word) => word.toLowerCase());
	if (statusWords.includes(parts[parts.length - 1].toLowerCase())) parts = parts.slice(0, -1);
	parts = parts.slice(0, -1);
	const movement = new RegExp(`^${naming.movementNote ?? 'Satz'}\\s+\\d{1,2}$`, 'i');
	while (parts.length > 1 && movement.test(parts[parts.length - 1])) parts = parts.slice(0, -1);
	return parts.join(sep) || undefined;
}

/**
 * The short title the files of a section use: what most of them already put before the
 * part. Without one (old names like "Best_of_Bach-ViolinII"), the piece title.
 */
export function guessShortTitle(
	files: NamingFile[],
	title: string,
	naming: NamingRules,
	piece: { composer?: string; catalogue?: string } = {}
): string {
	const counts = new Map<string, number>();
	for (const file of files) {
		const head = titleHead(stem(withoutFeatured(file.name, naming)), naming);
		if (head) counts.set(head, (counts.get(head) ?? 0) + 1);
	}
	const [best] = [...counts].sort((a, b) => b[1] - a[1]);
	// What the files use stays, unless it's too long for a phone.
	if (best && (best[1] >= 2 || files.length === 1)) return shortenTitle(best[0], naming, piece);
	return classicalShortTitle(title, piece) ?? shortenTitle(title, naming, piece);
}

/** The default longest short title: "Kleine Nachtmusik" fits, "Jesu bleibet meine Freude" doesn't. */
export const MAX_SHORT_TITLE = 18;
export const maxShortTitle = (naming: NamingRules) => naming.maxShortTitle ?? MAX_SHORT_TITLE;

/** Fillers a short title does without: "Themes from 007" → "007", "Eine kleine Nachtmusik" → "Kleine Nachtmusik". */
const LEADING_FILLER = /^(?:(?:the|a|an|der|die|das|ein|eine|le|la|les|il|lo)\s+|(?:themes?|music|selections?|highlights?|suite|songs?)\s+(?:from|aus)\s+|aus\s+)+/iu;
const TRAILING_FILLER = /\s+(?:medley|potpourri|selection)$/iu;
/** A short title never ends on these: "Phantom of the" → "Phantom", "Jesu bleibet meine" → "Jesu bleibet". */
const JOINING = new Set(
	'of the and und from aus von a an der die das des dem den ein eine einer mit for für in im on to zu am vom zum zur la le les di de du da del meine mein deine dein unser unsere sein seine ihr ihre'.split(' ')
);

/**
 * A short title that fits the limit: as it is when short enough, else without fillers
 * ("Eine kleine Nachtmusik" → "Kleine Nachtmusik"), else its leading words, never ending on
 * a joining word. When only one word would be left, composer and catalogue number say more
 * for classical works ("Schumann Klavierkonzert op. 54" → "Schumann op. 54").
 */
export function shortenTitle(title: string, naming: NamingRules, piece: { composer?: string; catalogue?: string } = {}): string {
	const max = maxShortTitle(naming);
	const clean = cleanShortTitle(title, naming);
	if (clean.length <= max) return clean;

	const stripped = clean.replace(LEADING_FILLER, '').replace(TRAILING_FILLER, '').trim() || clean;
	const capitalized = stripped.charAt(0).toUpperCase() + stripped.slice(1);
	if (capitalized.length <= max) return capitalized;

	const words = capitalized.split(' ');
	let length = 0;
	let end = 0;
	for (const [i, word] of words.entries()) {
		length += (i ? 1 : 0) + word.length;
		if (length > max) break;
		if (!JOINING.has(word.toLowerCase())) end = i + 1;
	}
	if (end >= 2) return words.slice(0, end).join(' ');

	const catalogue = piece.catalogue ?? naming.cataloguePatterns.map((pattern) => pattern.exec(clean)?.[0]).find(Boolean);
	const firstWord = clean.split(' ')[0].toLowerCase();
	const composer = lastName(piece.composer) ?? naming.knownComposers.find((name) => name.toLowerCase() === firstWord);
	const classical = catalogue && composer ? `${composer} ${catalogue.replace(/\s+/g, ' ')}` : '';
	if (classical && classical.length <= max) return classical;
	return end ? words[0] : capitalized.slice(0, max).trim();
}

/** The first composer's last name: "Haydn" for "Joseph Haydn, Mozart". */
function lastName(composer: string | undefined): string | undefined {
	return composer?.split(/[,;]/)[0].trim().split(/\s+/).pop() || undefined;
}

/**
 * The convention's short form for classical works: composer and the telling number
 * ("Dvorak 9" for "Sinfonie Nr. 9 Aus der neuen Welt"), or the BWV number for Bach.
 */
export function classicalShortTitle(title: string, piece: { composer?: string; catalogue?: string }): string | undefined {
	if (piece.catalogue && /^BWV\b/i.test(piece.catalogue)) return piece.catalogue.replace(/\s+/g, ' ');
	const number = /\bNr\.?\s*(\d+)/i.exec(title)?.[1];
	const composer = lastName(piece.composer);
	if (composer && number) return `${composer} ${number}`;
	return undefined;
}

/** No brackets, commas, colons, separators or double spaces in a file name's title. */
export const cleanShortTitle = (title: string, naming?: NamingRules) =>
	(naming ? title.split(naming.separator).join(' ') : title)
		.replace(BRACKETS, '')
		.replace(/[,:]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * The start most files share, even when one odd file ("@Partitur-DonGiovanni.pdf") breaks
 * the common prefix of all of them: the longest one cut at "-" or "_" that most files have.
 */
function majorityPrefix(names: string[]): string {
	const counts = new Map<string, number>();
	for (const name of names) {
		for (const match of name.matchAll(/[-_]\s*/g)) {
			const prefix = name.slice(0, match.index + match[0].length);
			counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
		}
	}
	const needed = Math.max(2, Math.ceil(names.length / 2));
	return [...counts].filter(([, count]) => count >= needed).sort((a, b) => b[0].length - a[0].length)[0]?.[0] ?? '';
}

/** Words of a title as file names spell them: lower case, "Let's" → "lets". */
const words = (text: string) =>
	text
		.toLowerCase()
		.replace(/['’´`]/g, '')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

export interface SectionContext {
	/** The movement a subfolder holds ("4. Satz"), which its files often no longer name. */
	movement?: number;
	/** Folder name and title: leading words from them in a file name are the title, not the part. */
	titles?: string[];
}

/** Checks every file of one section (the files directly in a folder, or one subfolder). */
export function checkSection(
	files: NamingFile[],
	shortTitle: string,
	naming: NamingRules,
	matcher: InstrumentMatcher,
	context: SectionContext = {}
): NameCheck[] {
	const short = cleanShortTitle(shortTitle, naming);
	const sep = naming.separator;
	const movementWord = naming.movementNote ?? 'Satz';
	const names = files.map((file) => withoutFeatured(file.name, naming));
	const shared = sharedPrefix(names);
	const common = majorityPrefix(names);
	const titleWords = new Set([short, ...(context.titles ?? [])].flatMap(words));

	/** Prefixes to try, best first: the short title, the shared start, then leading title words, longest first. */
	const prefixes = (bare: string) => {
		const found = [bare.startsWith(short + sep) ? short + sep : '', shared, bare.startsWith(common) ? common : ''];
		const chunk = /[^\s_\-.]+[\s_\-.]*/gy;
		const ends: number[] = [];
		for (let match = chunk.exec(bare); match; match = chunk.exec(bare)) {
			if (!words(match[0]).every((word) => titleWords.has(word))) break;
			ends.push(chunk.lastIndex);
		}
		return [...new Set([...found.filter(Boolean), ...ends.reverse().map((end) => bare.slice(0, end)), ''])];
	};

	// First pass: what each file should be called.
	const drafts = files.map((file) => {
		const bare = withoutFeatured(file.name, naming);
		let movement = context.movement ? `${movementWord} ${context.movement}` : undefined;
		let parsed: ReturnType<typeof parsePartName> | undefined;
		for (let prefix of prefixes(bare)) {
			// "Mendelssohn 4 - Satz 2 - Geige I": the movement belongs to the title part.
			const written = new RegExp(`^${movementWord}\\s+(\\d{1,2})${escape(sep)}`, 'i').exec(bare.slice(prefix.length));
			if (written) prefix += written[0];
			// Order numbers some publishers put first: "Faure-Elegie-07 Solo Cello".
			const numbered = /^\d{2,3}\s+(?=\D)/.exec(bare.slice(prefix.length));
			if (numbered) prefix += numbered[0];
			const attempt = parsePartName(file.name, file.mimeType, naming, matcher, prefix);
			parsed ??= attempt;
			if (!attempt.unrecognized.length && attempt.kind !== 'sonstiges') {
				parsed = attempt;
				if (written) movement = `${movementWord} ${Number(written[1])}`;
				break;
			}
		}
		parsed = parsed!;
		const check: NameCheck = { id: file.id, name: file.name, state: 'unclear', label: parsed.label, unrecognized: parsed.unrecognized };
		// File names follow the convention's words ("Geige"), whatever the app shows ("Violine").
		if (parsed.kind === 'audio') return { check: { ...check, state: 'skip' as const } };
		if (parsed.kind === 'sonstiges' || parsed.unrecognized.length || !short) return { check };

		movement ??= parsed.notes.find((note) => note.startsWith(`${movementWord} `));
		const isClef = (note: string) => /^[BT]\.C\.$/.test(note);
		const notes = parsed.notes.filter((note) => !note.startsWith(`${movementWord} `) && note !== parsed!.fileLabel && !isClef(note));
		const featured = parsed.kind === 'partitur' || parsed.kind === 'solo' ? naming.featuredPrefix : '';
		const extension = file.mimeType.startsWith(GOOGLE_APPS) ? '' : (/\.[a-z0-9]{2,4}$/i.exec(file.name)?.[0].toLowerCase() ?? '');
		const status = parsed.status === 'ok' ? '' : `${sep}${naming.status[parsed.status]}`;
		const label = [parsed.fileLabel, ...parsed.notes.filter(isClef)];
		const build = (extra: string[]) =>
			// "Bariton B.C." + ".pdf" would end in "..": the extension's dot is enough.
			[featured, short, movement ? sep + movement : '', sep, [...label, ...extra].join(' '), status]
				.join('')
				.replace(BRACKETS, '')
				.replace(/\.$/, '') + extension;
		return { check, build, notes };
	});

	// Second pass: files already named right keep their name; a second file that would get
	// the same name is marked as a duplicate, and if that's taken too it's left to a person.
	const taken = new Set<string>();
	const key = (name: string) => name.toLowerCase();
	for (const draft of drafts) if (draft.build && draft.build(draft.notes) === draft.check.name) taken.add(key(draft.check.name));
	// Copies ("Geige (1).pdf") come last, so the original keeps the plain name.
	const isCopy = (name: string) => /\s\(\d+\)(\.[a-z0-9]{2,4})?$/i.test(name);
	const order = drafts.map((_, i) => i).sort((a, b) => Number(isCopy(drafts[a].check.name)) - Number(isCopy(drafts[b].check.name)) || a - b);
	const results: NameCheck[] = [];
	for (const i of order) {
		const { check, build, notes } = drafts[i];
		results[i] = ((): NameCheck => {
			if (!build) return check;
			let suggested = build(notes);
			if (suggested === check.name) return { ...check, state: 'ok' };
			if (taken.has(key(suggested)) && !notes.includes('Duplikat')) suggested = build([...notes, 'Duplikat']);
			if (taken.has(key(suggested))) return { ...check, taken: suggested };
			taken.add(key(suggested));
			return { ...check, state: 'rename', suggested };
		})();
	}
	return results;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The convention's placeholder for a missing part: "<Kurztitel> - <Stimme> - FEHLT", a Google Doc in the piece folder. */
/** Files renamed per request on /namen: free Workers allow 50 Google requests per call. */
export const RENAME_BATCH = 10;

export function placeholderName(
	files: NamingFile[],
	title: string,
	part: string,
	naming: NamingRules,
	piece: { composer?: string; catalogue?: string } = {}
): string {
	const short = guessShortTitle(files, title, naming, piece);
	return [short, cleanShortTitle(part, naming), naming.status.missing].join(naming.separator);
}

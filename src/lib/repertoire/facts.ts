/**
 * A piece's background ("Wissenswertes", #411): free text for whoever presents the concert and
 * for the Programmheft. Paragraphs are separated by an empty line; lines starting with
 * "Quelle:" say where it comes from and are shown apart, small. Links in it are kept as links.
 */

export type FactSegment = { text: string } | { url: string; label: string };
export type FactLine = FactSegment[];

export interface ParsedFacts {
	/** The text, as paragraphs of text and links. */
	paragraphs: FactLine[];
	/** "Quelle: Wikipedia …", without the word "Quelle". */
	sources: FactLine[];
}

const SOURCE = /^\s*(quellen?|sources?)\s*:\s*/i;
const URL = /https?:\/\/[^\s<>"]+/g;
// A link at the end of a sentence: the full stop belongs to the sentence, a closing bracket only
// when the link didn't open it ("Egmont_(Beethoven)" keeps its own).
function trimLink(url: string): string {
	let end = url.length;
	while (end > 0) {
		const char = url[end - 1];
		if (char === ')' && (url.slice(0, end).match(/\(/g)?.length ?? 0) >= (url.slice(0, end).match(/\)/g)?.length ?? 0)) break;
		if (!`.,;:!?)]»“"'`.includes(char)) break;
		end--;
	}
	return url.slice(0, end);
}

/** Written the same way every time: no stray spaces at the ends of lines, at most one empty line. */
export function tidyFacts(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** "https://de.wikipedia.org/wiki/Egmont" → "de.wikipedia.org". */
function linkLabel(url: string): string {
	try {
		return new globalThis.URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

/** A line as text and links. */
export function factSegments(line: string): FactLine {
	const segments: FactLine = [];
	let at = 0;
	for (const match of line.matchAll(URL)) {
		const url = trimLink(match[0]);
		const start = match.index ?? 0;
		if (start > at) segments.push({ text: line.slice(at, start) });
		segments.push({ url, label: linkLabel(url) });
		at = start + url.length;
	}
	if (at < line.length) segments.push({ text: line.slice(at) });
	return segments;
}

export function parseFacts(text: string | undefined): ParsedFacts {
	const paragraphs: FactLine[] = [];
	const sources: FactLine[] = [];
	for (const block of tidyFacts(text ?? '').split(/\n\s*\n/)) {
		const kept: string[] = [];
		for (const line of block.split('\n')) {
			if (SOURCE.test(line)) {
				const rest = line.replace(SOURCE, '').trim();
				if (rest) sources.push(factSegments(rest));
			} else if (line.trim()) kept.push(line.trim());
		}
		// Lines of one paragraph run on, as typed in a sheet cell.
		if (kept.length) paragraphs.push(factSegments(kept.join(' ')));
	}
	return { paragraphs, sources };
}

/** The text without its sources, as words. */
const words = (text: string | undefined) =>
	tidyFacts(text ?? '')
		.split('\n')
		.filter((line) => !SOURCE.test(line))
		.join(' ')
		.replace(URL, '')
		.split(/\s+/)
		.filter(Boolean).length;

/** About 130 words a minute: how long reading it out on stage takes, in seconds. */
export const WORDS_PER_MINUTE = 130;
export function speakingSeconds(text: string | undefined): number {
	return Math.round((words(text) / WORDS_PER_MINUTE) * 60);
}

/** A source line to append to the text, as the lookup writes it. */
export function withSource(text: string, addition: string, source: string): string {
	const before = tidyFacts(text);
	return tidyFacts([before, addition.trim(), source].filter(Boolean).join('\n\n').replace(/\n\n(?=[^\n]*$)/, '\n'));
}

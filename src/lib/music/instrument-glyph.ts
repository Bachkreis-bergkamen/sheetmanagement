import { config } from '#lib/config/index.ts';
import type { InstrumentFamily } from '#lib/config/types.ts';

/**
 * Which little drawing the instrument picker shows for an instrument: the name decides
 * ("Bassklarinette" is a clarinet), else its family, so an orchestra's own instruments get one too.
 */
export type Glyph =
	| 'violin'
	| 'flute'
	| 'clarinet'
	| 'bassoon'
	| 'sax'
	| 'horn'
	| 'trumpet'
	| 'trombone'
	| 'tuba'
	| 'timpani'
	| 'drum'
	| 'cymbal'
	| 'mallets'
	| 'keys'
	| 'organ'
	| 'harp'
	| 'voice'
	| 'score';

// First match wins, so "Englischhorn" is a clarinet before "horn" makes it a horn.
const BY_NAME: [RegExp, Glyph][] = [
	[/saxophon/, 'sax'],
	[/fagott/, 'bassoon'],
	[/oboe|englischhorn|klarinette/, 'clarinet'],
	[/fl(ö|oe)te|piccolo/, 'flute'],
	[/horn/, 'horn'],
	[/trompete|kornett|fl(ü|ue)gelhorn/, 'trumpet'],
	[/posaune/, 'trombone'],
	[/tuba|bariton|euphonium/, 'tuba'],
	[/pauke/, 'timpani'],
	[/glockenspiel|xylophon|vibraphon|marimba|mallet|röhrenglocken|crotales/, 'mallets'],
	[/becken|tamtam|gong/, 'cymbal'],
	[/geige|viola|violine|bratsche|cello|kontrabass|e-bass/, 'violin'],
	[/orgel/, 'organ'],
	[/klavier|cembalo|synthesizer|continuo|piano/, 'keys'],
	[/harfe/, 'harp'],
	[/sopran|alt$|tenor$|bass$|chor|gesang/, 'voice']
];

const BY_FAMILY: Record<InstrumentFamily, Glyph> = {
	partitur: 'score',
	holz: 'clarinet',
	blech: 'trumpet',
	schlagwerk: 'drum',
	tasten: 'keys',
	gesang: 'voice',
	streicher: 'violin',
	sonstige: 'score'
};

export function instrumentGlyph(name: string, family: InstrumentFamily | undefined): Glyph {
	const word = name.toLowerCase();
	return BY_NAME.find(([pattern]) => pattern.test(word))?.[1] ?? (family ? BY_FAMILY[family] : 'score');
}

/** For an instrument of the orchestra's list, by its name in the file names ("Viola") or its label ("Bratsche"). */
export function glyphOf(name: string): Glyph {
	const known = config.instruments.find((instrument) => instrument.name === name || instrument.label === name);
	return instrumentGlyph(known?.name ?? name, known?.family);
}

/** For a file: the drawing of its first instrument, a score sheet when it names none. */
export const partGlyph = (part: { instruments: string[]; family?: InstrumentFamily }): Glyph =>
	part.instruments.length ? instrumentGlyph(part.instruments[0], part.family) : 'score';

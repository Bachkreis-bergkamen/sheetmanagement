import { config } from '#lib/config/index.ts';
import type { InstrumentFamily } from '#lib/config/types.ts';

/**
 * Which little drawing the instrument picker shows for an instrument: the name decides
 * ("Bassklarinette" is a clarinet), else its family, so an orchestra's own instruments get one too.
 */
export type Glyph =
	| 'violin'
	| 'cello'
	| 'contrabass'
	| 'electricBass'
	| 'guitar'
	| 'mandolin'
	| 'recorder'
	| 'flute'
	| 'piccolo'
	| 'oboe'
	| 'clarinet'
	| 'bassClarinet'
	| 'contrabassClarinet'
	| 'bassetHorn'
	| 'contrabassoon'
	| 'bassoon'
	| 'sax'
	| 'sopranoSax'
	| 'horn'
	| 'trumpet'
	| 'trombone'
	| 'tuba'
	| 'wagnerTuba'
	| 'timpani'
	| 'drum'
	| 'snare'
	| 'fieldDrum'
	| 'bassDrum'
	| 'toms'
	| 'bongos'
	| 'congas'
	| 'djembe'
	| 'cajon'
	| 'hiHat'
	| 'suspendedCymbal'
	| 'clashCymbals'
	| 'gong'
	| 'triangle'
	| 'cowbell'
	| 'agogo'
	| 'anvil'
	| 'claves'
	| 'woodBlock'
	| 'templeBlocks'
	| 'guiro'
	| 'maracas'
	| 'shaker'
	| 'rainStick'
	| 'ratchet'
	| 'whip'
	| 'vibraslap'
	| 'flexatone'
	| 'sleighBells'
	| 'windChimes'
	| 'markTree'
	| 'brakeDrum'
	| 'steelPan'
	| 'tambourine'
	| 'castanets'
	| 'claps'
	| 'snap'
	| 'stomp'
	| 'whistle'
	| 'sandBlocks'
	| 'sandpaper'
	| 'typewriter'
	| 'mallets'
	| 'vibraphone'
	| 'glockenspiel'
	| 'tubularBells'
	| 'crotales'
	| 'keys'
	| 'synth'
	| 'accordion'
	| 'celesta'
	| 'organ'
	| 'harp'
	| 'voice'
	| 'score';

// First match wins: "Englischhorn" is an oboe before "horn" makes it a horn, "Blockflöte" a recorder
// before it is a flute, "Hi-Hat" and "Ride-Becken" stand before the plain "Becken" of a pair.
const BY_NAME: [RegExp, Glyph][] = [
	[/sopran-?saxophon/, 'sopranoSax'],
	[/saxophon/, 'sax'],
	[/kontrafagott/, 'contrabassoon'],
	[/fagott/, 'bassoon'],
	[/oboe|englischhorn|heckelphon/, 'oboe'],
	[/kontrabass-?klarinette/, 'contrabassClarinet'],
	[/(alt|bass)-?klarinette/, 'bassClarinet'],
	[/bassetthorn/, 'bassetHorn'],
	[/klarinette/, 'clarinet'],
	[/blockfl(ö|oe)te/, 'recorder'],
	[/piccolo/, 'piccolo'],
	[/fl(ö|oe)te/, 'flute'],
	[/trompete|kornett|fl(ü|ue)gelhorn/, 'trumpet'],
	[/wagnertuba/, 'wagnerTuba'],
	[/tenorhorn/, 'tuba'],
	[/horn/, 'horn'],
	[/posaune/, 'trombone'],
	[/tuba|bariton|euphonium|sousaphon|cimbasso|ophikleide/, 'tuba'],
	[/pauke/, 'timpani'],
	[/hi-?hat/, 'hiHat'],
	[/crash|ride|china|hängend|suspended/, 'suspendedCymbal'],
	[/fingerzimbel|becken/, 'clashCymbals'],
	[/tamtam|gong/, 'gong'],
	[/tempelblock/, 'templeBlocks'],
	[/holzblock|woodblock/, 'woodBlock'],
	[/glockenspiel/, 'glockenspiel'],
	[/röhrenglocke/, 'tubularBells'],
	[/crotales/, 'crotales'],
	[/vibraphon|marimba/, 'vibraphone'],
	[/xylophon|mallet/, 'mallets'],
	[/kuhglocke|cowbell/, 'cowbell'],
	[/agogo/, 'agogo'],
	[/windspiel/, 'windChimes'],
	[/mark tree/, 'markTree'],
	[/schellen/, 'sleighBells'],
	[/triangel/, 'triangle'],
	[/tamburin/, 'tambourine'],
	[/snare|kleine trommel/, 'snare'],
	[/bass drum|gro(ß|ss)e trommel/, 'bassDrum'],
	[/brake drum/, 'brakeDrum'],
	[/steel drum/, 'steelPan'],
	[/drumset|schlagwerk|schlagzeug/, 'drum'],
	[/trommel/, 'fieldDrum'],
	[/toms|timbales|low drum/, 'toms'],
	[/bongo/, 'bongos'],
	[/conga/, 'congas'],
	[/djemb/, 'djembe'],
	[/caj(o|ó)n/, 'cajon'],
	[/amboss/, 'anvil'],
	[/claves/, 'claves'],
	[/g(ü|u)iro/, 'guiro'],
	[/maracas|cabasa/, 'maracas'],
	[/shaker/, 'shaker'],
	[/regenmacher/, 'rainStick'],
	[/ratsche/, 'ratchet'],
	[/peitsche/, 'whip'],
	[/vibraslap/, 'vibraslap'],
	[/flexaton/, 'flexatone'],
	[/kastagnette|castanet/, 'castanets'],
	[/klatsch|clap|body ?percussion/, 'claps'],
	[/schnips|snap/, 'snap'],
	[/stampf|stomp/, 'stomp'],
	[/trillerpfeife|signalpfeife|^pfeife|whistle/, 'whistle'],
	[/sand-? ?bl(ö|o)ck/, 'sandBlocks'],
	[/sandpapier|sandpaper/, 'sandpaper'],
	[/schreibmaschine|typewriter/, 'typewriter'],
	[/cello/, 'cello'],
	[/kontrabass/, 'contrabass'],
	[/e-bass|e-gitarre/, 'electricBass'],
	[/gitarre/, 'guitar'],
	[/mandolin/, 'mandolin'],
	[/geige|viola|violine|bratsche/, 'violin'],
	[/orgel/, 'organ'],
	[/synthesizer|keyboard/, 'synth'],
	[/akkordeon/, 'accordion'],
	[/celesta/, 'celesta'],
	[/klavier|cembalo|continuo|piano/, 'keys'],
	[/harfe/, 'harp'],
	[/sopran|alt$|tenor$|bass$|chor$|gesang/, 'voice']
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

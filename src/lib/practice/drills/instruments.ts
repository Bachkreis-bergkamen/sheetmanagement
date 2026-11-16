import { diatonic, pitchOf, type Clef } from './theory.ts';

/**
 * What a drill needs to know about an instrument (#300, #315): the clefs it reads, the written
 * range in each, and how far its sound is from what's written. Ranges are a comfortable
 * amateur range, not the extreme one: a drill shouldn't ask a young violinist for E7.
 */
export interface InstrumentProfile {
	id: ProfileId;
	clefs: Clef[];
	/**
	 * Written range per clef, lowest and highest note as diatonic indices. The player's own range
	 * once measured (see reach.ts), else the comfortable one.
	 */
	range: Partial<Record<Clef, [low: number, high: number]>>;
	/**
	 * How far an experienced player gets, written, over all clefs: a personal range grows up to it
	 * (an old hand on the trumpet plays the high E). The comfortable range where none is given.
	 */
	extreme: [low: number, high: number];
	/** Semitones from written to sounding: -2 for a B♭ clarinet, -12 for a double bass. */
	transposition: number;
	/**
	 * Clefs learnt all at once, as a pianist reads both staves from the start. Otherwise they come
	 * one after another, in the order of `clefs` (a cellist: bass, then tenor, then treble).
	 */
	together?: boolean;
	/**
	 * Parts written for another instrument of the family that players read on theirs, as the
	 * semitones from the part's written note to its sound: a trumpet part "in D" is +2, a horn part
	 * "in E♭" -9. Hardest last.
	 */
	parts?: PartKey[];
}

/** A part "in D": the key's letter and accidental, and how far it sounds from what's written. */
export interface PartKey {
	step: number;
	alter: number;
	semitones: number;
}

const part = (name: string, semitones: number): PartKey => ({ step: 'CDEFGAB'.indexOf(name[0]), alter: name.endsWith('b') ? -1 : 0, semitones });

export const PROFILE_IDS = [
	'violin',
	'viola',
	'cello',
	'doubleBass',
	'flute',
	'piccolo',
	'oboe',
	'englishHorn',
	'clarinet',
	'bassClarinet',
	'bassoon',
	'sopranoSax',
	'altoSax',
	'tenorSax',
	'baritoneSax',
	'horn',
	'trumpet',
	'trombone',
	'euphonium',
	'tuba',
	'timpani',
	'mallets',
	'keys',
	'highVoice',
	'lowVoice',
	'treble',
	'bass'
] as const;

export type ProfileId = (typeof PROFILE_IDS)[number];

const r = (low: string, high: string): [number, number] => [diatonic(pitchOf(low)), diatonic(pitchOf(high))];

/** What's written down per instrument; `extreme` as two names, the whole comfortable range when left out. */
type Base = Omit<InstrumentProfile, 'id' | 'extreme'> & { extreme?: [number, number] };

const PROFILES: Record<ProfileId, Base> = {
	violin: { clefs: ['treble'], range: { treble: r('G3', 'E6') }, extreme: r('G3', 'E7'), transposition: 0 },
	viola: { clefs: ['alto', 'treble'], range: { alto: r('C3', 'D5'), treble: r('A4', 'D6') }, extreme: r('C3', 'E6'), transposition: 0 },
	cello: { clefs: ['bass', 'tenor', 'treble'], range: { bass: r('C2', 'A4'), tenor: r('D3', 'D5'), treble: r('A4', 'C6') }, extreme: r('C2', 'E6'), transposition: 0 },
	doubleBass: { clefs: ['bass'], range: { bass: r('E2', 'D4') }, extreme: r('E2', 'G4'), transposition: -12 },
	flute: { clefs: ['treble'], range: { treble: r('C4', 'A6') }, extreme: r('B3', 'D7'), transposition: 0 },
	piccolo: { clefs: ['treble'], range: { treble: r('D4', 'A6') }, extreme: r('D4', 'C7'), transposition: 12 },
	oboe: { clefs: ['treble'], range: { treble: r('B3', 'F6') }, extreme: r('B3', 'A6'), transposition: 0 },
	englishHorn: { clefs: ['treble'], range: { treble: r('B3', 'F6') }, extreme: r('B3', 'A6'), transposition: -7 },
	clarinet: { clefs: ['treble'], range: { treble: r('E3', 'G6') }, extreme: r('E3', 'C7'), transposition: -2, parts: [part('A', -3), part('C', 0)] },
	bassClarinet: { clefs: ['treble'], range: { treble: r('E3', 'G5') }, extreme: r('E3', 'C6'), transposition: -14 },
	bassoon: { clefs: ['bass', 'tenor'], range: { bass: r('B1', 'G4'), tenor: r('D3', 'D5') }, extreme: r('B1', 'E5'), transposition: 0 },
	sopranoSax: { clefs: ['treble'], range: { treble: r('B3', 'F6') }, extreme: r('B3', 'A6'), transposition: -2, parts: [part('C', 0)] },
	altoSax: { clefs: ['treble'], range: { treble: r('B3', 'F6') }, extreme: r('B3', 'A6'), transposition: -9, parts: [part('C', 0)] },
	tenorSax: { clefs: ['treble'], range: { treble: r('B3', 'F6') }, extreme: r('B3', 'A6'), transposition: -14, parts: [part('C', 0)] },
	baritoneSax: { clefs: ['treble'], range: { treble: r('B3', 'F6') }, extreme: r('B3', 'A6'), transposition: -21, parts: [part('C', 0)] },
	horn: {
		clefs: ['treble'],
		range: { treble: r('G3', 'C6') },
		extreme: r('F3', 'D6'),
		transposition: -7,
		parts: [part('Eb', -9), part('D', -10), part('E', -8), part('G', -5), part('C', -12), part('Bb', -2)]
	},
	trumpet: {
		clefs: ['treble'],
		range: { treble: r('G3', 'C6') },
		extreme: r('F3', 'E6'),
		transposition: -2,
		parts: [part('C', 0), part('D', 2), part('Eb', 3), part('F', 5), part('E', 4), part('A', -3)]
	},
	trombone: { clefs: ['bass', 'tenor'], range: { bass: r('E2', 'F4'), tenor: r('D3', 'C5') }, extreme: r('E2', 'F5'), transposition: 0 },
	euphonium: { clefs: ['bass'], range: { bass: r('E2', 'A4') }, extreme: r('B1', 'F5'), transposition: 0 },
	tuba: { clefs: ['bass'], range: { bass: r('F1', 'F4') }, extreme: r('D1', 'A4'), transposition: 0 },
	timpani: { clefs: ['bass'], range: { bass: r('C2', 'A3') }, transposition: 0 },
	mallets: { clefs: ['treble'], range: { treble: r('F3', 'C7') }, transposition: 0 },
	keys: { clefs: ['treble', 'bass'], range: { treble: r('C4', 'C6'), bass: r('C2', 'C4') }, transposition: 0, together: true },
	highVoice: { clefs: ['treble'], range: { treble: r('A3', 'A5') }, extreme: r('F3', 'C6'), transposition: 0 },
	lowVoice: { clefs: ['bass'], range: { bass: r('E2', 'E4') }, extreme: r('D2', 'G4'), transposition: 0 },
	treble: { clefs: ['treble'], range: { treble: r('A3', 'C6') }, transposition: 0 },
	bass: { clefs: ['bass'], range: { bass: r('C2', 'E4') }, transposition: 0 }
};

/** The lowest and highest note of all of a range's clefs. */
export function span(range: InstrumentProfile['range']): [number, number] {
	const spans = Object.values(range);
	return [Math.min(...spans.map((each) => each[0])), Math.max(...spans.map((each) => each[1]))];
}

/**
 * The players' own ranges, written, per instrument (see reach.ts); set by the Übebereich from
 * what's kept on the device. Kept here so every drill (notes to play, scales, melodies, tuning)
 * keeps to it without each being told.
 */
let reaches: Partial<Record<ProfileId, [low: number, high: number]>> = {};

export function useReaches(value: Partial<Record<ProfileId, { low: number; high: number }>> | undefined) {
	reaches = Object.fromEntries(Object.entries(value ?? {}).map(([id, reach]) => [id, [reach.low, reach.high]]));
}

/**
 * The comfortable range per clef, moved to the player's own range: the lowest clef reaches down
 * to its low note, the highest up to its top one, and each clef is cut to it. A clef left with
 * nothing (a beginner cellist's treble) has no range, so nothing is played in it.
 */
function personal(base: InstrumentProfile['range'], [low, high]: [number, number]): InstrumentProfile['range'] {
	const [bottom, top] = span(base);
	const range: InstrumentProfile['range'] = {};
	for (const [clef, [from, to]] of Object.entries(base) as [Clef, [number, number]][]) {
		const lo = from === bottom ? low : Math.max(from, low);
		const hi = to === top ? high : Math.min(to, high);
		if (lo <= hi) range[clef] = [lo, hi];
	}
	return range;
}

export function profile(id: ProfileId, own = true): InstrumentProfile {
	const { extreme, ...base } = PROFILES[id];
	const reach = own ? reaches[id] : undefined;
	return { id, ...base, extreme: extreme ?? span(base.range), range: reach ? personal(base.range, reach) : base.range };
}

export const isProfileId = (value: unknown): value is ProfileId => typeof value === 'string' && (PROFILE_IDS as readonly string[]).includes(value);

/**
 * An instrument's name in the orchestra's list ("Bratsche", "Klarinette in B", "Tenorsaxophon")
 * to its profile. First match wins, so the specific names go before the general ones.
 */
const BY_NAME: [RegExp, ProfileId][] = [
	[/kontrabass|double ?bass|contrabass|e-bass|bass guitar|bassgitarre/, 'doubleBass'],
	[/bassklarinette|bass clarinet/, 'bassClarinet'],
	[/sopransax|soprano sax/, 'sopranoSax'],
	[/altsax|alto sax/, 'altoSax'],
	[/tenorsax|tenor sax/, 'tenorSax'],
	[/baritonsax|baritone sax/, 'baritoneSax'],
	[/saxophon/, 'altoSax'],
	[/englischhorn|english horn|cor anglais/, 'englishHorn'],
	[/violoncello|cello/, 'cello'],
	[/viola|bratsche/, 'viola'],
	[/violine|geige|violin/, 'violin'],
	[/piccolo/, 'piccolo'],
	[/fl(ö|oe)te|flute/, 'flute'],
	[/oboe/, 'oboe'],
	[/klarinette|clarinet/, 'clarinet'],
	[/fagott|bassoon/, 'bassoon'],
	// Before the horn: a Flügelhorn plays like a trumpet, a Tenorhorn like a euphonium.
	[/trompete|trumpet|kornett|cornet|fl(ü|ue)gelhorn/, 'trumpet'],
	[/euphonium|bariton|tenorhorn/, 'euphonium'],
	[/horn/, 'horn'],
	[/posaune|trombone/, 'trombone'],
	[/tuba/, 'tuba'],
	[/pauke|timpani/, 'timpani'],
	[/glockenspiel|xylophon|vibraphon|marimba|mallet/, 'mallets'],
	[/klavier|piano|cembalo|harpsichord|orgel|organ|harfe|harp|keyboard|continuo/, 'keys'],
	[/sopran|alt\b|^alt|mezzo|chor|choir|gesang|voice/, 'highVoice'],
	[/tenor|bass\b|^bass|bariton/, 'lowVoice']
];

/** The profile for an instrument's name; null when it names none of them (percussion, say). */
export function profileFor(name: string): ProfileId | null {
	const word = name.toLowerCase();
	return BY_NAME.find(([pattern]) => pattern.test(word))?.[1] ?? null;
}

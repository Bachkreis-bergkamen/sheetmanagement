/**
 * The bit of music theory the Übebereich's drills need (#300, #315): written pitches, where they
 * sit on a staff in each clef, key signatures and the keys they stand for. Pure arithmetic, so
 * every drill can be generated and checked on the device.
 */

export type Clef = 'treble' | 'bass' | 'alto' | 'tenor';
export const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

/** A written pitch: `step` 0 C … 6 B (German H), `alter` -2 to 2 semitones, scientific octave (C4 middle C). */
export interface Pitch {
	step: number;
	alter: number;
	octave: number;
}

const mod = (value: number, by: number) => ((value % by) + by) % by;

/** Semitones of the natural notes above C. */
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/** The pitch counted in letter names from C0: C4 is 28, D4 29. */
export const diatonic = (pitch: Pitch) => pitch.octave * 7 + pitch.step;

export const fromDiatonic = (index: number, alter = 0): Pitch => ({ step: mod(index, 7), alter, octave: Math.floor(index / 7) });

/** MIDI number: C4 is 60, A4 69. */
export const midiOf = (pitch: Pitch) => (pitch.octave + 1) * 12 + NATURAL[pitch.step] + pitch.alter;

/** "E4" → pitch; for tables of ranges. Letters in English, naturals only. */
export function pitchOf(name: string): Pitch {
	const match = /^([A-G])(-?\d)$/.exec(name);
	if (!match) throw new Error(`Not a pitch: ${name}`);
	return { step: 'CDEFGAB'.indexOf(match[1]), alter: 0, octave: Number(match[2]) };
}

/** The note on each clef's bottom line, as a diatonic index. */
const BOTTOM_LINE: Record<Clef, number> = {
	treble: diatonic(pitchOf('E4')),
	bass: diatonic(pitchOf('G2')),
	alto: diatonic(pitchOf('F3')),
	tenor: diatonic(pitchOf('D3'))
};

/** Steps above the bottom line: 0 the bottom line, 1 the first space, 8 the top line, -2 the first ledger line below. */
export const staffPosition = (clef: Clef, pitch: Pitch) => diatonic(pitch) - BOTTOM_LINE[clef];

export const pitchAt = (clef: Clef, position: number, alter = 0) => fromDiatonic(BOTTOM_LINE[clef] + position, alter);

/** The ledger lines a note at `position` needs, as staff positions (even numbers outside 0–8). */
export function ledgerLines(position: number): number[] {
	const lines: number[] = [];
	for (let line = -2; line >= position; line -= 2) lines.push(line);
	for (let line = 10; line <= position; line += 2) lines.push(line);
	return lines;
}

/**
 * The note each clef is named after, the reader's landmark: G4 on the treble clef's second line,
 * F3 on the bass clef's fourth, middle C at the middle of the alto clef and the tenor clef's fourth
 * line. Notes are learnt outwards from it (landmark reading).
 */
export const LANDMARK: Record<Clef, number> = { treble: 2, bass: 6, alto: 4, tenor: 6 };

/** Sharps and flats in the order they are added. */
const SHARP_STEPS = [3, 0, 4, 1, 5, 2, 6];
const FLAT_STEPS = [6, 2, 5, 1, 4, 0, 3];

/**
 * Where each clef writes the key signature's accidentals, as staff positions in their order.
 * The tenor clef's sharps are the classic exception: written low, so none goes above the staff.
 */
export const SIGNATURE_POSITIONS: Record<Clef, { sharps: number[]; flats: number[] }> = {
	treble: { sharps: [8, 5, 9, 6, 3, 7, 4], flats: [4, 7, 3, 6, 2, 5, 1] },
	bass: { sharps: [6, 3, 7, 4, 1, 5, 2], flats: [2, 5, 1, 4, 0, 3, -1] },
	alto: { sharps: [7, 4, 8, 5, 2, 6, 3], flats: [3, 6, 2, 5, 1, 4, 0] },
	tenor: { sharps: [2, 6, 3, 7, 4, 8, 5], flats: [5, 8, 4, 7, 3, 6, 2] }
};

/** The accidentals of a key signature with `fifths` sharps (positive) or flats (negative), -7 to 7. */
export function keySignature(fifths: number): { step: number; alter: number }[] {
	const count = Math.min(7, Math.abs(fifths));
	return (fifths >= 0 ? SHARP_STEPS : FLAT_STEPS).slice(0, count).map((step) => ({ step, alter: Math.sign(fifths) }));
}

/** What the key signature does to a letter: +1 for a sharpened one, -1 for a flattened, 0 else. */
export const alterInKey = (step: number, fifths: number) => keySignature(fifths).find((accidental) => accidental.step === step)?.alter ?? 0;

/** The tonic of the major key (or its relative minor) with `fifths` sharps or flats. */
export function tonic(fifths: number, mode: 'major' | 'minor'): { step: number; alter: number } {
	// Up a fifth is four letters and seven semitones; the minor is a sixth above the major, three semitones down.
	const step = mod(fifths * 4 + (mode === 'minor' ? 5 : 0), 7);
	const pitchClass = mod(fifths * 7 + (mode === 'minor' ? 9 : 0), 12);
	let alter = pitchClass - NATURAL[step];
	if (alter > 6) alter -= 12;
	if (alter < -6) alter += 12;
	return { step, alter };
}

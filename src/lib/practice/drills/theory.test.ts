import { describe, expect, it } from 'vitest';
import { alterInKey, keySignature, ledgerLines, midiOf, pitchAt, pitchOf, SIGNATURE_POSITIONS, staffPosition, tonic, type Clef } from './theory.ts';

describe('staff positions', () => {
	it('puts each clef’s notes on the right lines', () => {
		expect(staffPosition('treble', pitchOf('E4'))).toBe(0);
		expect(staffPosition('treble', pitchOf('G4'))).toBe(2);
		expect(staffPosition('treble', pitchOf('F5'))).toBe(8);
		expect(staffPosition('bass', pitchOf('G2'))).toBe(0);
		expect(staffPosition('bass', pitchOf('F3'))).toBe(6);
		// Middle C: a ledger line below the treble staff, above the bass staff, the alto's middle line, the tenor's fourth.
		expect(staffPosition('treble', pitchOf('C4'))).toBe(-2);
		expect(staffPosition('bass', pitchOf('C4'))).toBe(10);
		expect(staffPosition('alto', pitchOf('C4'))).toBe(4);
		expect(staffPosition('tenor', pitchOf('C4'))).toBe(6);
	});

	it('goes back from a position to its pitch', () => {
		expect(pitchAt('treble', 2)).toEqual({ step: 4, alter: 0, octave: 4 });
		expect(pitchAt('bass', -1)).toEqual({ step: 3, alter: 0, octave: 2 });
		expect(midiOf(pitchAt('alto', 4))).toBe(60);
	});

	it('draws ledger lines between the staff and the note', () => {
		expect(ledgerLines(4)).toEqual([]);
		expect(ledgerLines(-1)).toEqual([]);
		expect(ledgerLines(-2)).toEqual([-2]);
		expect(ledgerLines(-5)).toEqual([-2, -4]);
		expect(ledgerLines(9)).toEqual([]);
		expect(ledgerLines(12)).toEqual([10, 12]);
	});
});

describe('keys', () => {
	it('adds sharps and flats in their order', () => {
		expect(keySignature(0)).toEqual([]);
		expect(keySignature(2).map((accidental) => accidental.step)).toEqual([3, 0]);
		expect(keySignature(-3).map((accidental) => accidental.step)).toEqual([6, 2, 5]);
		expect(alterInKey(3, 1)).toBe(1);
		expect(alterInKey(6, -1)).toBe(-1);
		expect(alterInKey(0, -1)).toBe(0);
	});

	it('names the major and minor key of each signature', () => {
		expect(tonic(0, 'major')).toEqual({ step: 0, alter: 0 });
		expect(tonic(0, 'minor')).toEqual({ step: 5, alter: 0 });
		expect(tonic(1, 'major')).toEqual({ step: 4, alter: 0 });
		expect(tonic(-1, 'major')).toEqual({ step: 3, alter: 0 });
		expect(tonic(-2, 'major')).toEqual({ step: 6, alter: -1 });
		expect(tonic(3, 'minor')).toEqual({ step: 3, alter: 1 });
		expect(tonic(-6, 'minor')).toEqual({ step: 2, alter: -1 });
		expect(tonic(7, 'major')).toEqual({ step: 0, alter: 1 });
		expect(tonic(-7, 'major')).toEqual({ step: 0, alter: -1 });
	});

	it('writes each accidental of a signature on a line or space of its letter', () => {
		for (const clef of ['treble', 'bass', 'alto', 'tenor'] as Clef[]) {
			for (const [kind, sign] of [['sharps', 1], ['flats', -1]] as const) {
				keySignature(7 * sign).forEach((accidental, i) => expect(pitchAt(clef, SIGNATURE_POSITIONS[clef][kind][i]).step, `${clef} ${kind} ${i}`).toBe(accidental.step));
			}
		}
	});
});

import { describe, expect, it } from 'vitest';
import { interleave, KEY_ORDER, keyOptions, kindOf, noteOrder, notesOrder, playOrder, questionFor } from './decks.ts';
import { midiOf, pitchOf, staffPosition } from './theory.ts';

describe('noteOrder', () => {
	it('starts at the clef’s landmark and learns the staff before the ledger lines', () => {
		const treble = noteOrder('treble');
		expect(treble.slice(0, 3)).toEqual([2, 1, 3]);
		expect(treble.slice(0, 9).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
		expect(treble.slice(9, 11)).toEqual([-1, 9]);
		expect(treble.at(-1)).toBe(14);
		expect(noteOrder('bass')[0]).toBe(6);
		expect(noteOrder('alto')[0]).toBe(4);
	});

	it('keeps to an instrument’s range', () => {
		// A violin goes no lower than G3: two ledger lines and a space below the staff.
		const violin = playOrder('violin', 'treble');
		const lowest = staffPosition('treble', pitchOf('G3'));
		expect(violin).toContain(`play:violin:treble:${lowest}`);
		expect(violin).not.toContain(`play:violin:treble:${lowest - 1}`);
		expect(playOrder('violin', 'bass')).toEqual([]);
	});

	it('gives every note a question', () => {
		expect(notesOrder('treble')[0]).toBe('notes:treble:2');
		expect(questionFor('notes:treble:2', 'treble')).toEqual({ kind: 'notes', id: 'notes:treble:2', clef: 'treble', pitch: pitchOf('G4') });
	});
});

describe('keys', () => {
	it('goes round the circle of fifths, majors before their minors', () => {
		expect(KEY_ORDER.slice(0, 5)).toEqual(['keys:0:major', 'keys:1:major', 'keys:-1:major', 'keys:2:major', 'keys:-2:major']);
		expect(KEY_ORDER[5]).toBe('keys:0:minor');
		expect(KEY_ORDER).toHaveLength(30);
		expect(new Set(KEY_ORDER).size).toBe(30);
	});

	it('offers the right key among its usual mix-ups', () => {
		const options = keyOptions(2, () => 0.5);
		expect(options.sort((a, b) => a - b)).toEqual([-2, 1, 2, 3]);
		expect(keyOptions(7).sort((a, b) => a - b)).toEqual([-7, 5, 6, 7]);
		expect(keyOptions(0).sort((a, b) => a - b)).toEqual([-1, 0, 1, 2]);
		const question = questionFor('keys:-3:minor', 'bass');
		expect(question).toMatchObject({ kind: 'keys', fifths: -3, mode: 'minor', clef: 'bass' });
	});
});

describe('playing', () => {
	it('expects the sounding note of a transposing instrument', () => {
		const position = staffPosition('treble', pitchOf('C5'));
		expect(questionFor(`play:clarinet:treble:${position}`, 'treble')).toMatchObject({ kind: 'play', midi: midiOf(pitchOf('C5')) - 2 });
		expect(questionFor(`play:doubleBass:bass:0`, 'bass')).toMatchObject({ midi: midiOf(pitchOf('G2')) - 12 });
		expect(questionFor('nonsense', 'treble')).toBeNull();
		expect(kindOf('play:violin:treble:2')).toBe('play');
	});
});

describe('interleave', () => {
	it('takes from each drill in turn', () => {
		expect(interleave(['a1', 'a2', 'a3'], ['b1'])).toEqual(['a1', 'b1', 'a2', 'a3']);
	});
});

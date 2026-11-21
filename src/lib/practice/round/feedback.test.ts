import { describe, expect, it } from 'vitest';
import * as t from '#lib/i18n/texts.ts';
import { FLUENT_MS, type Question } from '#lib/practice/drills/decks.ts';
import type { PulseVerdict, TapVerdict } from '#lib/practice/drills/rhythm.ts';
import type { ScaleVerdict } from '#lib/practice/drills/scales.ts';
import { TUNED } from '#lib/practice/drills/together.ts';
import {
	chordFeedback,
	heardFeedback,
	intervalFeedback,
	keyFeedback,
	melodyFeedback,
	midiName,
	noteFeedback,
	noteName,
	pitchFeedback,
	pulseFeedback,
	rhythmFeedback,
	scaleFeedback,
	skippedFeedback,
	tuneFeedback
} from './feedback.ts';

const tx = t.drills;
type Of<K extends Question['kind']> = Extract<Question, { kind: K }>;

const note = { kind: 'notes', id: 'notes:treble:0', clef: 'treble', pitch: { step: 4, alter: 0, octave: 4 } } as Of<'notes'>;
const key = (fifths: number, mode: 'major' | 'minor' = 'major') => ({ kind: 'keys', id: 'keys', clef: 'treble', fifths, mode, options: [fifths, 0, 1, -1] }) as Of<'keys'>;
const tap = (verdict: Partial<TapVerdict>): TapVerdict => ({ correct: true, deviations: [0, 0], extra: [], meanOff: 20, tendency: 0, ...verdict });

describe('naming', () => {
	it('names a MIDI note with its octave', () => {
		expect(midiName(69)).toBe(`${t.practice.tuner.notes[9]}4`);
		expect(midiName(60)).toBe(`${t.practice.tuner.notes[0]}4`);
	});
});

describe('answers by choice', () => {
	it('takes the right letter, and says which way a wrong one lies', () => {
		expect(noteFeedback(note, 4)).toEqual({ correct: true, text: '' });
		expect(noteFeedback(note, 5)).toEqual({ correct: false, text: tx.wrongNote(noteName(4), noteName(5), 1) });
		expect(noteFeedback(note, 3)).toEqual({ correct: false, text: tx.wrongNote(noteName(4), noteName(3), -1) });
		// The nearest way round: from the fifth letter, the first is three up, the second three down.
		expect(noteFeedback(note, 0).text).toBe(tx.wrongNote(noteName(4), noteName(0), 3));
		expect(noteFeedback(note, 1).text).toBe(tx.wrongNote(noteName(4), noteName(1), -3));
		expect(noteFeedback(note, null)).toEqual({ correct: false, text: tx.itIs(noteName(4)) });
	});

	it('gives the rule for a key with sharps, flats or in minor', () => {
		expect(keyFeedback(key(2), 2).correct).toBe(true);
		expect(keyFeedback(key(2), 1).tip).toBe(tx.tips.sharps);
		expect(keyFeedback(key(-3), null).tip).toBe(tx.tips.flats);
		expect(keyFeedback(key(1, 'minor'), 0).tip).toBe(tx.tips.minor);
		expect(keyFeedback(key(0), 1).tip).toBeUndefined();
	});

	it('names the interval, chord or melody it was', () => {
		const ear = { kind: 'ear', semitones: 7 } as Of<'ear'>;
		expect(intervalFeedback(ear, 7).correct).toBe(true);
		expect(intervalFeedback(ear, 5)).toEqual({ correct: false, text: tx.intervalWas(tx.intervals[7], 7) });
		const chord = { kind: 'chord', quality: 'minor' } as Of<'chord'>;
		expect(chordFeedback(chord, 'minor').correct).toBe(true);
		expect(chordFeedback(chord, null).text).toBe(tx.chordWas(tx.chordQualities.minor, tx.chordHow.minor));
		const dict = { kind: 'dict', answer: 1 } as Of<'dict'>;
		expect(melodyFeedback(dict, 1).correct).toBe(true);
		expect(melodyFeedback(dict, 0).text).toBe(tx.melodyWas(2));
	});

	it('tells how to transpose, for a part or for the sounding note', () => {
		const trans = { kind: 'trans', answer: 2, shift: 2, part: null } as unknown as Of<'trans'>;
		expect(pitchFeedback(trans, 2, 'Klarinette').correct).toBe(true);
		const how = tx.shift(tx.intervals[2], 2);
		expect(pitchFeedback(trans, 0, 'Klarinette').tip).toBe(tx.concertTip('Klarinette', how));
		expect(pitchFeedback({ ...trans, part: { step: 1, alter: 0, semitones: 2 } } as unknown as Of<'trans'>, 0, 'Klarinette').tip).toBe(tx.partTip(how));
		expect(pitchFeedback({ ...trans, shift: 0 }, 0, 'Flöte').tip).toBeUndefined();
	});
});

describe('answers played', () => {
	it('says how in tune a note was, or what was heard', () => {
		expect(heardFeedback({ result: 'right', cents: 4 })).toEqual({ correct: true, text: tx.inTune });
		expect(heardFeedback({ result: 'right', cents: -18 })).toEqual({ correct: true, text: tx.cents(-18) });
		expect(heardFeedback({ result: 'wrong', midi: 62, cents: 0, octave: true }).text).toBe(tx.octave);
		expect(heardFeedback({ result: 'wrong', midi: 62, cents: 0, octave: false }).text).toBe(tx.heard(midiName(62)));
	});

	it('takes a tuned note only within TUNED of pure', () => {
		const tune = { kind: 'tune', tune: { pure: -14, role: 'third' } } as unknown as Of<'tune'>;
		const pure = tuneFeedback(tune, { result: 'right', cents: -14 + TUNED });
		expect(pure).toMatchObject({ correct: true, measure: TUNED, tip: tx.pureTips.third });
		const piano = tuneFeedback(tune, { result: 'right', cents: 0 });
		expect(piano).toMatchObject({ correct: false, text: tx.tunedOff(14), measure: 14 });
		expect(tuneFeedback(tune, { result: 'wrong', midi: 60, cents: 0, octave: false })).toMatchObject({ correct: false, measure: 99 });
	});

	it('counts a rhythm tapped after hearing it as right, but not fluent (#371)', () => {
		const heard = rhythmFeedback(tap({ meanOff: 10 }), 2, true);
		expect(heard).toMatchObject({ correct: true, text: tx.rightHeard, heard: true });
		expect(heard.measure).toBeGreaterThan(FLUENT_MS.rhythm);
		expect(rhythmFeedback(tap({ meanOff: 10 }), 2, false)).toMatchObject({ correct: true, text: tx.inTime, measure: 10 });
		expect(rhythmFeedback(tap({ meanOff: FLUENT_MS.rhythm + 20 }), 2, false).text).toBe(tx.rhythmLoose(FLUENT_MS.rhythm + 20));
	});

	it('says a rhythm missed, untapped, rushed or dragged', () => {
		expect(rhythmFeedback(tap({ correct: false, deviations: [null, null], meanOff: NaN }), 0, false)).toEqual({ correct: false, text: tx.noTaps, measure: 999 });
		const wrong = rhythmFeedback(tap({ correct: false, deviations: [0, null], extra: [300], tendency: -40 }), 2, false);
		expect(wrong).toMatchObject({ text: tx.rhythmWrong(1, 1), tip: tx.rushing });
		expect(rhythmFeedback(tap({ tendency: 40 }), 2, false).tip).toBe(tx.dragging);
	});

	it('says whether the pulse held, and which way it drifted', () => {
		const pulse = (verdict: Partial<PulseVerdict>) => ({ ...tap({}), drift: 0, end: 0, ...verdict }) as PulseVerdict;
		expect(pulseFeedback(pulse({ meanOff: 10 }))).toMatchObject({ correct: true, text: tx.pulseHeld });
		expect(pulseFeedback(pulse({ end: -80 })).tip).toBe(tx.pulseSped(80));
		expect(pulseFeedback(pulse({ end: 80 })).tip).toBe(tx.pulseSlowed(80));
		expect(pulseFeedback(pulse({ correct: false, deviations: [null, null] })).text).toBe(tx.noTaps);
		expect(pulseFeedback(pulse({ correct: false, deviations: [5, null], extra: [1, 2] })).text).toBe(tx.pulseLost(1, 2));
	});

	it('says how clean a scale was, with a tip for sharp, flat or uneven', () => {
		const scale = (verdict: Partial<ScaleVerdict>): ScaleVerdict => ({ correct: true, marks: [], wrong: 0, missed: 0, extra: 0, meanCents: 5, leaning: 0, unevenness: null, ...verdict });
		expect(scaleFeedback(scale({}))).toMatchObject({ correct: true, text: tx.scaleClean, measure: 5 });
		expect(scaleFeedback(scale({ meanCents: 30, leaning: 1 }))).toMatchObject({ text: tx.scaleCents(30), tip: tx.scaleSharp });
		expect(scaleFeedback(scale({ leaning: -1 })).tip).toBe(tx.scaleFlat);
		expect(scaleFeedback(scale({ unevenness: 5 })).tip).toBe(tx.scaleUneven);
		expect(scaleFeedback(scale({ correct: false, marks: [{ state: 'missed' }], meanCents: Infinity }))).toEqual({ correct: false, text: tx.noNotes, measure: 999 });
		expect(scaleFeedback(scale({ correct: false, marks: [{ state: 'missed' }, { state: 'right', cents: 0, onset: 0 }], wrong: 1, missed: 1 })).text).toBe(tx.scaleWrong(1, 1, 0));
	});

	it('shows the answer to a skipped question, the written note for one to play', () => {
		expect(skippedFeedback({ kind: 'rhythm' } as Of<'rhythm'>)).toEqual({ correct: false, text: tx.rhythmShown, measure: 999 });
		expect(skippedFeedback({ kind: 'tune' } as Of<'tune'>).measure).toBe(99);
		const play = { kind: 'play', pitch: { step: 0, alter: 0, octave: 4 }, midi: 58 } as Of<'play'>;
		expect(skippedFeedback(play).text).toBe(tx.itIs(midiName(60)));
	});
});

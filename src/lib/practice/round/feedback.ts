import * as t from '#lib/i18n/texts.ts';
import { FLUENT_MS, type ChordQuality, type Question } from '#lib/practice/drills/decks.ts';
import type { Verdict } from '#lib/practice/drills/judge.ts';
import { DRIFTED, LEANING, type PulseVerdict, type TapVerdict } from '#lib/practice/drills/rhythm.ts';
import { IN_TUNE, UNEVEN, type ScaleVerdict } from '#lib/practice/drills/scales.ts';
import { TUNED } from '#lib/practice/drills/together.ts';
import { midiOf, tonic } from '#lib/practice/drills/theory.ts';

const tx = t.drills;

/**
 * What the drill round (DrillRound) says to an answer: right or not, the words, a tip on how
 * to find it, and `measure`, what counts for fluency when it isn't the time to answer.
 * `heard`: right only after the question was played first, worth half a point (#371).
 */
export type Feedback = { correct: boolean; text: string; tip?: string; measure?: number; heard?: boolean };

type Of<K extends Question['kind']> = Extract<Question, { kind: K }>;

export const noteName = (step: number, alter = 0) => tx.noteName(step, alter);
/** "G-Dur", "e-Moll". */
export function keyLabel(fifths: number, mode: 'major' | 'minor') {
	const key = tonic(fifths, mode);
	return tx.keyName(noteName(key.step, key.alter), mode);
}
/** "A4" for MIDI 69. */
export const midiName = (midi: number) => `${t.practice.tuner.notes[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export const pitchName = (pitchClass: number) => t.practice.tuner.notes[pitchClass];

/** A letter answered, or null for "don't know"; a wrong one says which way the right one lies. */
export function noteFeedback(q: Of<'notes'>, step: number | null): Feedback {
	const right = q.pitch.step;
	if (step === right) return { correct: true, text: '' };
	if (step === null) return { correct: false, text: tx.itIs(noteName(right)) };
	// The letter named, the nearest way up or down from the right one.
	const steps = ((((step - right + 3) % 7) + 7) % 7) - 3;
	return { correct: false, text: tx.wrongNote(noteName(right), noteName(step), steps) };
}

/** A key answered, or null; a wrong one comes with the rule to find it. */
export function keyFeedback(q: Of<'keys'>, fifths: number | null): Feedback {
	const { fifths: right, mode } = q;
	if (fifths === right) return { correct: true, text: '' };
	const tip = mode === 'minor' ? tx.tips.minor : right > 0 ? tx.tips.sharps : right < 0 ? tx.tips.flats : undefined;
	return { correct: false, text: tx.itIs(`${keyLabel(right, mode)} (${tx.accidentals(Math.abs(right), right > 0)})`), tip };
}

/** An interval answered by its semitones, or null. */
export function intervalFeedback(q: Of<'ear'>, semitones: number | null): Feedback {
	const right = q.semitones;
	return semitones === right ? { correct: true, text: '' } : { correct: false, text: tx.intervalWas(tx.intervals[right], right) };
}

/** A chord answered by its quality, or null. */
export function chordFeedback(q: Of<'chord'>, quality: ChordQuality | null): Feedback {
	const right = q.quality;
	return quality === right ? { correct: true, text: '' } : { correct: false, text: tx.chordWas(tx.chordQualities[right], tx.chordHow[right]) };
}

/** One of the written melodies picked, or null. */
export function melodyFeedback(q: Of<'dict'>, index: number | null): Feedback {
	return index === q.answer ? { correct: true, text: '' } : { correct: false, text: tx.melodyWas(q.answer + 1) };
}

/** A note answered by its pitch class (any spelling counts), or null; a wrong one comes with how to transpose. */
export function pitchFeedback(q: Of<'trans'>, pitchClass: number | null, instrumentName: string): Feedback {
	const { answer: right, shift, part } = q;
	if (pitchClass === right) return { correct: true, text: '' };
	const how = shift ? tx.shift(tx.intervals[Math.abs(shift)], shift) : '';
	return { correct: false, text: tx.itIs(pitchName(right)), tip: !how ? undefined : part ? tx.partTip(how) : tx.concertTip(instrumentName, how) };
}

/** A note played into the microphone. */
export function heardFeedback(verdict: Verdict): Feedback {
	if (verdict.result === 'right') return { correct: true, text: Math.abs(verdict.cents) <= 10 ? tx.inTune : tx.cents(verdict.cents) };
	return { correct: false, text: verdict.octave ? tx.octave : tx.heard(midiName(verdict.midi)) };
}

/** A note tuned into the held chord: right once it's within TUNED of pure. */
export function tuneFeedback(q: Of<'tune'>, verdict: Verdict): Feedback {
	if (verdict.result !== 'right') return { ...heardFeedback(verdict), correct: false, measure: 99 };
	const off = Math.round(verdict.cents - q.tune.pure);
	const tuned = Math.abs(off) <= TUNED;
	return { correct: tuned, text: tuned ? tx.tunedPure(off) : tx.tunedOff(off), tip: tx.pureTips[q.tune.role], measure: Math.abs(off) };
}

const offOf = (mean: number) => (Number.isFinite(mean) ? Math.round(mean) : 999);

/**
 * A rhythm tapped. `heardFirst`: it was played before it was tapped (#371), so a right answer
 * counts as right but not fluent, and the item doesn't move up.
 */
export function rhythmFeedback(verdict: TapVerdict, tapped: number, heardFirst: boolean): Feedback {
	const missed = verdict.deviations.filter((deviation) => deviation === null).length;
	const leaning = Math.abs(verdict.tendency) >= LEANING ? (verdict.tendency > 0 ? tx.dragging : tx.rushing) : undefined;
	const off = offOf(verdict.meanOff);
	if (verdict.correct && heardFirst) return { correct: true, text: tx.rightHeard, tip: leaning, measure: Math.max(off, FLUENT_MS.rhythm + 1), heard: true };
	if (verdict.correct) return { correct: true, text: off <= FLUENT_MS.rhythm ? tx.inTime : tx.rhythmLoose(off), tip: leaning, measure: off };
	if (!tapped) return { correct: false, text: tx.noTaps, measure: off };
	return { correct: false, text: tx.rhythmWrong(missed, verdict.extra.length), tip: leaning, measure: off };
}

/** The pulse kept through the silent bars; a tip when it sped up or slowed down. */
export function pulseFeedback(verdict: PulseVerdict): Feedback {
	const missed = verdict.deviations.filter((deviation) => deviation === null).length;
	const off = offOf(verdict.meanOff);
	const drift = Math.abs(verdict.end) >= DRIFTED ? (verdict.end < 0 ? tx.pulseSped(Math.round(-verdict.end)) : tx.pulseSlowed(Math.round(verdict.end))) : undefined;
	if (verdict.correct) return { correct: true, text: off <= FLUENT_MS.pulse ? tx.pulseHeld : tx.pulseLoose(off), tip: drift, measure: off };
	if (!verdict.deviations.some((deviation) => deviation !== null)) return { correct: false, text: tx.noTaps, measure: off };
	return { correct: false, text: tx.pulseLost(missed, verdict.extra.length), tip: drift, measure: off };
}

/** A scale played: clean, or how many cents off, with a tip on sharp, flat or uneven playing. */
export function scaleFeedback(verdict: ScaleVerdict): Feedback {
	const off = offOf(verdict.meanCents);
	const tip =
		verdict.leaning > 0 ? tx.scaleSharp : verdict.leaning < 0 ? tx.scaleFlat : verdict.unevenness !== null && verdict.unevenness > UNEVEN ? tx.scaleUneven : undefined;
	if (verdict.correct) return { correct: true, text: off <= IN_TUNE ? tx.scaleClean : tx.scaleCents(off), tip, measure: off };
	if (verdict.marks.every((mark) => mark.state === 'missed')) return { correct: false, text: tx.noNotes, measure: off };
	return { correct: false, text: tx.scaleWrong(verdict.wrong, verdict.missed, verdict.extra), tip, measure: off };
}

/** "Don't know" for the questions answered by playing or tapping; the others answer null. */
export function skippedFeedback(q: Of<'play' | 'rhythm' | 'pulse' | 'scale' | 'tune'>): Feedback {
	if (q.kind === 'rhythm') return { correct: false, text: tx.rhythmShown, measure: 999 };
	if (q.kind === 'pulse') return { correct: false, text: tx.pulseSkipped, measure: 999 };
	if (q.kind === 'scale') return { correct: false, text: tx.scaleShown, measure: 999 };
	if (q.kind === 'tune') return { correct: false, text: tx.tuneShown, measure: 99 };
	// The written note, which on a transposing instrument isn't the one that sounds.
	return { correct: false, text: tx.itIs(midiName(midiOf(q.pitch))) };
}

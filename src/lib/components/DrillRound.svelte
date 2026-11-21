<script lang="ts">
	import Conductor from './Conductor.svelte';
	import { barLength, beatLength, countInBeats, markedTempo } from '#lib/practice/drills/meters.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { noteFrequency } from '#lib/practice/audio.ts';
	import { FLUENT_MS, kindOf, questionFor, type ChordQuality, type Question } from '#lib/practice/drills/decks.ts';
	import { profile, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { NoteJudge, type Verdict } from '#lib/practice/drills/judge.ts';
	import { isMastered, type States } from '#lib/practice/drills/scheduler.ts';
	import { beatMs, calibrate, CALIBRATION, firstSilent, judgePulse, judgeTaps, onsets, PULSE, pulseLoudness, tempoFor, toleranceFor, type PulseVerdict } from '#lib/practice/drills/rhythm.ts';
	import type { DrillSettings } from '#lib/practice/drills/progress.ts';
	import { droneMidi, isArpeggio, isMinor, scaleRows, scaleTempo } from '#lib/practice/drills/scales.ts';
	import { listenToPitch, playArpeggio, playBar, playChord, playTone, rememberedA4, startChord, startDrone, tapTime, triad, type MicProblem } from '#lib/practice/drills/sound.ts';
	import { TUNED } from '#lib/practice/drills/together.ts';
	import { midiOf, tonic, type Clef } from '#lib/practice/drills/theory.ts';
	import { BarClock } from '#lib/practice/round/bar-clock.svelte.ts';
	import {
		chordFeedback,
		heardFeedback,
		intervalFeedback,
		keyFeedback,
		keyLabel,
		melodyFeedback,
		midiName,
		noteFeedback,
		noteName,
		pitchFeedback,
		pulseFeedback,
		rhythmFeedback,
		scaleFeedback,
		skippedFeedback,
		tuneFeedback,
		type Feedback
	} from '#lib/practice/round/feedback.ts';
	import { autoNextMs, isHeard, replaysAfter } from '#lib/practice/round/pace.ts';
	import { roundKey } from '#lib/practice/round/round-keys.ts';
	import { scaleCaptions, scaleMarks, ScaleTake } from '#lib/practice/round/scale-take.svelte.ts';
	import { RoundTally } from '#lib/practice/round/tally.svelte.ts';
	import DrillStaff from './DrillStaff.svelte';
	import Icon from './Icon.svelte';
	import RhythmStaff from './RhythmStaff.svelte';
	import TempoMark from './staff/TempoMark.svelte';

	/**
	 * One round of a drill (#300, #315): twenty questions picked by the scheduler, each answered
	 * with a tap, a key or by playing it. Right answers move on by themselves, so a fluent player
	 * keeps a quick pace; wrong ones wait, so the feedback can be read. Key signatures and
	 * intervals are shown in any of `clefs`, so a new clef turns up between familiar ones.
	 *
	 * The rules live in `#lib/practice/round` (#357): which question comes next and the tally
	 * (tally), what an answer gets said (feedback), the bar playing (bar-clock), a scale's take
	 * (scale-take), the keys (round-keys) and the pace (pace). This file holds the sound, the
	 * microphone and the markup.
	 */
	let {
		order,
		clefs,
		instrument,
		states,
		sound: withSound,
		title,
		tapOffset,
		settings,
		test,
		progress,
		onanswer,
		oncalibrate,
		onsetting,
		onfinish,
		length,
		tryNote,
		ontry,
		onexit
	}: {
		order: string[];
		clefs: Clef[];
		instrument: ProfileId;
		states: States;
		sound: boolean;
		title: string;
		/** Milliseconds from a click to the member's tap on this device; undefined until measured. */
		tapOffset: number | undefined;
		/** `measure`: what counts for fluency when it isn't the time to answer (a rhythm's mean deviation). */
		onanswer: (id: string, correct: boolean, ms: number, measure?: number) => void;
		oncalibrate: (offset: number) => void;
		/** The scale options: drone, metronome, cents shown or kept back. */
		settings: DrillSettings;
		onsetting: (change: Partial<DrillSettings>) => void;
		/**
		 * The placement test (#300): its next question instead of the scheduler's (null when it's
		 * over), how far through it is, and what to do at the end instead of the round's summary.
		 */
		test?: () => string | null;
		progress?: number;
		onfinish?: () => void;
		/** Questions in the round, instead of the usual; the daily round's steps are shorter. */
		length?: number;
		/**
		 * A note just beyond the player's range (see reach.ts), tried once in the round, as its
		 * third question; whether it came goes to `ontry`, not into the round's score.
		 */
		tryNote?: { id: string; name: string } | null;
		ontry?: (reached: boolean) => void;
		onexit: () => void;
	} = $props();

	const tx = t.drills;
	const a4 = rememberedA4();
	const tally = new RoundTally(() => ({ order, states, length, test, tryNote }));
	const clock = new BarClock();
	const scale = new ScaleTake(a4);

	let question = $state<Question | null>(null);
	let isNew = $state(false);
	/** The question is the try at a new note. */
	let trying = $state(false);
	let shownAt = 0;
	let feedback = $state<{ correct: boolean; text: string; tip?: string; gentle?: boolean } | null>(null);
	let chosen = $state<number | null>(null);
	let chosenChord = $state<ChordQuality | null>(null);
	let chosenMelody = $state<number | null>(null);
	let autoNext: ReturnType<typeof setTimeout> | undefined;

	// "Play the note": the microphone stays on for the round once started.
	let stopMic: (() => void) | null = null;
	let listening = $state(false);
	let micProblem = $state<MicProblem | null>(null);
	let judge: NoteJudge | null = null;
	/** The note the microphone hears now, kept so the next question's judge knows it's left over. */
	let sounding: number | null = null;

	// Rhythm: the tempo and how close a tap must be.
	let bpm = $state(72);
	let tolerance = 150;
	/** After an answer: each note right or wrong, and where the taps fell (sixteenths). */
	let rhythmMarks = $state<('right' | 'wrong' | null)[]>([]);
	let tapMarks = $state<number[]>([]);
	/**
	 * The rhythm was played to the player before they tapped it (#371). It's played only when
	 * asked, as the aim is to read it at sight, and a right answer after it doesn't count in full.
	 */
	let heardFirst = false;
	let stopDrone: (() => void) | null = null;
	const drone = $derived(settings.drone ?? 'tonic');
	/** Who beats time (#368): J. S. Bach unless the member chose the figure alone or nobody. */
	const conductor = $derived(settings.conductor ?? 'bach');
	const showConductor = $derived(conductor !== 'off');

	// Tuning into a chord: the chord held, and the note's cents from pure as it's played.
	let stopChord: (() => void) | null = null;
	let liveCents = $state<number | null>(null);

	/** Keeping the pulse: how the silent beats went, for the chart. */
	let pulseResult = $state<PulseVerdict | null>(null);

	/** Measuring the device's delay, before the first rhythm or when asked. */
	let calibrating = $state(false);
	let calibrationFailed = $state(false);

	const frequencyOf = (midi: number) => noteFrequency(((midi % 12) + 12) % 12, Math.floor(midi / 12) - 1, a4);
	const instrumentName = $derived(tx.instruments[instrument]);
	/** "Stimme in D" for a part's key. */
	const partLabel = (q: Extract<Question, { kind: 'trans' }>) => (q.part ? tx.partIn(noteName(q.part.step, q.part.alter)) : null);

	/**
	 * What a question sounds like: the note as it sounds on the instrument; for a key its tonic
	 * triad as an arpeggio (C major: C E G C); for an interval its two notes, one after the other
	 * or together. How long each rings is `soundMs` in pace.ts.
	 */
	function sound(q: Question) {
		if (q.kind === 'keys') playArpeggio(triad(midiOf({ ...tonic(q.fifths, q.mode), octave: 4 }) % 12, q.mode).map(frequencyOf));
		else if (q.kind === 'ear') {
			const notes = [midiOf(q.low), midiOf(q.low) + q.semitones].map(frequencyOf);
			if (q.harmonic) playChord(notes);
			else playArpeggio(notes, 0.7);
		} else if (q.kind === 'chord') {
			// Broken first, then together: the third is easier to hear on its own.
			const notes = q.pitches.map((pitch) => frequencyOf(midiOf(pitch)));
			playArpeggio(notes, 0.45);
			setTimeout(() => playChord(notes), 1600);
		} else if (q.kind === 'dict') playArpeggio(q.options[q.answer].map((pitch) => frequencyOf(midiOf(pitch))), 0.6);
		else if (q.kind === 'rhythm') hearRhythm(q);
		else if (q.kind === 'pulse') playBar({ bpm: q.bpm, countIn: 4, beats: 0 });
		else if (q.kind === 'tune') playChord([...q.tune.held.map((ratio) => frequencyOf(q.tune.rootMidi) * ratio), frequencyOf(q.tune.rootMidi) * 2 ** ((q.tune.targetMidi - q.tune.rootMidi + q.tune.pure / 100) / 12)]);
		else if (q.kind === 'scale') playArpeggio(q.item.midis.map(frequencyOf), isArpeggio(q.item.type) ? 0.4 : 0.32);
		else if (q.kind === 'trans') playTone(frequencyOf(midiOf(q.pitch) + (q.part ? q.part.semitones : profile(q.instrument).transposition)));
		else playTone(frequencyOf(q.kind === 'play' ? q.midi : midiOf(q.pitch)));
	}

	function next() {
		clearTimeout(autoNext);
		clock.stop();
		feedback = null;
		chosen = null;
		chosenChord = null;
		chosenMelody = null;
		rhythmMarks = [];
		tapMarks = [];
		heardFirst = false;
		pulseResult = null;
		calibrating = false;
		calibrationFailed = false;
		stopTake();
		scale.clear();
		holdChord(null);
		liveCents = null;
		const pick = tally.pick();
		const asked = pick && questionFor(pick.id, clefs[Math.floor(Math.random() * clefs.length)]);
		trying = !!pick?.trying;
		if (!pick || !asked) {
			finish();
			return;
		}
		tally.shown(pick);
		question = asked;
		isNew = pick.isNew;
		shownAt = performance.now();
		judge =
			asked.kind === 'play'
				? new NoteJudge(asked.midi, { a4, carried: sounding })
				: asked.kind === 'tune'
					? // Held a while, as tuning takes a moment of listening; a wrong note needs holding too.
						new NoteJudge(asked.tune.targetMidi, { a4, holdMs: 1600, wrongMs: 1000, carried: sounding })
					: null;
		// With the microphone already on, the next chord sounds straight away.
		if (asked.kind === 'tune' && listening) holdChord(asked);
		// Sound before symbol: an interval is heard first, and its notes shown only after the answer.
		if (isHeard(asked)) sound(asked);
		if (asked.kind === 'pulse') {
			bpm = asked.bpm;
			calibrating = tapOffset === undefined;
		}
		if (asked.kind === 'rhythm') {
			const box = states[asked.id]?.box;
			bpm = tempoFor(box, asked.meter);
			tolerance = toleranceFor(box, beatMs(bpm));
			calibrating = tapOffset === undefined;
		}
	}

	function finish() {
		if (onfinish) {
			onfinish();
			return;
		}
		tally.finish();
		question = null;
		stopListening();
		clock.stop();
		stopTake();
		holdChord(null);
	}

	/** The chord for a tuning question, held in just intonation from its root; null to let it go. */
	function holdChord(q: Extract<Question, { kind: 'tune' }> | null) {
		stopChord?.();
		stopChord = q ? startChord(q.tune.held.map((ratio) => frequencyOf(q.tune.rootMidi) * ratio)) : null;
	}

	/** The chord's notes, which the microphone may hear through the speaker: not the player's. */
	const chordHeard = (q: Extract<Question, { kind: 'tune' }>, midi: number) =>
		q.tune.held.some((ratio) => (((midi - q.tune.rootMidi - Math.round(12 * Math.log2(ratio))) % 12) + 12) % 12 === 0);

	function answer({ correct, text, tip, measure, heard }: Feedback) {
		if (!question || feedback) return;
		if (trying && tryNote) {
			ontry?.(correct);
			// Not yet: a kind word, the note to hear, and no mark against the round.
			if (!correct) {
				judge = null;
				feedback = { correct: false, text: tx.reach.notYet(tryNote.name), tip: tx.reach.notYetTip, gentle: true };
				if (withSound) sound(question);
				return;
			}
			text = tx.reach.reached(tryNote.name);
		}
		const ms = performance.now() - shownAt;
		const fluent = (measure ?? ms) <= FLUENT_MS[kindOf(question.id)];
		tally.record(correct, isNew, measure === undefined ? ms : undefined, heard);
		onanswer(question.id, correct, ms, measure);
		judge = null;
		feedback = { correct, text: correct ? text || (fluent ? tx.right : tx.rightSlow) : text, tip };
		const replayed = replaysAfter(question, correct, withSound, settings.replay !== false);
		if (replayed) sound(question);
		const wait = autoNextMs(question, correct, { trying, isNew, replayed });
		if (wait !== null) autoNext = setTimeout(next, wait);
	}

	/** The rhythm as it should sound, after a bar's count-in; before the answer only when asked. */
	async function hearRhythm(q: Extract<Question, { kind: 'rhythm' }>) {
		clock.begin('example');
		if (!feedback) heardFirst = true;
		const length = beatMs(bpm);
		const countIn = countInBeats(q.meter);
		const played = await playBar({ bpm, countIn, beats: q.meter, meter: q.meter, notes: onsets(q.events, length, q.meter) });
		if (!played || clock.phase !== 'example') {
			played?.stop();
			if (!played) clock.phase = 'idle';
			return;
		}
		clock.follow(played, length, countIn, q.meter, () => {
			clock.beat = null;
			clock.phase = 'idle';
		});
	}

	/** Count in a bar, then take the taps for one bar and judge them. */
	async function tapRhythm() {
		if (question?.kind !== 'rhythm' || feedback) return;
		const q = question;
		clock.begin('count');
		const length = beatMs(bpm);
		const countIn = countInBeats(q.meter);
		const played = await playBar({ bpm, countIn, beats: q.meter, meter: q.meter });
		if (!played) {
			clock.phase = 'idle';
			return;
		}
		if (clock.phase !== 'count') return played.stop();
		clock.hold(played);
		clock.at(played, -length / 2, () => {
			if (clock.phase === 'count') clock.phase = 'tap';
		});
		// Judged once the last note's window has passed.
		clock.follow(played, length, countIn, q.meter, () => judgeRhythm(q, played.start), Math.min(tolerance, length / 2) + 40);
	}

	function judgeRhythm(q: Extract<Question, { kind: 'rhythm' }>, start: number) {
		const length = beatMs(bpm);
		// Taps along with the count-in don't count against the bar.
		const relative = clock.taps.map((time) => time - start - (tapOffset ?? 0)).filter((time) => time > -length / 2);
		const verdict = judgeTaps(onsets(q.events, length, q.meter), relative, tolerance);
		clock.stop();
		rhythmMarks = verdict.deviations.map((deviation) => (deviation === null ? 'wrong' : 'right'));
		tapMarks = relative.map((time) => (time / length) * beatLength(q.meter)).filter((at) => at >= -1 && at <= barLength(q.meter) + 0.5);
		answer(rhythmFeedback(verdict, relative.length, heardFirst));
	}

	/**
	 * Keeping the pulse: a count-in, two bars with the metronome, a bar in which it fades, then
	 * bars alone; one click comes back at the end. The beats light up only while they're heard.
	 */
	async function tapPulse() {
		if (question?.kind !== 'pulse' || feedback) return;
		const q = question;
		clock.begin('count');
		const length = beatMs(q.bpm);
		const beats = firstSilent() + q.silent * 4 + 1;
		const played = await playBar({ bpm: q.bpm, countIn: 4, beats, loudness: (i) => pulseLoudness(i, q.silent) });
		if (!played) {
			clock.phase = 'idle';
			return;
		}
		if (clock.phase !== 'count') return played.stop();
		clock.hold(played);
		clock.conductFrom(played, 4, length);
		for (let i = -4; i < beats; i++) {
			const heard = pulseLoudness(i + 4, q.silent) >= 0.25;
			clock.at(played, i * length, () => (clock.beat = heard ? i : null));
		}
		clock.at(played, -length / 2, () => clock.phase === 'count' && (clock.phase = 'tap'));
		clock.at(played, (PULSE.heard * 4 + 2) * length, () => clock.phase === 'tap' && (clock.phase = 'alone'));
		// Judged half a beat after the click that comes back.
		clock.at(played, (beats - 1) * length + length / 2, () => {
			const verdict = judgePulse(q.bpm, q.silent, clock.taps.map((time) => time - played.start - (tapOffset ?? 0)));
			clock.stop();
			pulseResult = verdict;
			answer(pulseFeedback(verdict));
		});
	}

	/** The scale's name: "G-Dur-Tonleiter", "a-Moll harmonisch", "D-Dur-Dreiklang". */
	const scaleName = (q: Extract<Question, { kind: 'scale' }>) => tx.scaleName(keyLabel(q.item.fifths, isMinor(q.item.type) ? 'minor' : 'major'), q.item.type, q.item.octaves);
	const scaleTempoNow = $derived(question?.kind === 'scale' ? scaleTempo(states[question.id]?.box) : 60);

	/** Notes probably the drone through the speaker, not the player: its pitch class. */
	const droneHeard = (q: Extract<Question, { kind: 'scale' }>) => {
		const pitchClass = droneMidi(q.item.midis[0]) % 12;
		return (midi: number) => drone !== 'off' && ((midi % 12) + 12) % 12 === pitchClass;
	};

	/** Microphone on, the drone and (if wanted) a count-in with the metronome, then play. */
	async function startTake() {
		if (question?.kind !== 'scale' || feedback || scale.take !== 'idle') return;
		const q = question;
		scale.clear();
		micProblem = null;
		try {
			stopMic = await listenToPitch((frequency, time) => {
				if (scale.reading(frequency, time)) finishTake();
			});
		} catch (problem) {
			micProblem = problem as MicProblem;
			return;
		}
		listening = true;
		if (drone !== 'off') stopDrone = startDrone(frequencyOf(droneMidi(q.item.midis[0])), drone === 'fifth');
		scale.begin(q.item.midis, droneHeard(q), performance.now());
		if (!settings.click) return;
		bpm = scaleTempoNow;
		scale.countIn();
		const played = await playBar({ bpm, countIn: 4, beats: q.item.midis.length + 1 });
		if (!played || !scale.counting) {
			played?.stop();
			if (!played) scale.take = 'playing';
			scale.listenFrom(performance.now());
			return;
		}
		// What's played before the count-in ends is the player getting ready.
		scale.listenFrom(played.start - beatMs(bpm) / 2, played.start);
		clock.follow(played, beatMs(bpm), 4, 0, () => {
			if (scale.counting) scale.take = 'playing';
			clock.beat = null;
		});
	}

	function stopTake() {
		stopDrone?.();
		stopDrone = null;
		if (scale.take !== 'idle') stopListening();
		scale.stop();
	}

	function finishTake() {
		if (scale.take === 'idle') return;
		stopTake();
		clock.stop();
		answer(scaleFeedback(scale.verdict()));
	}

	/** Each note's colour on the staff, and the captions under them after the take. */
	const shownScaleMarks = $derived(scaleMarks(scale.marks, !!feedback, !!feedback || !settings.hideCents));
	const shownScaleCaptions = $derived(feedback ? scaleCaptions(scale.marks) : []);

	/** Eight taps along with clicks, to learn this device's delay. */
	async function startCalibration() {
		calibrationFailed = false;
		clock.begin('calibrate');
		const saved = bpm;
		bpm = CALIBRATION.bpm;
		const played = await playBar({ bpm, countIn: 4, beats: CALIBRATION.beats });
		if (!played) {
			bpm = saved;
			clock.phase = 'idle';
			return;
		}
		const length = beatMs(bpm);
		clock.follow(
			played,
			length,
			4,
			CALIBRATION.beats,
			() => {
				const clicks = Array.from({ length: CALIBRATION.beats }, (_, i) => i * length);
				const offset = calibrate(clicks, clock.taps.map((time) => time - played.start));
				clock.stop();
				bpm = saved;
				if (offset === null) {
					calibrationFailed = true;
					return;
				}
				oncalibrate(offset);
				calibrating = false;
				shownAt = performance.now();
			},
			length / 2
		);
	}

	/** A letter answered, or null for "don't know". */
	function answerNote(step: number | null) {
		if (question?.kind !== 'notes' || feedback) return;
		chosen = step;
		answer(noteFeedback(question, step));
	}

	/** A key answered, or null for "don't know". */
	function answerKey(fifths: number | null) {
		if (question?.kind !== 'keys' || feedback) return;
		chosen = fifths;
		answer(keyFeedback(question, fifths));
	}

	/** An interval answered (its semitones), or null for "don't know". */
	function answerInterval(semitones: number | null) {
		if (question?.kind !== 'ear' || feedback) return;
		chosen = semitones;
		answer(intervalFeedback(question, semitones));
	}

	/** A chord answered by its quality, or null for "don't know". */
	function answerChord(quality: ChordQuality | null) {
		if (question?.kind !== 'chord' || feedback) return;
		chosenChord = quality;
		answer(chordFeedback(question, quality));
	}

	/** A melody picked among the three written ones, or null for "don't know". */
	function answerMelody(index: number | null) {
		if (question?.kind !== 'dict' || feedback) return;
		chosenMelody = index;
		answer(melodyFeedback(question, index));
	}

	/** A note answered by its pitch class, or null for "don't know". */
	function answerPitch(pitchClass: number | null) {
		if (question?.kind !== 'trans' || feedback) return;
		chosen = pitchClass;
		answer(pitchFeedback(question, pitchClass, instrumentName));
	}

	function heard(q: Question | null, verdict: Verdict) {
		if (q?.kind === 'tune') holdChord(null);
		answer(q?.kind === 'tune' ? tuneFeedback(q, verdict) : heardFeedback(verdict));
	}

	async function startListening() {
		micProblem = null;
		try {
			stopMic = await listenToPitch((frequency, time) => {
				const q = question;
				if (q?.kind === 'tune' && frequency) {
					const semitones = 69 + 12 * Math.log2(frequency / a4);
					const midi = Math.round(semitones);
					// The held chord through the speaker isn't the player.
					if (chordHeard(q, midi) && midi !== q.tune.targetMidi) return;
					if (midi === q.tune.targetMidi && !feedback) liveCents = Math.round((semitones - midi) * 100 - q.tune.pure);
				}
				sounding = frequency ? Math.round(69 + 12 * Math.log2(frequency / a4)) : null;
				const verdict = judge?.push(frequency, time);
				if (verdict) heard(q, verdict);
			});
			if (question?.kind === 'tune') holdChord(question);
			listening = true;
			shownAt = performance.now();
		} catch (problem) {
			micProblem = problem as MicProblem;
		}
	}

	function stopListening() {
		stopMic?.();
		stopMic = null;
		listening = false;
	}

	function skip() {
		if (!question || feedback) return;
		if (question.kind === 'notes') answerNote(null);
		else if (question.kind === 'keys') answerKey(null);
		else if (question.kind === 'ear') answerInterval(null);
		else if (question.kind === 'chord') answerChord(null);
		else if (question.kind === 'dict') answerMelody(null);
		else if (question.kind === 'trans') answerPitch(null);
		else {
			if (question.kind === 'scale') stopTake();
			if (question.kind === 'tune') holdChord(null);
			clock.stop();
			answer(skippedFeedback(question));
		}
	}

	function onkeydown(event: KeyboardEvent) {
		const key = roundKey(event, { question, answered: !!feedback, finished: tally.finished, idle: clock.phase === 'idle', calibrating, letterKeys: tx.letterKeys });
		if (!key) return;
		if (key.do === 'hold' || key.do === 'tap' || key.do === 'start' || key.do === 'next') event.preventDefault();
		if (key.do === 'tap') clock.tap(tapTime(event.timeStamp, performance.now()));
		else if (key.do === 'start') {
			if (question?.kind === 'pulse') tapPulse();
			else tapRhythm();
		} else if (key.do === 'next') next();
		else if (key.do === 'letter') answerNote(key.step);
		else if (key.do === 'option') {
			if (question?.kind === 'dict') answerMelody(key.index);
			else if (question?.kind === 'keys') answerKey(question.options[key.index]);
			else if (question?.kind === 'chord') answerChord(question.options[key.index]);
			else if (question?.kind === 'ear') answerInterval(question.options[key.index]);
		}
	}

	const masteredNow = $derived(order.filter((id) => isMastered(states[id], FLUENT_MS[kindOf(id)])).length);
	const transposition = $derived(profile(instrument).transposition);

	next();
	$effect(() => () => {
		clearTimeout(autoNext);
		stopListening();
		clock.stop();
	});
</script>

<svelte:window {onkeydown} />

<section class="round ui-card" aria-labelledby="round-title">
	<header class="top">
		<h2 id="round-title">{title}</h2>
		{#if !tally.finished && !test}<span class="count" aria-label="{tally.count} / {tally.length}">{tx.question(tally.count, tally.length)}</span>{/if}
		<button type="button" class="btn ghost small" onclick={onexit}>{tally.finished ? tx.back : tx.stop}</button>
	</header>
	{#if !tally.finished}
		<div class="bar" aria-hidden="true"><span style:width="{(test ? (progress ?? 0) : tally.count / tally.length) * 100}%"></span></div>
	{/if}

	{#if question}
		<div class="prompt">
			<p class="ask">
				{#if trying}<span class="new">{tx.reach.tag}</span>
				{:else if isNew && !calibrating}<span class="new">{tx.new}</span>{/if}
				{#if question.kind === 'notes'}{tx.whichNote}
				{:else if question.kind === 'keys'}{tx.whichKey(question.mode)}
				{:else if question.kind === 'ear'}{tx.whichInterval(question.harmonic)}
				{:else if question.kind === 'chord'}{tx.whichChord}
				{:else if question.kind === 'dict'}{tx.whichMelody}
				{:else if question.kind === 'trans'}{tx.transQuestion(partLabel(question))}
				{:else if question.kind === 'rhythm'}{calibrating ? tx.calibrateTitle : tx.tapThis}
				{:else if question.kind === 'pulse'}{calibrating ? tx.calibrateTitle : tx.pulseAsk(question.silent)}
				{:else if question.kind === 'scale'}{scaleName(question)}
				{:else if question.kind === 'tune'}{tx.tuneAsk(tx.tuneRoles[question.tune.role])}
				{:else}{trying ? tx.reach.ask : tx.playThis}{/if}
			</p>
			{#if question.kind === 'tune'}
				{@const held = question.tune.heldPitches}
				<DrillStaff
					clef={question.clef}
					notes={[...held, question.tune.target]}
					together
					marks={[...held.map(() => null), feedback ? (feedback.correct ? 'right' : 'wrong') : 'now']}
					label={tx.tuneAsk(tx.tuneRoles[question.tune.role])}
				/>
			{:else if question.kind === 'scale'}
				<!-- Over more octaves a staff per two octaves' run, each in the clef it reads best in. -->
				{@const rows = scaleRows(question.item)}
				{#each rows as row, i (i)}
					<DrillStaff
						clef={row.clef}
						fifths={question.item.fifths}
						notes={question.item.pitches.slice(row.from, row.to)}
						marks={shownScaleMarks.slice(row.from, row.to)}
						captions={shownScaleCaptions.slice(row.from, row.to)}
						spacing={28}
						label={rows.length > 1 ? `${scaleName(question)} (${i + 1}/${rows.length})` : scaleName(question)}
					/>
				{/each}
				<p class="hint">{tx.upAndDown(question.item.octaves)}</p>
			{:else if question.kind === 'pulse'}
				{#if calibrating}
					<p class="hint calibrate">{tx.calibrateLead}</p>
				{:else}
					<p class="tempo-big"><TempoMark bpm={question.bpm} /></p>
					<p class="hint calibrate">{tx.pulseLead(PULSE.heard, question.silent)}</p>
					{#if pulseResult}
						{@const n = pulseResult.deviations.length}
						{@const window = Math.min(180, beatMs(question.bpm) * 0.3)}
						{@const xAt = (i: number) => 14 + (i * 272) / Math.max(1, n - 1)}
						{@const yAt = (ms: number) => 45 + Math.max(-38, Math.min(38, (ms / window) * 30))}
						{@const startAt = pulseResult.end - (pulseResult.drift / 4) * (n - 1)}
						<svg class="drift" viewBox="0 0 300 92" role="img" aria-label={feedback?.text ?? ''}>
							<rect x="6" y="15" width="288" height="60" rx="4" class="band" />
							<line x1="6" x2="294" y1="45" y2="45" class="axis" />
							<text x="296" y="12" text-anchor="end" class="label">{tx.timing.early}</text>
							<text x="296" y="88" text-anchor="end" class="label">{tx.timing.late}</text>
							<line x1={xAt(0)} x2={xAt(n - 1)} y1={yAt(startAt)} y2={yAt(pulseResult.end)} class="trend" />
							{#each pulseResult.deviations as deviation, i (i)}
								{#if deviation === null}
									<path d="M{xAt(i) - 4} 41 l8 8 m0 -8 l-8 8" class="missed" />
								{:else}
									<circle cx={xAt(i)} cy={yAt(deviation)} r="4" class="point" class:far={Math.abs(deviation) > window * 0.6} />
								{/if}
							{/each}
						</svg>
					{/if}
				{/if}
			{:else if question.kind === 'rhythm'}
				{#if calibrating}
					<p class="hint calibrate">{tx.calibrateLead}</p>
				{:else}
					<RhythmStaff pattern={question.pattern} meter={question.meter} marks={rhythmMarks} taps={tapMarks} label={tx.tapThis} />
					<p class="hint"><TempoMark bpm={markedTempo(bpm, question.meter)} unit={question.meter === 6 ? 'dotted' : 'quarter'} /></p>
				{/if}
			{:else if question.kind === 'keys'}
				<DrillStaff clef={question.clef} fifths={question.fifths} label={tx.whichKey(question.mode)} />
			{:else if question.kind === 'ear'}
				{#if feedback}
					<DrillStaff clef={question.clef} notes={[question.low, question.high]} together={question.harmonic} label={tx.intervals[question.semitones]} />
				{:else}
					{@const q = question}
					<button type="button" class="listen" onclick={() => sound(q)}><Icon name="headphones" size={36} /><span>{tx.listen}</span></button>
				{/if}
			{:else if question.kind === 'dict'}
				{@const q = question}
				<button type="button" class="listen" onclick={() => sound(q)}><Icon name="headphones" size={36} /><span>{tx.listen}</span></button>
			{:else if question.kind === 'chord'}
				{#if feedback}
					<DrillStaff clef={question.clef} notes={question.pitches} together label={tx.chordQualities[question.quality]} />
				{:else}
					{@const q = question}
					<button type="button" class="listen" onclick={() => sound(q)}><Icon name="headphones" size={36} /><span>{tx.listen}</span></button>
				{/if}
			{:else}
				{#if question.kind === 'trans'}<p class="part">{partLabel(question) ?? instrumentName}</p>{/if}
				<DrillStaff
					clef={question.clef}
					notes={[question.pitch]}
					state={feedback && !feedback.gentle ? (feedback.correct ? 'right' : 'wrong') : null}
					label={feedback ? noteName(question.pitch.step, question.pitch.alter) : tx.whichNote}
				/>
			{/if}
		</div>

		{#if question.kind === 'notes'}
			<div class="letters" role="group" aria-label={tx.whichNote}>
				{#each tx.letters as letter, step (letter)}
					{@const q = question}
					<button
						type="button"
						class="answer"
						class:right={!!feedback && q.pitch.step === step}
						class:wrong={!!feedback && chosen === step && q.pitch.step !== step}
						disabled={!!feedback}
						onclick={() => answerNote(step)}>{letter}</button
					>
				{/each}
			</div>
		{:else if question.kind === 'keys'}
			<div class="options" role="group" aria-label={tx.whichKey(question.mode)}>
				{#each question.options as fifths, i (fifths)}
					{@const q = question}
					<button
						type="button"
						class="answer wide"
						class:right={!!feedback && q.fifths === fifths}
						class:wrong={!!feedback && chosen === fifths && q.fifths !== fifths}
						disabled={!!feedback}
						onclick={() => answerKey(fifths)}><kbd>{i + 1}</kbd>{keyLabel(fifths, q.mode)}</button
					>
				{/each}
			</div>
		{:else if question.kind === 'ear'}
			<div class="options" role="group" aria-label={tx.whichInterval(question.harmonic)}>
				{#each question.options as semitones, i (semitones)}
					{@const q = question}
					<button
						type="button"
						class="answer wide"
						class:right={!!feedback && q.semitones === semitones}
						class:wrong={!!feedback && chosen === semitones && q.semitones !== semitones}
						disabled={!!feedback}
						onclick={() => answerInterval(semitones)}><kbd>{i + 1}</kbd>{tx.intervals[semitones]}</button
					>
				{/each}
			</div>
		{:else if question.kind === 'dict'}
			<div class="melodies" role="group" aria-label={tx.whichMelody}>
				{#each question.options as melody, i (i)}
					{@const q = question}
					<button
						type="button"
						class="answer melody"
						class:right={!!feedback && q.answer === i}
						class:wrong={!!feedback && chosenMelody === i && q.answer !== i}
						disabled={!!feedback}
						onclick={() => answerMelody(i)}
					>
						<kbd>{i + 1}</kbd>
						<DrillStaff clef={q.clef} fifths={q.fifths} notes={melody} spacing={34} label={tx.melodyLabel(i + 1)} />
					</button>
				{/each}
			</div>
		{:else if question.kind === 'chord'}
			<div class="options" role="group" aria-label={tx.whichChord}>
				{#each question.options as quality, i (quality)}
					{@const q = question}
					<button
						type="button"
						class="answer wide"
						class:right={!!feedback && q.quality === quality}
						class:wrong={!!feedback && chosenChord === quality && q.quality !== quality}
						disabled={!!feedback}
						onclick={() => answerChord(quality)}><kbd>{i + 1}</kbd>{tx.chordQualities[quality]}</button
					>
				{/each}
			</div>
		{:else if question.kind === 'trans'}
			<div class="chromatic" role="group" aria-label={tx.transQuestion(partLabel(question))}>
				{#each t.practice.tuner.notes as name, pitchClass (pitchClass)}
					{@const q = question}
					<button
						type="button"
						class="answer"
						class:right={!!feedback && q.answer === pitchClass}
						class:wrong={!!feedback && chosen === pitchClass && q.answer !== pitchClass}
						disabled={!!feedback}
						onclick={() => answerPitch(pitchClass)}>{name}</button
					>
				{/each}
			</div>
		{:else if question.kind === 'tune'}
			<div class="play">
				{#if transposition}<p class="hint">{tx.sounding(midiName(midiOf(question.tune.target)), midiName(question.tune.targetMidi))}</p>{/if}
				{#if !listening}
					<button type="button" class="btn" onclick={startListening}><span class="mic" aria-hidden="true"></span>{tx.tuneStart}</button>
					<p class="hint">{tx.tuneHeadphones}</p>
				{:else if !feedback}
					<p class="listening" role="status"><span class="mic live" aria-hidden="true"></span>{tx.listening}</p>
				{/if}
				{#if listening || feedback}
					{@const pianoAt = -question.tune.pure}
					{@const shown = Math.max(-30, Math.min(30, liveCents ?? 0))}
					<svg class="tuning" viewBox="0 0 260 46" role="img" aria-label={liveCents === null ? tx.listening : tx.tunedOff(liveCents)}>
						<line x1="10" x2="250" y1="22" y2="22" class="scale" />
						{#each [-30, -20, -10, 10, 20, 30] as tick (tick)}<line x1={130 + tick * 4} x2={130 + tick * 4} y1="18" y2="26" class="scale" />{/each}
						<rect x={130 - TUNED * 4} y="16" width={TUNED * 8} height="12" rx="3" class="zone" />
						<line x1="130" x2="130" y1="10" y2="34" class="pure" />
						<text x="130" y="44" text-anchor="middle" class="label">{tx.tunePure}</text>
						{#if Math.abs(pianoAt) >= 1}
							<line x1={130 + pianoAt * 4} x2={130 + pianoAt * 4} y1="12" y2="32" class="piano" />
							<text x={130 + pianoAt * 4} y="9" text-anchor="middle" class="label">{tx.tunePiano}</text>
						{/if}
						{#if liveCents !== null}<circle cx={130 + shown * 4} cy="22" r="6" class="needle" class:in={Math.abs(liveCents) <= TUNED} />{/if}
					</svg>
				{/if}
				{#if micProblem}<p class="msg error">{micProblem === 'insecure' ? t.practice.tuner.insecure : t.practice.tuner.noMic}</p>{/if}
			</div>
		{:else if question.kind === 'scale'}
			<div class="play">
				{#if scale.take === 'idle' && !feedback}
					<div class="options-row">
						<label class="field small">
							{tx.drone}
							<select value={drone} onchange={(event) => onsetting({ drone: event.currentTarget.value as DrillSettings['drone'] })}>
								<option value="off">{tx.droneOff}</option>
								<option value="tonic">{tx.droneTonic}</option>
								<option value="fifth">{tx.droneFifth}</option>
							</select>
						</label>
						<label class="check">
							<input type="checkbox" checked={!!settings.click} onchange={(event) => onsetting({ click: event.currentTarget.checked })} />
							{tx.click(scaleTempoNow)}
						</label>
						<label class="check">
							<input type="checkbox" checked={!!settings.hideCents} onchange={(event) => onsetting({ hideCents: event.currentTarget.checked })} />
							{tx.hideCents}
						</label>
					</div>
					{#if transposition}<p class="hint">{tx.soundingScale(midiName(question.item.midis[0]))}</p>{/if}
					<button type="button" class="btn" onclick={startTake}><span class="mic" aria-hidden="true"></span>{tx.micStart}</button>
					{#if drone !== 'off' || settings.click}<p class="hint">{tx.headphones}</p>{/if}
				{:else if scale.take !== 'idle'}
					{#if scale.take === 'count'}
						{#if showConductor}<Conductor meter={4} start={clock.beat !== null && clock.conduct ? clock.conduct.start : null} beatMs={clock.conduct?.ms ?? 600} counting bach={conductor === 'bach'} />{/if}
						<p class="listening" role="status">{tx.countIn} {clock.beat !== null && clock.beat < 0 ? clock.beat + 5 : ''}</p>
					{:else}
						<p class="listening" role="status">
							<span class="mic live" aria-hidden="true"></span>{tx.playingScale}
							{#if scale.heardNow}
								<span class="heard">{midiName(scale.heardNow.midi)}{#if !settings.hideCents}{' '}{scale.heardNow.cents > 0 ? '+' : ''}{scale.heardNow.cents} ct{/if}</span>
							{/if}
						</p>
					{/if}
					<button type="button" class="btn ghost small" onclick={finishTake}>{tx.doneTake}</button>
				{/if}
				{#if micProblem}<p class="msg error">{micProblem === 'insecure' ? t.practice.tuner.insecure : t.practice.tuner.noMic}</p>{/if}
			</div>
		{:else if question.kind === 'rhythm' || question.kind === 'pulse'}
			{@const pulse = question.kind === 'pulse'}
			{@const meter = question.kind === 'rhythm' && clock.phase !== 'calibrate' ? question.meter : 4}
			<!-- Counted within the bar, as the count-in is one bar of the meter: 1 2 1 2 for 2/4 too. -->
			{@const counted = clock.beat !== null && clock.beat < 0 ? ((clock.beat + 4 * meter) % meter) + 1 : ''}
			<div class="tapping">
				<!-- The bar's beat as a conductor gives it; it rests while the metronome is quiet. -->
				{#if showConductor}
					<Conductor {meter} start={clock.beat !== null && clock.conduct ? clock.conduct.start : null} beatMs={clock.conduct?.ms ?? 600} counting={clock.beat !== null && clock.beat < 0} bach={conductor === 'bach'} />
				{/if}
				<p class="status" role="status">
					{#if clock.phase === 'example'}{tx.example}
					{:else if clock.phase === 'count'}{tx.countIn} {counted}
					{:else if clock.phase === 'tap'}{pulse ? tx.tapAlong : tx.tapNow}
					{:else if clock.phase === 'alone'}{tx.keepPulse}
					{:else if clock.phase === 'calibrate'}{clock.beat !== null && clock.beat < 0 ? `${tx.countIn} ${counted}` : tx.calibrateNow}
					{:else if calibrationFailed}{tx.calibrateFailed}{/if}
				</p>
				{#if clock.tapping}
					<button
						type="button"
						class="pad"
						class:hit={clock.tapped % 2 === 1}
						onpointerdown={(event) => {
							event.preventDefault();
							clock.tap(tapTime(event.timeStamp, performance.now()));
						}}>{tx.tapPad}</button
					>
				{:else if !feedback}
					{@const q = question}
					<div class="row">
						{#if calibrating}
							<button type="button" class="btn" onclick={startCalibration}>{tx.calibrateStart}</button>
						{:else if q.kind === 'pulse'}
							<button type="button" class="btn" onclick={tapPulse}>{tx.tapStart}</button>
						{:else}
							<button type="button" class="btn ghost" disabled={clock.phase === 'example'} onclick={() => hearRhythm(q)}>{tx.listen}</button>
							<button type="button" class="btn" onclick={tapRhythm}>{tx.tapStart}</button>
						{/if}
					</div>
					{#if q.kind === 'rhythm' && !calibrating}<p class="hint">{tx.listenCosts}</p>{/if}
				{/if}
				{#if !feedback && (clock.phase === 'idle' || clock.phase === 'example') && !calibrating}
					<label class="field small">
						{tx.conductor}
						<select value={conductor} onchange={(event) => onsetting({ conductor: event.currentTarget.value as DrillSettings['conductor'] })}>
							<option value="bach">{tx.conductorBach}</option>
							<option value="pattern">{tx.conductorPattern}</option>
							<option value="off">{tx.conductorOff}</option>
						</select>
					</label>
				{/if}
			</div>
		{:else}
			<div class="play">
				{#if transposition}<p class="hint">{tx.sounding(midiName(midiOf(question.pitch)), midiName(question.midi))}</p>{/if}
				{#if !listening}
					<button type="button" class="btn" onclick={startListening}><span class="mic" aria-hidden="true"></span>{tx.micStart}</button>
				{:else if !feedback}
					<p class="listening" role="status"><span class="mic live" aria-hidden="true"></span>{tx.listening}</p>
				{/if}
				{#if micProblem}<p class="msg error">{micProblem === 'insecure' ? t.practice.tuner.insecure : t.practice.tuner.noMic}</p>{/if}
			</div>
		{/if}

		<div class="after" aria-live="polite">
			{#if feedback}
				<p class="feedback" class:ok={feedback.correct} class:gentle={feedback.gentle}>{feedback.text}</p>
				{#if feedback.tip}<p class="hint">{feedback.tip}</p>{/if}
				<div class="row">
					<button type="button" class="btn ghost small" onclick={() => question && sound(question)}
						>{question.kind === 'keys' || question.kind === 'tune' ? tx.replayChord : question.kind === 'ear' || question.kind === 'chord' || question.kind === 'dict' || question.kind === 'rhythm' || question.kind === 'pulse' || question.kind === 'scale' ? tx.listen : tx.replay}</button
					>
					<button type="button" class="btn" onclick={next}>{tx.next}</button>
				</div>
			{:else if !calibrating && scale.take === 'idle'}
				<div class="row">
					<button type="button" class="btn ghost small" onclick={skip}>{trying ? tx.reach.notNow : tx.skip}</button>
					{#if withSound && isHeard(question)}
						<label class="check">
							<input type="checkbox" checked={settings.replay !== false} onchange={(event) => onsetting({ replay: event.currentTarget.checked })} />
							{tx.replayAfter}
						</label>
					{/if}
				</div>
			{/if}
		</div>
	{:else if tally.finished}
		<div class="done">
			<p class="big">{tx.done}</p>
			<ul class="facts">
				{#if tally.rightAfterHearing}
					<li><strong>{tx.donePoints(new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(tally.points), tally.answers.length)}</strong></li>
					<li>{tx.doneHeard(tally.rightAfterHearing)}</li>
				{:else}
					<li><strong>{tx.doneRight(tally.right, tally.answers.length)}</strong></li>
				{/if}
				{#if tally.typicalMs !== null}<li>{tx.doneTime(new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(tally.typicalMs / 1000))}</li>{/if}
				{#if tally.introduced}<li>{tx.doneNew(tally.introduced)}</li>{/if}
				<li>{tx.mastered(masteredNow, order.length)}</li>
			</ul>
			<div class="row">
				<button type="button" class="btn ghost" onclick={onexit}>{tx.back}</button>
				<button
					type="button"
					class="btn"
					onclick={() => {
						tally.restart();
						next();
					}}>{tx.again}</button
				>
			</div>
		</div>
	{/if}
	{#if question?.kind === 'notes'}<p class="hint keys">{tx.keyboard}</p>{/if}
	{#if (question?.kind === 'rhythm' || question?.kind === 'pulse') && !calibrating}
		<p class="hint keys">
			{tx.keyboardRhythm}
			{#if tapOffset !== undefined && clock.phase === 'idle' && !feedback}
				· <button type="button" class="link" onclick={() => (calibrating = true)}>{tx.recalibrate}</button>
			{/if}
		</p>
	{/if}
</section>

<style>
	.round {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
	}

	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.top h2 {
		flex: 1;
		font-size: var(--text-lg);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.bar {
		height: 4px;
		margin-top: calc(-1 * var(--space-2));
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.3s;
	}

	.prompt {
		display: grid;
		gap: var(--space-2);
		justify-items: center;
	}

	.ask {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
	}

	.new {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.letters {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--space-2);
		max-width: 480px;
		width: 100%;
		margin-inline: auto;
	}

	.options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2);
		max-width: 480px;
		width: 100%;
		margin-inline: auto;
	}

	.answer {
		min-height: 52px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-size: var(--text-xl);
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.answer.wide {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		font-size: var(--text-md);
	}

	.answer kbd {
		color: var(--text-muted);
		font-family: inherit;
		font-size: var(--text-2xs);
	}

	.answer:hover:not(:disabled) {
		border-color: var(--accent);
	}

	.answer:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.answer.right {
		border: 2px solid var(--ok);
		background: color-mix(in oklab, var(--ok) 30%, var(--surface));
		color: var(--ok);
		opacity: 1;
	}

	.answer.wrong {
		border: 2px solid var(--danger);
		background: color-mix(in oklab, var(--danger) 25%, var(--surface));
		color: var(--danger);
		opacity: 1;
	}

	.chromatic {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: var(--space-2);
		max-width: 480px;
		width: 100%;
		margin-inline: auto;
	}

	.chromatic .answer {
		font-size: var(--text-md);
	}

	.part {
		padding: 2px var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.listen {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		width: min(100%, 220px);
		padding: var(--space-5) var(--space-4);
		border: 1px dashed var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface-2);
		color: var(--accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.tuning {
		width: min(100%, 360px);
		color: var(--text-muted);
	}

	.tuning .scale {
		stroke: currentColor;
		stroke-width: 1.2;
	}

	.tuning .zone {
		fill: color-mix(in oklab, var(--ok) 25%, transparent);
	}

	.tuning .pure {
		stroke: var(--ok);
		stroke-width: 2;
	}

	.tuning .piano {
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-dasharray: 2 2;
	}

	.tuning .label {
		fill: currentColor;
		font-size: 8px;
	}

	.tuning .needle {
		fill: var(--warn);
		transition: cx 0.15s;
	}

	.tuning .needle.in {
		fill: var(--ok);
	}

	.options-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: center;
		gap: var(--space-2) var(--space-4);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		font-size: var(--text-sm);
	}

	.field.small {
		font-size: var(--text-sm);
	}

	.heard {
		margin-left: var(--space-2);
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.tempo-big {
		font-size: var(--text-lg);
	}

	.drift {
		width: min(100%, 420px);
		color: var(--text-muted);
	}

	.drift .band {
		fill: color-mix(in oklab, var(--ok) 12%, transparent);
	}

	.drift .axis {
		stroke: var(--ok);
		stroke-width: 1.5;
	}

	.drift .label {
		fill: currentColor;
		font-size: 8px;
	}

	.drift .trend {
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}

	.drift .point {
		fill: var(--ok);
	}

	.drift .point.far {
		fill: var(--warn);
	}

	.drift .missed {
		fill: none;
		stroke: var(--danger);
		stroke-width: 2;
	}

	.tapping {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
	}

	.status {
		min-height: 1.5em;
		color: var(--text-muted);
		font-weight: 600;
	}

	.pad {
		width: min(100%, 320px);
		min-height: 120px;
		border: 2px solid var(--accent);
		border-radius: var(--radius-l);
		background: var(--accent-soft);
		color: var(--accent);
		font: inherit;
		font-size: var(--text-lg);
		font-weight: 700;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		cursor: pointer;
	}

	.pad.hit {
		background: color-mix(in oklab, var(--accent) 30%, var(--surface));
	}

	.calibrate {
		max-width: 420px;
		text-align: center;
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.play {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
	}

	.listening {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
	}

	.mic {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: var(--space-2);
		border-radius: 50%;
		background: currentColor;
		opacity: 0.6;
	}

	.mic.live {
		margin-right: 0;
		background: var(--danger);
		opacity: 1;
		animation: live 1.4s ease-in-out infinite;
	}

	@keyframes live {
		50% {
			opacity: 0.35;
		}
	}

	.after {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		min-height: 92px;
		text-align: center;
	}

	.feedback {
		color: var(--danger);
		font-weight: 600;
	}

	/* Not yet, not wrong: a new note tried. */
	.feedback.gentle {
		color: var(--accent);
	}

	.feedback.ok {
		color: var(--ok);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint.keys {
		text-align: center;
		font-size: var(--text-2xs);
	}

	@media (pointer: coarse) {
		.hint.keys {
			display: none;
		}
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
	}

	.melodies {
		display: grid;
		gap: var(--space-2);
	}

	.melodies {
		width: min(100%, 22rem);
		margin-inline: auto;
	}

	.answer.melody {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2);
		align-items: center;
		padding: 0 var(--space-3);
		font-size: var(--text-base);
	}

	/* Three staves to compare at a glance: small, a row each. */
	.answer.melody :global(.staff) {
		max-width: 12rem;
	}

	.done {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	.big {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}

	.facts {
		display: grid;
		gap: var(--space-1);
		padding: 0;
		list-style: none;
		color: var(--text-muted);
	}

	.facts strong {
		color: var(--text);
	}
</style>

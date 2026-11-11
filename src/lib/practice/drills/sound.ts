import { detectPitch, DRONE_HARMONICS } from '#lib/practice/audio.ts';

/**
 * Sound for the drills, all in the browser: a short tone for each note (sound before symbol),
 * and the microphone's pitch for "play the note". As with the tuner, nothing is recorded or sent,
 * and the microphone is on only while a note is being listened for.
 */

let output: AudioContext | null = null;

/** A plucked-string-like tone of `frequency` Hz, about a second long. Call it on a tap: phones start audio only then. */
export function playTone(frequency: number, seconds = 1.1) {
	try {
		output ??= new AudioContext();
		const audio = output;
		audio.resume().catch(() => {});
		const wave = audio.createPeriodicWave(new Float32Array(DRONE_HARMONICS.length + 1), new Float32Array([0, ...DRONE_HARMONICS]));
		const oscillator = audio.createOscillator();
		oscillator.setPeriodicWave(wave);
		oscillator.frequency.value = frequency;
		const gain = audio.createGain();
		const now = audio.currentTime;
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
		gain.gain.setTargetAtTime(0, now + 0.08, seconds / 4);
		oscillator.connect(gain).connect(audio.destination);
		oscillator.start(now);
		oscillator.stop(now + seconds * 1.5);
	} catch {
		// No audio in this browser: the drills work silently.
	}
}

/** Notes together, as for an interval heard in harmony. */
export function playChord(frequencies: number[]) {
	for (const frequency of frequencies) playTone(frequency, 1.6);
}

/** Notes one after another, the last one held: a broken chord. */
export function playArpeggio(frequencies: number[], gap = 0.22) {
	frequencies.forEach((frequency, i) => setTimeout(() => playTone(frequency, i === frequencies.length - 1 ? 1.6 : 1.1), i * gap * 1000));
}

/**
 * The MIDI notes of a key's tonic triad as an arpeggio, root to octave (C major: C E G C), the
 * root between G3 and F♯4 so it sits in the middle of the range.
 */
export function triad(rootPitchClass: number, mode: 'major' | 'minor'): number[] {
	const root = 55 + ((((rootPitchClass - 7) % 12) + 12) % 12);
	return [root, root + (mode === 'major' ? 4 : 3), root + 7, root + 12];
}

export type MicProblem = 'insecure' | 'noMic';

/**
 * Listen to the microphone: `onReading` gets a frequency (or null in silence) about twelve times
 * a second. Resolves to a function that stops listening; rejects with a MicProblem.
 */
export async function listenToPitch(onReading: (frequency: number | null, time: number) => void): Promise<() => void> {
	if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw 'insecure' satisfies MicProblem;
	// Made on the tap itself (see Tuner.svelte): asking for the microphone takes longer than phones allow.
	const context = new AudioContext();
	const resumed = context.resume().catch(() => {});
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
	} catch {
		context.close().catch(() => {});
		throw 'noMic' satisfies MicProblem;
	}
	await resumed;
	const analyser = context.createAnalyser();
	analyser.fftSize = 4096;
	context.createMediaStreamSource(stream).connect(analyser);
	// Safari only runs a graph that ends in the speakers: through a gain of 0.
	const mute = context.createGain();
	mute.gain.value = 0;
	analyser.connect(mute).connect(context.destination);
	const buffer = new Float32Array(analyser.fftSize);
	const step = context.sampleRate > 30_000 ? 2 : 1;
	const samples = new Float32Array(buffer.length / step);
	const rate = context.sampleRate / step;
	const timer = setInterval(() => {
		if (context.state !== 'running') {
			context.resume().catch(() => {});
			return;
		}
		analyser.getFloatTimeDomainData(buffer);
		for (let i = 0; i < samples.length; i++) samples[i] = buffer[i * step];
		onReading(detectPitch(samples, rate), performance.now());
	}, 80);
	return () => {
		clearInterval(timer);
		stream.getTracks().forEach((track) => track.stop());
		context.close().catch(() => {});
	};
}

/** The concert A the tuner was last set to in this browser, 440 Hz if none. */
export function rememberedA4(): number {
	try {
		const a4 = JSON.parse(localStorage.getItem('tuner') ?? '{}').a4;
		return a4 >= 415 && a4 <= 466 ? a4 : 440;
	} catch {
		return 440;
	}
}

/** A short percussive sound at `time` on the audio clock: a click for the beat, a lower "tock" for a rhythm's note. */
function strike(audio: AudioContext, time: number, frequency: number, volume: number, decay: number, nodes: AudioScheduledSourceNode[]) {
	const oscillator = audio.createOscillator();
	oscillator.type = 'triangle';
	oscillator.frequency.value = frequency;
	const gain = audio.createGain();
	gain.gain.setValueAtTime(0, time);
	gain.gain.linearRampToValueAtTime(volume, time + 0.002);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
	oscillator.connect(gain).connect(audio.destination);
	oscillator.start(time);
	oscillator.stop(time + decay + 0.02);
	nodes.push(oscillator);
}

export interface PlayedBar {
	/** When the first beat after the count-in is heard, on the clock of `performance.now()` and events' `timeStamp`. */
	start: number;
	stop: () => void;
}

/**
 * A count-in of `countIn` beats (the first accented), then `beats` more beats of quieter clicks,
 * with `notes` (milliseconds from the first beat after the count-in) played as a lower sound: a
 * rhythm to hear, or (without notes) a bar to tap into. Scheduled on the audio clock, so it
 * stays exact however busy the page is. Null without audio.
 */
export async function playBar({
	bpm,
	countIn,
	beats,
	notes = [],
	meter = 4
}: {
	bpm: number;
	countIn: number;
	beats: number;
	notes?: number[];
	/** Beats in a bar, for the accent on each first beat. */
	meter?: number;
}): Promise<PlayedBar | null> {
	try {
		output ??= new AudioContext();
		const audio = output;
		if (audio.state !== 'running') await audio.resume();
		const beat = 60 / bpm;
		const first = audio.currentTime + 0.15;
		const downbeat = first + countIn * beat;
		const nodes: AudioScheduledSourceNode[] = [];
		for (let i = 0; i < countIn + beats; i++) {
			const counting = i < countIn;
			strike(audio, first + i * beat, i % meter === 0 ? 1760 : 1320, counting ? 0.32 : 0.12, 0.04, nodes);
		}
		for (const note of notes) strike(audio, downbeat + note / 1000, 660, 0.4, 0.12, nodes);
		// From the audio clock to the page's: the output's own timestamp where there is one (it
		// includes the delay to the speaker), else now plus the reported output latency.
		const stamp = audio.getOutputTimestamp?.();
		const start =
			stamp?.performanceTime && stamp.contextTime !== undefined
				? stamp.performanceTime + (downbeat - stamp.contextTime) * 1000
				: performance.now() + (downbeat - audio.currentTime + (audio.outputLatency || audio.baseLatency || 0)) * 1000;
		return {
			start,
			stop: () =>
				nodes.forEach((node) => {
					try {
						node.stop();
					} catch {
						// Already stopped.
					}
				})
		};
	} catch {
		return null;
	}
}

/**
 * A drone held under a scale (#315): the tonic, and with `fifth` its fifth above, in the tuner's
 * warm tone. Intonation is heard against it, so the ear does the work. Fades in; the returned
 * function fades it out.
 */
export function startDrone(frequency: number, fifth = false): () => void {
	try {
		output ??= new AudioContext();
		const audio = output;
		audio.resume().catch(() => {});
		const wave = audio.createPeriodicWave(new Float32Array(DRONE_HARMONICS.length + 1), new Float32Array([0, ...DRONE_HARMONICS]));
		const master = audio.createGain();
		const now = audio.currentTime;
		master.gain.setValueAtTime(0, now);
		master.gain.linearRampToValueAtTime(0.12, now + 0.5);
		master.connect(audio.destination);
		const oscillators = (fifth ? [1, 1.5] : [1]).map((ratio, i) => {
			const oscillator = audio.createOscillator();
			oscillator.setPeriodicWave(wave);
			oscillator.frequency.value = frequency * ratio;
			const level = audio.createGain();
			level.gain.value = i ? 0.6 : 1;
			oscillator.connect(level).connect(master);
			oscillator.start(now);
			return oscillator;
		});
		return () => {
			const end = audio.currentTime;
			master.gain.cancelScheduledValues(end);
			master.gain.setTargetAtTime(0, end, 0.12);
			oscillators.forEach((oscillator) => oscillator.stop(end + 0.8));
		};
	} catch {
		return () => {};
	}
}

/** Notes one after another as written: each `frequency` from `at` seconds for `seconds`. Returns a stop. */
export function playMelody(notes: { frequency: number; at: number; seconds: number }[]): () => void {
	const timers = notes.map((note) => setTimeout(() => playTone(note.frequency, Math.max(0.35, note.seconds)), note.at * 1000));
	return () => timers.forEach(clearTimeout);
}

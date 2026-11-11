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

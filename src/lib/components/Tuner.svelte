<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { readLocalJson, writeLocalJson } from '#lib/local-storage.ts';
	import { detectPitch, DRONE_HARMONICS, noteFrequency, PitchSmoother } from '#lib/practice/audio.ts';
	import TunerGauge from './TunerGauge.svelte';

	/**
	 * A tuner and a drone. The tuner reads the microphone about twelve times a second and shows
	 * the nearest note and how far off it is, with some inertia; in a pause it keeps the last
	 * reading. Nothing is recorded or sent anywhere, and the microphone is on only while it's
	 * started. The drone holds a note with overtones, at the same concert A. The concert A and
	 * the drone's note are remembered in this browser (orchestras often tune to 442 or 443 Hz).
	 * `show` picks the tuner or the drone alone, as two tabs of one set of tools; the other part
	 * keeps going meanwhile, a drone sounding on while the tuner is shown.
	 */
	let { show = 'both' }: { show?: 'both' | 'tuner' | 'drone' } = $props();
	const KEY = 'tuner';
	function remembered(): { a4: number; pitchClass: number; octave: number; fifth: boolean; volume: number } {
		const fallback = { a4: 440, pitchClass: 9, octave: 3, fifth: false, volume: 0.6 };
		const value = { ...fallback, ...(readLocalJson(KEY) as Partial<typeof fallback> | undefined) };
		return {
			a4: value.a4 >= 415 && value.a4 <= 466 ? value.a4 : 440,
			pitchClass: Number.isInteger(value.pitchClass) && value.pitchClass >= 0 && value.pitchClass < 12 ? value.pitchClass : 9,
			octave: Number.isInteger(value.octave) && value.octave >= 1 && value.octave <= 5 ? value.octave : 3,
			fifth: !!value.fifth,
			volume: value.volume >= 0 && value.volume <= 1 ? value.volume : 0.6
		};
	}

	const start = remembered();
	let a4 = $state(start.a4);
	$effect(() => {
		writeLocalJson(KEY, { a4, pitchClass, octave, fifth, volume });
	});

	// The tuner.
	let running = $state(false);
	let problem = $state<string | null>(null);
	/** The audio didn't start: one more tap starts it. */
	let suspended = $state(false);
	const smoother = new PitchSmoother();
	/** Bumped on each reading, so the note is worked out again. */
	let readings = $state(0);
	let lastHeard = $state(0);
	let now = $state(0);
	const note = $derived.by(() => {
		void readings;
		return smoother.note(a4);
	});
	/** No tone for a moment: the last reading stays, paler. */
	const stale = $derived(!!note && now - lastHeard > 700);

	let stream: MediaStream | null = null;
	let context: AudioContext | null = null;
	let timer: ReturnType<typeof setInterval> | undefined;
	const wakeAudio = () => context?.resume().catch(() => {});

	async function listen() {
		problem = null;
		// The microphone only over https (or on localhost): on the phone through http://192.168… there is none.
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			problem = t.practice.tuner.insecure;
			return;
		}
		// Made and started on the tap itself: phones keep audio silent unless it starts right on
		// a tap, and asking for the microphone takes longer than that.
		context = new AudioContext();
		const resumed = context.resume().catch(() => {});
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
		} catch {
			problem = t.practice.tuner.noMic;
			context.close().catch(() => {});
			context = null;
			return;
		}
		await resumed;
		const analyser = context.createAnalyser();
		analyser.fftSize = 4096;
		context.createMediaStreamSource(stream).connect(analyser);
		// Safari only runs a graph that ends in the speakers: through a gain of 0, so nothing is heard.
		const mute = context.createGain();
		mute.gain.value = 0;
		analyser.connect(mute).connect(context.destination);
		const buffer = new Float32Array(analyser.fftSize);
		// Every second sample at 44.1 or 48 kHz: enough for the highest notes, a quarter of the work.
		const step = context.sampleRate > 30_000 ? 2 : 1;
		const samples = new Float32Array(buffer.length / step);
		const rate = context.sampleRate / step;
		smoother.reset();
		readings++;
		running = true;
		timer = setInterval(() => {
			now = performance.now();
			// Still not running (a phone that wanted another tap, or back from the background).
			suspended = context?.state !== 'running';
			if (suspended) return;
			analyser.getFloatTimeDomainData(buffer);
			for (let i = 0; i < samples.length; i++) samples[i] = buffer[i * step];
			const frequency = detectPitch(samples, rate);
			if (!frequency) return;
			smoother.push(frequency);
			lastHeard = now;
			readings++;
		}, 80);
	}

	function stopListening() {
		clearInterval(timer);
		stream?.getTracks().forEach((track) => track.stop());
		context?.close().catch(() => {});
		stream = null;
		context = null;
		running = false;
	}

	const verdict = $derived(!note ? null : Math.abs(note.cents) <= 5 ? 'ok' : note.cents < 0 ? 'low' : 'high');
	const hertz = (hz: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(hz);

	// The drone.
	let pitchClass = $state(start.pitchClass);
	let octave = $state(start.octave);
	let fifth = $state(start.fifth);
	let volume = $state(start.volume);
	let droning = $state(false);
	let droneOpen = $state(false);
	let drone: { context: AudioContext; master: GainNode; voices: { oscillators: OscillatorNode[]; ratio: number }[] } | null = null;
	const droneFrequency = $derived(noteFrequency(pitchClass, octave, a4));
	/** The keyboard: the white keys' pitches, and each black key with the white one it follows. */
	const WHITE = [0, 2, 4, 5, 7, 9, 11];
	const BLACK: [key: number, after: number][] = [
		[1, 0],
		[3, 1],
		[6, 3],
		[8, 4],
		[10, 5]
	];

	/** Two slightly detuned voices per note make it breathe; the fifth is a pure one (3:2). */
	function droneVoice(target: NonNullable<typeof drone>, wave: PeriodicWave, ratio: number, level: number, into: AudioNode) {
		const gain = target.context.createGain();
		gain.gain.value = level;
		gain.connect(into);
		const oscillators = [-4, 4].map((detune) => {
			const oscillator = target.context.createOscillator();
			oscillator.setPeriodicWave(wave);
			oscillator.frequency.value = droneFrequency * ratio;
			oscillator.detune.value = detune;
			oscillator.connect(gain);
			oscillator.start();
			return oscillator;
		});
		return { oscillators, ratio };
	}

	function startDrone() {
		const audio = new AudioContext();
		audio.resume().catch(() => {});
		const master = audio.createGain();
		master.gain.value = 0;
		// Soft at the top, like a string heard from a little way off.
		const filter = audio.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 3200;
		filter.Q.value = 0.4;
		master.connect(filter).connect(audio.destination);
		// A slow swell, so it doesn't sound like a machine.
		const swell = audio.createOscillator();
		const depth = audio.createGain();
		swell.frequency.value = 0.18;
		depth.gain.value = 0.035;
		swell.connect(depth).connect(master.gain);
		swell.start();
		const wave = audio.createPeriodicWave(new Float32Array(DRONE_HARMONICS.length + 1), new Float32Array([0, ...DRONE_HARMONICS]));
		drone = { context: audio, master, voices: [] };
		drone.voices.push(droneVoice(drone, wave, 1, 0.5, master));
		if (fifth) drone.voices.push(droneVoice(drone, wave, 1.5, 0.32, master));
		master.gain.setTargetAtTime(volume * 0.3, audio.currentTime, 0.25);
		droning = true;
	}

	function stopDrone() {
		const ending = drone;
		drone = null;
		droning = false;
		if (!ending) return;
		ending.master.gain.setTargetAtTime(0, ending.context.currentTime, 0.2);
		setTimeout(() => ending.context.close().catch(() => {}), 1200);
	}

	// A new note or concert A glides there; the fifth or the volume change at once.
	$effect(() => {
		const frequency = droneFrequency;
		if (!drone) return;
		for (const voice of drone.voices) for (const oscillator of voice.oscillators) oscillator.frequency.setTargetAtTime(frequency * voice.ratio, drone.context.currentTime, 0.06);
	});
	$effect(() => {
		const level = volume;
		drone?.master.gain.setTargetAtTime(level * 0.3, drone.context.currentTime, 0.08);
	});
	$effect(() => {
		const withFifth = fifth;
		if (!drone || withFifth === drone.voices.length > 1) return;
		stopDrone();
		startDrone();
	});

	/** The drone on the note the tuner heard last. */
	function droneHeard() {
		if (!note) return;
		pitchClass = note.pitchClass;
		octave = Math.min(5, Math.max(1, note.octave));
	}

	$effect(() => () => {
		stopListening();
		stopDrone();
	});
</script>

{#snippet droneControls()}
	<!-- One octave of a keyboard, the note to hold pressed down. -->
	<div class="keyboard" role="group" aria-label={t.practice.drone.note}>
		{#each WHITE as key (key)}
			<button type="button" class="key white" class:on={pitchClass === key} class:sounding={droning && pitchClass === key} aria-pressed={pitchClass === key} onclick={() => (pitchClass = key)}>
				<span>{t.practice.tuner.notes[key]}</span>
			</button>
		{/each}
		{#each BLACK as [key, after] (key)}
			<button
				type="button"
				class="key black"
				class:on={pitchClass === key}
				class:sounding={droning && pitchClass === key}
				style:left="{((after + 1) / WHITE.length) * 100}%"
				aria-pressed={pitchClass === key}
				onclick={() => (pitchClass = key)}
			>
				<span>{t.practice.tuner.notes[key]}</span>
			</button>
		{/each}
	</div>
	<div class="row">
		<label class="field">
			{t.practice.drone.octave}
			<select bind:value={octave}>
				{#each [1, 2, 3, 4, 5] as each (each)}<option value={each}>{t.practice.tuner.notes[pitchClass]}{each}</option>{/each}
			</select>
		</label>
		<label class="check"><input type="checkbox" bind:checked={fifth} />{t.practice.drone.fifth}</label>
		<label class="field volume">
			{t.practice.drone.volume}
			<input type="range" min="0" max="1" step="0.05" bind:value={volume} />
		</label>
	</div>
	<div class="row">
		{#if note}<button type="button" class="btn ghost" onclick={droneHeard}>{t.practice.drone.heard}</button>{/if}
		<button type="button" class={droning ? 'btn secondary' : 'btn'} aria-pressed={droning} onclick={() => (droning ? stopDrone() : startDrone())}>
			{droning ? t.practice.drone.stop : t.practice.drone.play(`${t.practice.tuner.notes[pitchClass]}${octave}`)}
		</button>
	</div>
{/snippet}

<!-- Narrow beside the page, flat above or below it: laid out by the panel's width. -->
<div class="tuner" class:drone-only={show === 'drone'}>
	{#if show !== 'drone'}
	<!-- The device: always there, a dash before the first note, the last one held in a pause. -->
	<div class="reading" class:ok={verdict === 'ok' && !stale} class:stale class:idle={!note} role="status">
		<TunerGauge cents={note?.cents ?? null} verdict={stale ? null : verdict} quiet={!note || stale} />
		<div class="display">
			<span class="led flat" class:on={verdict === 'low' && !stale} aria-hidden="true"></span>
			<strong class="name">
				{#if note}{t.practice.tuner.notes[note.pitchClass]}<sub>{note.octave}</sub>{:else}–{/if}
			</strong>
			<span class="led sharp" class:on={verdict === 'high' && !stale} aria-hidden="true"></span>
		</div>
		<span class="detail">
			{#if note}
				{t.practice.tuner.cents(note.cents)} · {verdict === 'ok' ? t.practice.tuner.inTune : verdict === 'low' ? t.practice.tuner.low : t.practice.tuner.high} · {hertz(note.frequency)} Hz{#if stale}{' '}· {t.practice.tuner.last}{/if}
			{:else if running && suspended}
				<button type="button" class="btn small" onclick={wakeAudio}>{t.practice.tuner.tapToListen}</button>
			{:else if running}
				{t.practice.tuner.listening}
			{:else}
				{t.practice.tuner.off}
			{/if}
		</span>
	</div>
	{#if problem}<p class="msg error">{problem}</p>{/if}

	<div class="row">
		<button type="button" class={running ? 'btn ghost' : 'btn'} onclick={() => (running ? stopListening() : listen())}>
			<span class="mic" class:live={running} aria-hidden="true"></span>{running ? t.practice.tuner.stop : t.practice.tuner.start}
		</button>
		<label class="field a4">
			{t.practice.tuner.reference}
			<span>
				<input type="number" min="415" max="466" bind:value={a4} onchange={() => (a4 = Math.min(466, Math.max(415, Math.round(a4) || 440)))} />
				Hz
			</span>
		</label>
	</div>
	{/if}

	{#if show === 'drone'}
		<div class="drone alone">{@render droneControls()}</div>
	{:else if show === 'both'}
		<!-- Folded away until wanted. -->
		<details class="drone" bind:open={droneOpen}>
			<summary>{t.practice.drone.title}{#if droning}<span class="sounding-dot" aria-hidden="true"></span>{/if}</summary>
			{@render droneControls()}
		</details>
	{/if}
</div>

<style>
	.tuner {
		display: grid;
		grid-template-areas:
			'device'
			'controls'
			'drone';
		gap: var(--space-3);
	}

	.reading {
		grid-area: device;
	}

	.tuner > .row {
		grid-area: controls;
	}

	.drone {
		grid-area: drone;
	}

	/* Flat, above or below the page: the device beside its controls. */
	@container (min-width: 520px) {
		.tuner {
			grid-template-columns: minmax(220px, 280px) 1fr;
			grid-template-areas:
				'device controls'
				'device drone';
			align-items: start;
		}
	}

	/* A desk tuner: dark face, light scale, a lit window for the note. */
	.reading {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-3);
		border-radius: var(--radius-l);
		background: radial-gradient(120% 90% at 50% 0%, #2f363d, #171b1f 70%);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.08),
			inset 0 -2px 6px rgb(0 0 0 / 0.5),
			0 8px 24px rgb(0 0 0 / 0.18);
		color: #e9eef2;
	}

	.reading :global(.gauge) {
		max-width: 240px;
	}

	.display {
		display: grid;
		grid-template-columns: 12px minmax(4.5rem, auto) 12px;
		align-items: center;
		gap: var(--space-3);
		margin-top: calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-4);
		border-radius: var(--radius-control);
		background: #0c0f11;
		box-shadow: inset 0 2px 6px rgb(0 0 0 / 0.7);
	}

	.name {
		color: #e9eef2;
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		line-height: 1.1;
		text-align: center;
		transition:
			color 0.3s,
			text-shadow 0.3s;
	}

	.name sub {
		margin-left: 2px;
		color: #9aa3ab;
		font-size: var(--text-base);
	}

	.reading.ok .name {
		color: #6ee79a;
		text-shadow: 0 0 12px rgb(74 222 128 / 0.55);
	}

	.reading.stale .name,
	.reading.idle .name {
		color: #7d868e;
	}

	.led {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #3a2420;
		box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.6);
		transition:
			background 0.15s,
			box-shadow 0.15s;
	}

	.led.on {
		background: #ff7a4d;
		box-shadow: 0 0 10px #ff7a4d;
	}

	.detail {
		min-height: 1.5em;
		color: #aab3bb;
		font-size: var(--text-2xs);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: center;
		gap: var(--space-3);
	}

	.mic {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: var(--space-2);
		border-radius: 50%;
		background: currentColor;
		opacity: 0.5;
	}

	.mic.live {
		background: var(--danger);
		opacity: 1;
		animation: live 1.4s ease-in-out infinite;
	}

	@keyframes live {
		50% {
			opacity: 0.35;
		}
	}

	.a4 span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.a4 input {
		width: 4.5em;
	}

	.row {
		gap: var(--space-2);
	}

	.drone {
		padding-top: var(--space-2);
		border-top: 1px solid var(--hairline);
	}

	.drone.alone {
		padding-top: 0;
		border-top: 0;
	}

	.drone-only {
		grid-template-areas: 'drone';
	}

	.drone[open],
	.drone.alone {
		display: grid;
		gap: var(--space-2);
	}

	.drone summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.sounding-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse 1.6s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}

	/* One octave: seven white keys, five black ones over their gaps. */
	.keyboard {
		position: relative;
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		height: 80px;
		padding: 5px 5px 6px;
		border-radius: var(--radius-control);
		background: linear-gradient(#2a1d14, #3b291c);
		box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.5);
	}

	.key {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0 0 6px;
		border: 0;
		font: inherit;
		font-size: var(--text-2xs);
		cursor: pointer;
		transition:
			background 0.1s,
			transform 0.05s;
	}

	.key.white {
		margin: 0 1px;
		border-radius: 0 0 var(--radius-xs) var(--radius-xs);
		background: linear-gradient(#fdfdfb, #ecebe6);
		box-shadow:
			inset 0 -4px 0 #d6d4cc,
			0 1px 2px rgb(0 0 0 / 0.35);
		color: #5d5850;
	}

	.key.black {
		position: absolute;
		top: 6px;
		z-index: 1;
		width: 10%;
		height: 60%;
		margin-left: -5%;
		border-radius: 0 0 var(--radius-xs) var(--radius-xs);
		background: linear-gradient(#3a3a3a, #111);
		box-shadow:
			inset 0 -3px 0 #000,
			0 2px 3px rgb(0 0 0 / 0.5);
		color: #cfcfcf;
		font-size: var(--text-2xs);
	}

	.key:active {
		transform: translateY(1px);
	}

	.key.white.on {
		background: linear-gradient(var(--accent-soft), color-mix(in oklab, var(--accent) 35%, #fff));
		color: var(--accent);
		font-weight: 700;
	}

	.key.black.on {
		background: linear-gradient(color-mix(in oklab, var(--accent) 70%, #000), var(--accent));
		color: #fff;
		font-weight: 700;
	}

	.key.sounding {
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 14px color-mix(in oklab, var(--accent) 60%, transparent);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 40px;
		font-size: var(--text-sm);
	}

	.volume input {
		width: 120px;
		accent-color: var(--accent);
	}

</style>

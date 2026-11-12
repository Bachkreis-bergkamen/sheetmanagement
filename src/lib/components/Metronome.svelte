<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { readLocalJson, writeLocalJson } from '#lib/local-storage.ts';
	import { clampBpm, clicksOf, isCompound, MAX_BPM, meterById, METERS, MIN_BPM, tapTempo, tempoName, TEMPI, type Accent } from '#lib/practice/audio.ts';
	import MetronomeDevice from './MetronomeDevice.svelte';

	/**
	 * A metronome with Web Audio: clicks are scheduled a little ahead on the audio clock, so they
	 * stay even when the page is busy. Tempo by number, marking (Andante …) or tapping; a time
	 * signature stresses the bar's first beat and where it falls in two. Remembered in this browser.
	 */

	const KEY = 'metronome';
	function remembered(): { bpm: number; meter: string; dotted: boolean } {
		const value = (readLocalJson(KEY) ?? {}) as { bpm?: number; meter?: string; dotted?: boolean };
		return { bpm: clampBpm(value.bpm ?? 92), meter: meterById(value.meter ?? '4/4').id, dotted: !!value.dotted };
	}

	const start = remembered();
	let bpm = $state(start.bpm);
	let meterId = $state(start.meter);
	let dotted = $state(start.dotted);
	let running = $state(false);
	let beat = $state(-1);
	/** The pendulum: headed left or right, or at rest. */
	let side = $state<-1 | 0 | 1>(0);
	let flash = $state(false);
	let taps: number[] = [];

	const meter = $derived(meterById(meterId));
	const clicks = $derived(clicksOf(meter, dotted));
	/** The note a click stands for, before the "=": ♩ = 92. */
	const UNIT = { quarter: '♩', eighth: '♪', half: '𝅗𝅥', dotted: '♩.' } as const;

	$effect(() => {
		writeLocalJson(KEY, { bpm, meter: meterId, dotted });
	});

	let context: AudioContext | null = null;
	let timer: ReturnType<typeof setInterval> | undefined;
	let next = 0;
	let count = 0;

	/** The bar's first beat high, the middle of the bar a little lower, the rest lower still. */
	const PITCH: Record<Accent, number> = { 2: 1760, 1: 1320, 0: 990 };
	const LOUD: Record<Accent, number> = { 2: 0.9, 1: 0.7, 0: 0.5 };

	function click(at: number, accent: Accent, index: number) {
		if (!context) return;
		const tone = context.createOscillator();
		const gain = context.createGain();
		tone.frequency.value = PITCH[accent];
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(LOUD[accent], at + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
		tone.connect(gain).connect(context.destination);
		tone.start(at);
		tone.stop(at + 0.06);
		setTimeout(
			() => {
				if (!running) return;
				beat = index;
				// Off to the other side, to arrive there with the next click.
				side = side === 1 ? -1 : 1;
				flash = accent === 2;
			},
			Math.max(0, (at - context.currentTime) * 1000)
		);
	}

	/** Every 25 ms: the clicks of the next 120 ms. */
	function schedule() {
		if (!context) return;
		while (next < context.currentTime + 0.12) {
			const accents = clicks.accents;
			const index = count % accents.length;
			click(next, accents[index], index);
			count++;
			next += 60 / bpm;
		}
	}

	function play() {
		// Made and resumed on the tap itself: phones only allow sound right after one.
		context ??= new AudioContext();
		context.resume().catch(() => {});
		next = context.currentTime + 0.05;
		count = 0;
		running = true;
		timer = setInterval(schedule, 25);
	}

	function stop() {
		clearInterval(timer);
		running = false;
		beat = -1;
		side = 0;
		flash = false;
	}

	$effect(() => () => {
		stop();
		context?.close().catch(() => {});
	});

	/** A new bar starts on its first beat. */
	function chooseMeter(id: string) {
		meterId = id;
		count = 0;
		beat = -1;
	}

	function tap() {
		const now = performance.now();
		taps = [...taps.filter((at) => now - at < 8000), now];
		const tempo = tapTempo(taps);
		if (tempo) bpm = tempo;
	}

	const step = (by: number) => (bpm = clampBpm(bpm + by));
</script>

<!-- Narrow beside the page, flat above or below it: laid out by the panel's width. -->
<div class="metronome" class:running>
	<div class="device">
		<MetronomeDevice {bpm} {side} accent={flash} label={t.practice.metronome.bpm} onchange={(next) => (bpm = next)} />
	</div>

	<div class="reading">
		<label class="bpm">
			<span class="unit" aria-hidden="true">{UNIT[clicks.unit]} =</span>
			<input type="number" min={MIN_BPM} max={MAX_BPM} bind:value={bpm} onchange={() => (bpm = clampBpm(bpm || 92))} aria-label={t.practice.metronome.bpm} />
		</label>
		<strong class="name">{tempoName(bpm)}</strong>
		<div class="steps">
			<button type="button" class="round" onclick={() => step(-1)} aria-label={t.practice.metronome.slower}>−</button>
			<button type="button" class="round" onclick={() => step(1)} aria-label={t.practice.metronome.faster}>+</button>
		</div>
	</div>

	<div class="settings">
		<label class="field">
			{t.practice.metronome.tempo}
			<select value={tempoName(bpm)} onchange={(event) => (bpm = TEMPI.find((tempo) => tempo.name === event.currentTarget.value)?.typical ?? bpm)}>
				{#each TEMPI as tempo (tempo.name)}<option value={tempo.name}>{tempo.name}</option>{/each}
			</select>
		</label>
		<label class="field">
			{t.practice.metronome.meter}
			<select value={meterId} onchange={(event) => chooseMeter(event.currentTarget.value)}>
				{#each METERS as each (each.id)}<option value={each.id}>{each.id || t.practice.metronome.noMeter}</option>{/each}
			</select>
		</label>
		{#if isCompound(meter)}
			<div class="count" role="group" aria-label={t.practice.metronome.count}>
				<button type="button" class:on={!dotted} aria-pressed={!dotted} onclick={() => (dotted = false)}>♪ {t.practice.metronome.eighths}</button>
				<button type="button" class:on={dotted} aria-pressed={dotted} onclick={() => (dotted = true)}>♩. {t.practice.metronome.dotted}</button>
			</div>
		{/if}
	</div>

	<!-- The bar's beats as little lamps, the first one bigger. -->
	<div class="beats" aria-hidden="true">
		{#each clicks.accents as accent, i (i)}
			<span class="beat a{accent}" class:on={beat === i}>{meter.id ? i + 1 : ''}</span>
		{/each}
	</div>

	<div class="actions">
		<button type="button" class="btn ghost small" onclick={tap} title={t.practice.metronome.tapHint}>{t.practice.metronome.tap}</button>
		<button type="button" class="btn small go" onclick={() => (running ? stop() : play())} aria-pressed={running}>
			{running ? t.practice.metronome.stop : t.practice.metronome.start}
		</button>
	</div>
</div>

<style>
	/* Narrow: the device and the tempo side by side, everything else below. */
	.metronome {
		display: grid;
		grid-template-columns: 84px 1fr;
		grid-template-areas:
			'device reading'
			'settings settings'
			'beats beats'
			'actions actions';
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.device {
		grid-area: device;
	}

	.reading {
		display: grid;
		grid-area: reading;
		justify-items: center;
		gap: 2px;
	}

	.settings {
		display: grid;
		grid-area: settings;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}

	.beats {
		grid-area: beats;
	}

	.actions {
		display: flex;
		grid-area: actions;
		justify-content: center;
		gap: var(--space-2);
	}

	/* Flat, above or below the page: all in one band. */
	@container (min-width: 520px) {
		.metronome {
			grid-template-columns: 70px auto 1fr auto;
			grid-template-areas:
				'device reading settings actions'
				'device reading beats actions';
		}

		.actions {
			flex-direction: column;
		}
	}

	.bpm {
		display: flex;
		align-items: baseline;
		gap: 2px;
	}

	.unit {
		color: var(--text-muted);
		font-family: 'Noto Music', 'Segoe UI Symbol', 'Apple Symbols', var(--font);
		font-size: var(--text-lg);
	}

	.bpm input {
		width: 3.1ch;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: 600;
		line-height: 1;
		text-align: center;
		font-variant-numeric: tabular-nums;
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.bpm input::-webkit-inner-spin-button {
		display: none;
	}

	/* The marking as printed on a score. */
	.name {
		color: var(--accent);
		font-family: Georgia, 'Times New Roman', serif;
		font-size: var(--text-md);
		font-style: italic;
		font-weight: 600;
	}

	.steps {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}

	.round {
		width: 34px;
		height: 34px;
		border: 1px solid var(--hairline);
		border-radius: 50%;
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-xl);
		line-height: 1;
		cursor: pointer;
	}

	.round:active {
		transform: translateY(1px);
	}

	.settings select {
		width: 100%;
	}

	.count {
		display: flex;
		grid-column: 1 / -1;
		gap: 2px;
		padding: 2px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--text) 6%, transparent);
	}

	.count button {
		flex: 1;
		min-height: 30px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.count button.on {
		background: var(--surface);
		box-shadow: var(--shadow);
		color: var(--text);
		font-weight: 600;
	}

	.beats {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 22px;
	}

	.beat {
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: color-mix(in oklab, var(--text) 10%, transparent);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
		transition:
			background 0.06s,
			box-shadow 0.06s;
	}

	.beat.a2 {
		width: 22px;
		height: 22px;
		font-size: var(--text-2xs);
	}

	.beat.a1 {
		width: 19px;
		height: 19px;
	}

	.beat.on {
		background: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent);
		color: var(--accent-contrast);
	}

	.go {
		min-width: 5.5em;
	}

	.running .go {
		border-color: var(--danger);
		background: var(--danger);
	}
</style>

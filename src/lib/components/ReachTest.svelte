<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import { profile, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { limits, makeReach, noteAt, writtenStep, type Reach, type Side } from '#lib/practice/drills/reach.ts';
	import { listenToPitch, rememberedA4, type MicProblem } from '#lib/practice/drills/sound.ts';
	import { staffPosition, type Clef } from '#lib/practice/drills/theory.ts';
	import DrillStaff from './DrillStaff.svelte';
	import Icon from './Icon.svelte';

	/**
	 * The range test (see reach.ts): the lowest and then the highest note the player hits securely,
	 * played into the microphone and held, or set with the arrows. Starts from the range kept, else
	 * the comfortable one.
	 */
	let {
		instrument,
		start,
		onsave,
		onskip
	}: {
		instrument: ProfileId;
		start: [low: number, high: number];
		onsave: (reach: Reach) => void;
		onskip: () => void;
	} = $props();

	const tx = t.drills;
	const prof = $derived(profile(instrument, false));
	const bounds = $derived(limits(instrument));
	const a4 = rememberedA4();

	let side = $state<Side>('low');
	// svelte-ignore state_referenced_locally
	let low = $state(start[0]);
	// svelte-ignore state_referenced_locally
	let high = $state(start[1]);
	const step = $derived(side === 'low' ? low : high);

	/** The note's name as written: "G3". */
	const nameOf = (value: number) => {
		const pitch = noteAt(value);
		return `${tx.noteName(pitch.step, 0)}${pitch.octave}`;
	};

	/** The clef the note reads best in: on the staff or nearest it, the instrument's first clef on a tie. */
	const clefFor = (value: number): Clef => {
		const off = (clef: Clef) => {
			const position = staffPosition(clef, noteAt(value));
			return position < 0 ? -position : position > 8 ? position - 8 : 0;
		};
		return prof.clefs.reduce((best, clef) => (off(clef) < off(best) ? clef : best), prof.clefs[0]);
	};

	function move(by: number) {
		const next = Math.min(bounds[1], Math.max(bounds[0], step + by));
		if (side === 'low') low = Math.min(next, high);
		else high = Math.max(next, low);
		heard = null;
	}

	// The microphone: a note held steady for a moment (not a passing one) is taken.
	const HOLD_MS = 700;
	let stopMic: (() => void) | null = null;
	let listening = $state(false);
	let micProblem = $state<MicProblem | null>(null);
	let heard = $state<string | null>(null);
	let holding: { midi: number; since: number } | null = null;

	async function listen() {
		micProblem = null;
		try {
			stopMic = await listenToPitch((frequency, time) => {
				if (!frequency) {
					holding = null;
					return;
				}
				const semitones = 69 + 12 * Math.log2(frequency / a4);
				const midi = Math.round(semitones);
				// Between two notes, or sliding: not held.
				if (Math.abs(semitones - midi) > 0.4 || holding?.midi !== midi) {
					holding = { midi, since: time };
					return;
				}
				if (time - holding.since < HOLD_MS) return;
				const written = Math.min(bounds[1], Math.max(bounds[0], writtenStep(instrument, midi, side)));
				if (side === 'low') low = written;
				else high = written;
				heard = nameOf(written);
			});
			listening = true;
		} catch (problem) {
			micProblem = problem as MicProblem;
		}
	}

	function stopListening() {
		stopMic?.();
		stopMic = null;
		listening = false;
		holding = null;
	}

	function next() {
		heard = null;
		holding = null;
		if (side === 'low') {
			side = 'high';
			high = Math.max(high, low);
			return;
		}
		stopListening();
		onsave(makeReach(instrument, low, high));
	}

	$effect(() => () => stopListening());
</script>

<section class="reach ui-card" aria-labelledby="reach-title">
	<header class="top">
		<h2 id="reach-title">{tx.reach.title}</h2>
		<span class="count">{side === 'low' ? 1 : 2} / 2</span>
		<button
			type="button"
			class="btn ghost small"
			onclick={() => {
				stopListening();
				onskip();
			}}>{tx.reach.skip}</button
		>
	</header>
	<p class="lead">{tx.reach.lead}</p>
	<p class="ask">{side === 'low' ? tx.reach.lowAsk : tx.reach.highAsk}</p>

	<div class="note">
		<button type="button" class="btn ghost" aria-label={tx.reach.lower} disabled={step <= bounds[0] || (side === 'high' && step <= low)} onclick={() => move(-1)}>
			<Icon name="down" size={20} />
		</button>
		<div class="staff">
			<DrillStaff clef={clefFor(step)} notes={[noteAt(step)]} label={nameOf(step)} />
			<p class="name">{nameOf(step)}</p>
		</div>
		<button type="button" class="btn ghost" aria-label={tx.reach.higher} disabled={step >= bounds[1] || (side === 'low' && step >= high)} onclick={() => move(1)}>
			<Icon name="up" size={20} />
		</button>
	</div>

	<div class="mic-row" aria-live="polite">
		{#if !listening}
			<button type="button" class="btn ghost" onclick={listen}><span class="mic" aria-hidden="true"></span>{tx.micStart}</button>
		{:else}
			<p class="listening" role="status"><span class="mic live" aria-hidden="true"></span>{heard ? tx.reach.heard(heard) : tx.listening}</p>
		{/if}
		{#if micProblem}<p class="msg error">{micProblem === 'insecure' ? t.practice.tuner.insecure : t.practice.tuner.noMic}</p>{/if}
		<p class="hint">{tx.reach.byHand}{prof.transposition ? ` ${tx.reach.written}` : ''}</p>
	</div>

	<div class="row">
		<button type="button" class="btn" onclick={next}>{side === 'low' ? tx.next : tx.reach.save}</button>
	</div>
</section>

<style>
	.reach {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.top h2 {
		flex: 1;
		margin: 0;
		font-size: var(--text-lg);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.lead {
		margin: 0;
		color: var(--text-muted);
	}

	.ask {
		margin: 0;
		font-weight: 600;
		text-align: center;
	}

	.note {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
	}

	.staff {
		display: grid;
		flex: 0 1 240px;
		min-width: 0;
		justify-items: center;
	}

	.note .btn {
		flex: none;
	}

	.name {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.mic-row {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		text-align: center;
	}

	.listening {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
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

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.row {
		display: flex;
		justify-content: center;
	}
</style>

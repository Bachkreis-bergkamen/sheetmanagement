<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { noteFrequency } from '#lib/practice/audio.ts';
	import { FLUENT_MS, kindOf, questionFor, ROUND, type Question } from '#lib/practice/drills/decks.ts';
	import { profile, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { NoteJudge, type Verdict } from '#lib/practice/drills/judge.ts';
	import { dayNumber, isMastered, median, pickNext, type States } from '#lib/practice/drills/scheduler.ts';
	import { listenToPitch, playArpeggio, playTone, rememberedA4, triad, type MicProblem } from '#lib/practice/drills/sound.ts';
	import { midiOf, tonic, type Clef } from '#lib/practice/drills/theory.ts';
	import DrillStaff from './DrillStaff.svelte';

	/**
	 * One round of a drill (#300, #315): twenty questions picked by the scheduler, each answered
	 * with a tap, a key or by playing it. Right answers move on by themselves, so a fluent player
	 * keeps a quick pace; wrong ones wait, so the feedback can be read.
	 */
	let {
		order,
		clef,
		instrument,
		states,
		sound: withSound,
		title,
		onanswer,
		onexit
	}: {
		order: string[];
		clef: Clef;
		instrument: ProfileId;
		states: States;
		sound: boolean;
		title: string;
		onanswer: (id: string, correct: boolean, ms: number) => void;
		onexit: () => void;
	} = $props();

	const tx = t.drills;
	const day = dayNumber();
	const a4 = rememberedA4();

	let count = $state(0);
	let answers = $state<boolean[]>([]);
	let times = $state<number[]>([]);
	let recent: string[] = [];
	let introduced = $state(0);
	let question = $state<Question | null>(null);
	let isNew = $state(false);
	let shownAt = 0;
	let feedback = $state<{ correct: boolean; text: string; tip?: string } | null>(null);
	let chosen = $state<number | null>(null);
	let finished = $state(false);
	let autoNext: ReturnType<typeof setTimeout> | undefined;

	// "Play the note": the microphone stays on for the round once started.
	let stopMic: (() => void) | null = null;
	let listening = $state(false);
	let micProblem = $state<MicProblem | null>(null);
	let judge: NoteJudge | null = null;

	const noteName = (step: number, alter = 0) => tx.noteName(step, alter);
	const keyLabel = (fifths: number, mode: 'major' | 'minor') => {
		const key = tonic(fifths, mode);
		return tx.keyName(noteName(key.step, key.alter), mode);
	};
	const midiName = (midi: number) => `${t.practice.tuner.notes[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
	const frequencyOf = (midi: number) => noteFrequency(((midi % 12) + 12) % 12, Math.floor(midi / 12) - 1, a4);
	/** The note as it sounds on the instrument: what the tone after an answer plays. */
	/** What an answer sounds like: the note as it sounds on the instrument, or for a key its tonic triad as an arpeggio (C major: C E G C). */
	function sound(q: Question) {
		if (q.kind === 'keys') playArpeggio(triad(midiOf({ ...tonic(q.fifths, q.mode), octave: 4 }) % 12, q.mode).map(frequencyOf));
		else playTone(frequencyOf(q.kind === 'play' ? q.midi : midiOf(q.pitch)));
	}

	function next() {
		clearTimeout(autoNext);
		feedback = null;
		chosen = null;
		if (count >= ROUND) {
			finish();
			return;
		}
		const pick = pickNext({ order, states, day, answers, recent });
		const asked = pick && questionFor(pick.id, clef);
		if (!pick || !asked) {
			finish();
			return;
		}
		recent = [...recent.slice(-4), pick.id];
		question = asked;
		isNew = pick.isNew;
		count++;
		shownAt = performance.now();
		judge = asked.kind === 'play' ? new NoteJudge(asked.midi, { a4 }) : null;
	}

	function finish() {
		finished = true;
		question = null;
		stopListening();
	}

	function answer(correct: boolean, text: string, tip?: string) {
		if (!question || feedback) return;
		const ms = performance.now() - shownAt;
		const fluent = ms <= FLUENT_MS[kindOf(question.id)];
		answers = [...answers, correct];
		if (correct) times = [...times, ms];
		if (isNew) introduced++;
		onanswer(question.id, correct, ms);
		judge = null;
		feedback = { correct, text: correct ? (text || (fluent ? tx.right : tx.rightSlow)) : text, tip };
		if (withSound) sound(question);
		// Right: on by itself, a little longer when it was a new one to look at.
		if (correct) autoNext = setTimeout(next, isNew ? 1600 : 800);
	}

	/** A letter answered, or null for "don't know". */
	function answerNote(step: number | null) {
		if (question?.kind !== 'notes' || feedback) return;
		chosen = step;
		const right = question.pitch.step;
		if (step === right) return answer(true, '');
		// The letter named, the nearest way up or down from the right one: feedback that says what's off.
		const steps = ((((step ?? right) - right + 3) % 7) + 7) % 7 - 3;
		answer(false, step === null ? tx.itIs(noteName(right)) : tx.wrongNote(noteName(right), noteName(step), steps));
	}

	/** A key answered, or null for "don't know"; a wrong one comes with the rule to find it. */
	function answerKey(fifths: number | null) {
		if (question?.kind !== 'keys' || feedback) return;
		chosen = fifths;
		const { fifths: right, mode } = question;
		if (fifths === right) return answer(true, '');
		const tip = mode === 'minor' ? tx.tips.minor : right > 0 ? tx.tips.sharps : right < 0 ? tx.tips.flats : undefined;
		answer(false, tx.itIs(`${keyLabel(right, mode)} (${tx.accidentals(Math.abs(right), right > 0)})`), tip);
	}

	function heard(verdict: Verdict) {
		if (verdict.result === 'right') answer(true, Math.abs(verdict.cents) <= 10 ? tx.inTune : tx.cents(verdict.cents));
		else answer(false, verdict.octave ? tx.octave : tx.heard(midiName(verdict.midi)));
	}

	async function startListening() {
		micProblem = null;
		try {
			stopMic = await listenToPitch((frequency, time) => {
				const verdict = judge?.push(frequency, time);
				if (verdict) heard(verdict);
			});
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
		else answer(false, tx.itIs(midiName(midiOf(question.pitch))));
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey || finished) return;
		if (feedback && (event.key === ' ' || event.key === 'Enter')) {
			event.preventDefault();
			next();
			return;
		}
		if (question?.kind === 'notes') {
			const step = tx.letterKeys.indexOf(event.key.toLowerCase());
			if (step >= 0) answerNote(step);
		} else if (question?.kind === 'keys') {
			const index = Number(event.key) - 1;
			if (index >= 0 && index < question.options.length) answerKey(question.options[index]);
		}
	}

	const right = $derived(answers.filter(Boolean).length);
	const masteredNow = $derived(order.filter((id) => isMastered(states[id], FLUENT_MS[kindOf(id)])).length);
	const transposition = $derived(profile(instrument).transposition);

	next();
	$effect(() => () => {
		clearTimeout(autoNext);
		stopListening();
	});
</script>

<svelte:window {onkeydown} />

<section class="round ui-card" aria-labelledby="round-title">
	<header class="top">
		<h2 id="round-title">{title}</h2>
		{#if !finished}<span class="count" aria-label="{count} / {ROUND}">{tx.question(count, ROUND)}</span>{/if}
		<button type="button" class="btn ghost small" onclick={onexit}>{finished ? tx.back : tx.stop}</button>
	</header>
	{#if !finished}
		<div class="bar" aria-hidden="true"><span style:width="{(count / ROUND) * 100}%"></span></div>
	{/if}

	{#if question}
		<div class="prompt">
			<p class="ask">
				{#if isNew}<span class="new">{tx.new}</span>{/if}
				{question.kind === 'notes' ? tx.whichNote : question.kind === 'keys' ? tx.whichKey(question.mode) : tx.playThis}
			</p>
			{#if question.kind === 'keys'}
				<DrillStaff clef={question.clef} fifths={question.fifths} label={tx.whichKey(question.mode)} />
			{:else}
				<DrillStaff
					clef={question.clef}
					pitch={question.pitch}
					state={feedback ? (feedback.correct ? 'right' : 'wrong') : null}
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
				<p class="feedback" class:ok={feedback.correct}>{feedback.text}</p>
				{#if feedback.tip}<p class="hint">{feedback.tip}</p>{/if}
				<div class="row">
					<button type="button" class="btn ghost small" onclick={() => question && sound(question)}>{question.kind === 'keys' ? tx.replayChord : tx.replay}</button>
					<button type="button" class="btn" onclick={next}>{tx.next}</button>
				</div>
			{:else}
				<button type="button" class="btn ghost small" onclick={skip}>{tx.skip}</button>
			{/if}
		</div>
	{:else if finished}
		<div class="done">
			<p class="big">{tx.done}</p>
			<ul class="facts">
				<li><strong>{tx.doneRight(right, answers.length)}</strong></li>
				{#if times.length}<li>{tx.doneTime(new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(median(times) / 1000))}</li>{/if}
				{#if introduced}<li>{tx.doneNew(introduced)}</li>{/if}
				<li>{tx.mastered(masteredNow, order.length)}</li>
			</ul>
			<div class="row">
				<button type="button" class="btn ghost" onclick={onexit}>{tx.back}</button>
				<button
					type="button"
					class="btn"
					onclick={() => {
						count = 0;
						answers = [];
						times = [];
						introduced = 0;
						finished = false;
						next();
					}}>{tx.again}</button
				>
			</div>
		</div>
	{/if}
	{#if question?.kind === 'notes'}<p class="hint keys">{tx.keyboard}</p>{/if}
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

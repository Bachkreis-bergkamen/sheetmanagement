<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { REFLECTION_MAX, type Reflection } from '#lib/practice/drills/progress.ts';

	/**
	 * The daily round's frame (#315): where it stands among its steps (a scale to warm up over a
	 * drone, what's due for review, one new melody at sight), the note kept last time before it
	 * starts, and at the end a line for what was hard, kept on the device for next time.
	 */
	type Step = 'warmup' | 'review' | 'sight' | 'done';
	let {
		steps,
		step,
		last,
		minutes,
		onsave,
		onexit,
		onskip,
		children
	}: {
		steps: Step[];
		step: Step;
		last: Reflection | null;
		minutes: number;
		onsave: (text: string) => void;
		onexit: () => void;
		/** Past a step that needs the microphone, for when there's none or no instrument at hand. */
		onskip: () => void;
		children?: import('svelte').Snippet;
	} = $props();
	const tx = t.drills.daily;

	let reflection = $state('');
	let saved = $state(false);
	const dateOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<ol class="steps" aria-label={tx.title}>
	{#each steps.filter((each) => each !== 'done') as each, i (each)}
		{@const index = steps.indexOf(step)}
		<li class:here={each === step} class:done={i < index}>
			<span class="number">{#if i < index}<Icon name="check" size={12} />{:else}{i + 1}{/if}</span>
			{tx.steps[each]}
		</li>
	{/each}
	{#if step === 'warmup' || step === 'sight'}<li class="skip"><button type="button" class="link" onclick={onskip}>{tx.skip}</button></li>{/if}
</ol>

{#if last && step === steps[0]}
	<p class="last-note"><span class="ui-label">{t.drills.reflection.last(dateOf(last.day))}</span> {last.text}</p>
{/if}

{#if step === 'done'}
	<section class="ui-card done">
		<p class="big">{tx.done}</p>
		<p class="muted">{tx.doneLead(minutes)}</p>
		<form
			class="reflect"
			onsubmit={(event) => {
				event.preventDefault();
				if (!reflection.trim()) return;
				onsave(reflection);
				saved = true;
			}}
		>
			<label for="reflection">{t.drills.reflection.ask}</label>
			<div class="reflect-row">
				<input id="reflection" type="text" maxlength={REFLECTION_MAX} bind:value={reflection} oninput={() => (saved = false)} />
				<button type="submit" class="btn ghost small" disabled={!reflection.trim()}>{t.drills.reflection.save}</button>
			</div>
			<small class="hint" role="status">{saved ? t.drills.reflection.saved : t.drills.reflection.hint}</small>
		</form>
		<button type="button" class="btn" onclick={onexit}>{t.drills.back}</button>
	</section>
{:else}
	{@render children?.()}
{/if}

<style>
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0 0 var(--space-3);
		padding: 0;
		list-style: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.steps li {
		display: inline-flex;
		gap: var(--space-1);
		align-items: center;
	}

	.steps .skip {
		margin-inline-start: auto;
	}

	.steps li.here {
		color: var(--text);
		font-weight: 600;
	}

	.number {
		display: inline-grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border: 1px solid var(--hairline);
		border-radius: 50%;
		font-size: var(--text-xs, 0.7rem);
	}

	.here .number {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--on-accent, #fff);
	}

	.done .number {
		border-color: var(--ok);
		color: var(--ok);
	}

	.last-note {
		margin: 0 0 var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
		background: var(--surface-2);
		font-size: var(--text-sm);
	}

	section.done {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	.big {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
	}

	.reflect {
		display: grid;
		gap: var(--space-1);
		width: min(100%, 26rem);
		text-align: start;
	}

	.reflect label {
		font-weight: 600;
	}

	.reflect-row {
		display: flex;
		gap: var(--space-2);
	}

	.reflect-row input {
		flex: 1;
		min-width: 0;
	}

	.hint {
		color: var(--text-muted);
	}
</style>

<script lang="ts">
	import { ANSWERS } from '#lib/signups/signups.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	// The answer from the email's link is picked; it's saved only with the button.
	const chosen = $derived(form?.saved ?? data.picked ?? data.current ?? null);
</script>

<Title title={t.email.answerTitle} />

<section class="card">
	<img class="logo" src="/logo.svg" alt="" width="88" height="88" />
	{#if data.found && !form?.invalid}
		<h1>{data.found.title}</h1>
		<p class="when">{data.found.when}</p>
		{#if form?.saved}
			<p class="saved" role="status">{t.email.answerSaved(t.signups.answers[form.saved])}</p>
			<a class="link" href="/kalender/{encodeURIComponent(data.found.id)}">{t.email.answerChange}</a>
		{:else}
			<p>{t.email.answerLead(data.found.firstName)}</p>
			<form method="POST" class="answers">
				{#each ANSWERS as answer (answer)}
					<button class="btn" class:secondary={chosen !== answer} name="answer" value={answer} aria-pressed={chosen === answer}>
						{t.signups.answers[answer]}
					</button>
				{/each}
			</form>
			{#if form?.failed}<p class="error" role="alert">{t.signups.failed}</p>{/if}
		{/if}
	{:else}
		<h1>{t.email.answerTitle}</h1>
		<p class="error" role="alert">{t.email.answerInvalid}</p>
		<a class="link" href="/anmelden">{t.email.toSignIn}</a>
	{/if}
</section>

<style>
	.card {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		max-width: 420px;
		margin: var(--space-6) auto;
		padding: var(--space-6) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-l);
		background: var(--surface);
		text-align: center;
	}

	.logo {
		width: 88px;
		height: 88px;
	}

	h1 {
		margin: 0;
	}

	p {
		margin: 0;
		color: var(--text-muted);
	}

	.when {
		font-weight: 600;
	}

	.answers {
		display: grid;
		gap: var(--space-2);
		width: 100%;
	}

	.saved {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--accent) 12%, transparent);
		color: var(--text);
	}

	.error {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--danger) 10%, transparent);
		color: var(--text);
	}

	.link {
		color: var(--accent);
		font-weight: 600;
	}
</style>

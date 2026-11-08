<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();

	const complete = $derived(data.state === 'ready' && data.tabs.every((tab) => tab.present || tab.off));
</script>

<Title title={t.setup.title} />
<PageHeader title={t.setup.title} lead={t.setup.lead} />

{#if data.state === 'not-configured'}
	<div class="card">
		<p>{t.setup.notConfigured}</p>
		{#if data.serviceAccountEmail}<p class="muted">{t.setup.share(data.serviceAccountEmail)}</p>{/if}
		<a class="link" href="https://github.com/lgreil/sheetmanagement/blob/main/docs/setup-google.md">{t.status.setupGuide}</a>
	</div>
{:else if data.state === 'failed'}
	<div class="card error">
		<p><strong>{t.setup.failed}</strong></p>
		<p>{data.problem}</p>
		{#if data.serviceAccountEmail}<p class="muted">{t.setup.share(data.serviceAccountEmail)}</p>{/if}
	</div>
{:else}
	<div class="card">
		<div class="row">
			<div>
				<p class="label">{t.setup.sheet}</p>
				<p><strong>{data.title}</strong></p>
			</div>
			<a class="link" href={data.url} target="_blank" rel="noopener noreferrer">
				<Icon name="external" size={16} />
				{t.setup.open}
			</a>
		</div>

		<p class="label">{t.setup.tabs}</p>
		<ul class="tabs">
			{#each data.tabs as tab (tab.name)}
				<li class:present={tab.present}>
					<Icon name={tab.present ? 'check' : 'minus'} size={16} />
					{tab.name}
					<span class="muted">{tab.present ? t.setup.present : tab.off ? t.setup.off : t.setup.absent}</span>
				</li>
			{/each}
		</ul>

		{#if data.counts}
			<p class="muted">
				{t.setup.counts(data.counts.pieces, data.counts.concerts, data.counts.program)}
			</p>
		{/if}
		{#if complete}<p>{t.setup.ready}</p>{/if}
	</div>

	{#if form?.result}
		<div class="card ok" role="status">
			<p><strong>{t.setup.done}</strong></p>
			{#if form.result.createdTabs.length}<p>{t.setup.created(form.result.createdTabs.join(', '))}</p>{/if}
			{#if form.result.addedColumns.length}<p>{t.setup.addedColumns(form.result.addedColumns.join(', '))}</p>{/if}
			{#if form.result.removedTab}<p>{t.setup.removed(form.result.removedTab)}</p>{/if}
			{#if form.migrations?.length}<p>{t.setup.database(form.migrations.join(', '))}</p>{/if}
		</div>
	{:else if form?.problem}
		<div class="card error" role="alert"><p>{form.problem}</p></div>
	{/if}

	<form
		method="POST"
		use:enhance={saving.submit({ reset: true })}
	>
		<button class="button" disabled={saving.busy}>
			<Icon name={complete ? 'refresh' : 'sparkle'} size={16} />
			{complete ? t.setup.rerun : t.setup.run}
		</button>
		<p class="muted small">{t.setup.safe}</p>
	</form>
	<p><a class="link" href="/einstellungen/tabelle/datenbank">{t.status.dataMove}</a></p>

	{#if data.problems.length}
		<section class="problems">
			<h2>{t.setup.problems}</h2>
			<ul>
				{#each data.problems as problem, i (i)}
					<li>
						<span class="kind">{t.setup.problem[problem.kind]}</span>
						<span>{t.common.quote(problem.value)}</span>
						<span class="muted">{problem.tab}{problem.row ? `, ${t.setup.row(problem.row)}` : ''}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style>
	.card {
		--state: var(--border);
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		/* The state colours the whole edge and tints the card, not one side. */
		border: 1px solid color-mix(in oklab, var(--state) 45%, var(--border));
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--state) 6%, var(--surface));
	}

	.card.ok {
		--state: var(--ok);
	}

	.card.error {
		--state: var(--danger);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.label {
		margin-top: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.row .label {
		margin-top: 0;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tabs li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 4px 12px;
		border: 1px dashed var(--border);
		border-radius: var(--radius-pill);
		font-weight: 500;
	}

	.tabs li.present {
		border-style: solid;
		color: var(--ok);
	}

	.tabs li .muted {
		font-size: var(--text-xs);
	}

	.muted {
		color: var(--text-muted);
	}

	.small {
		font-size: var(--text-xs);
	}

	p {
		overflow-wrap: anywhere;
	}

	.link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-weight: 600;
	}

	form {
		display: grid;
		justify-items: start;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.button:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.problems h2 {
		margin: 0 0 var(--space-2) var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.problems ul {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.problems li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
	}

	.problems li + li {
		border-top: 1px solid var(--border);
	}

	.kind {
		color: var(--warn);
		font-weight: 600;
	}
</style>

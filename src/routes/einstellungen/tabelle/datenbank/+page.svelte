<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';
	import { LAYOUT, type TabKey } from '#lib/repertoire/sheet.ts';

	let { data, form } = $props();
	const saving = new FormState();

	const tabName = (tab: TabKey) => LAYOUT[tab].tab;
	const columnName = (tab: TabKey, column: string) => (LAYOUT[tab].columns as Record<string, string>)[column] ?? column;

	/** Asks first for the steps that change where the data lives. */
	const ask = (question: string) => (event: SubmitEvent) => confirm(question) || event.preventDefault();
</script>

<Title title={t.dataMove.title} />
<PageHeader title={t.dataMove.title} lead={t.dataMove.lead} />

<div class="card" class:ok={data.source === 'd1'}>
	<p><strong>{data.source === 'd1' ? t.dataMove.sourceD1 : t.dataMove.sourceSheet}</strong></p>
	{#if data.source === 'd1'}<p class="muted">{t.dataMove.statusD1(data.rows)}</p>{/if}
	{#if !data.hasD1}<p class="muted">{t.dataMove.noD1}</p>{/if}
	<p class="muted small">{t.dataMove.backup}</p>
</div>

{#if form?.done}
	<div class="card ok" role="status"><p>{form.done}</p></div>
{:else if form?.problem}
	<div class="card error" role="alert"><p>{form.problem}</p></div>
{/if}
{#if data.problem}
	<div class="card error" role="alert"><p>{data.problem}</p></div>
{/if}

{#if data.plan}
	<section class="card">
		<h2>{t.dataMove.preview}</h2>
		<p class="muted">{t.dataMove.previewLead}</p>
		<ul class="tabs">
			{#each data.plan.tabs as tab (tab.key)}
				<li>
					<span>{t.dataMove.tabRows(tab.tab, tab.rows)}</span>
					{#if tab.unknown.length}<span class="warn">{t.dataMove.unknown(tab.unknown.join(', '))}</span>{/if}
					{#if tab.missing.length}<span class="muted">{t.dataMove.missing(tab.missing.join(', '))}</span>{/if}
				</li>
			{/each}
		</ul>
		<p>{t.dataMove.total(data.plan.rows, data.plan.tabs.length)}</p>
		{#if data.plan.skipped.length}
			<details>
				<summary class="warn">{t.dataMove.skippedTitle} ({data.plan.skipped.length})</summary>
				<p class="muted small">{t.dataMove.skippedLead}</p>
				<ul class="tabs">
					{#each data.plan.skipped as skip (`${skip.tab} ${skip.row}`)}
						<li class="muted small">{t.dataMove.skipped[skip.kind](tabName(skip.tab), skip.row, columnName(skip.tab, skip.column), skip.value)}</li>
					{/each}
				</ul>
			</details>
		{/if}
		<form method="POST" action="?/import" onsubmit={ask(t.dataMove.importConfirm)} use:enhance={saving.submit()}>
			<button class="button" disabled={saving.busy}>
				<Icon name="download" size={16} />
				{t.dataMove.importButton}
			</button>
		</form>
	</section>
{/if}

<div class="actions">
	{#if data.source === 'd1'}
		<form method="POST" action="?/export" use:enhance={saving.submit()}>
			<button class="button secondary" disabled={saving.busy}>
				<Icon name="refresh" size={16} />
				{t.dataMove.exportButton}
			</button>
		</form>
		<form method="POST" action="?/back" onsubmit={ask(t.dataMove.backConfirm)} use:enhance={saving.submit()}>
			<button class="button secondary" disabled={saving.busy}>{t.dataMove.backButton}</button>
		</form>
	{/if}
	<a class="link" href="/api/daten" download>{t.dataMove.download}</a>
	<a class="link" href="/einstellungen/tabelle">{t.status.setupSheet}</a>
</div>

{#if data.hasD1}
	<!-- The way back from a backup file (#186): replaces everything in D1. -->
	<section class="card restore">
		<h2>{t.dataMove.restoreTitle}</h2>
		<p class="muted">{t.dataMove.restoreLead}</p>
		<form method="POST" action="?/restore" enctype="multipart/form-data" onsubmit={ask(t.dataMove.restoreConfirm)} use:enhance={saving.submit()}>
			<label class="file">
				<span>{t.dataMove.restoreFile}</span>
				<input type="file" name="backup" accept="application/json,.json" required />
			</label>
			<button class="button secondary" disabled={saving.busy}>
				<Icon name="history" size={16} />
				{t.dataMove.restoreButton}
			</button>
		</form>
	</section>
{/if}

<style>
	.card {
		--state: var(--border);
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		border: 1px solid color-mix(in oklab, var(--state) 45%, var(--border));
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--state) 6%, var(--surface));
	}

	.restore {
		margin-top: var(--space-5);
	}

	.restore form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
	}

	.file {
		display: grid;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.card.ok {
		--state: var(--ok);
	}

	.card.error {
		--state: var(--danger);
	}

	.card p,
	.card h2 {
		margin: 0;
	}

	h2 {
		font-size: var(--text-lg);
	}

	.tabs {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tabs li {
		display: grid;
		gap: 2px;
	}

	.muted {
		color: var(--text-muted);
	}

	.small {
		font-size: var(--text-sm);
	}

	.warn {
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const adding = new FormState();
	type Instrument = Extract<typeof data, { state: 'ready' }>['stock'][number];
	// After a refused save, the form keeps what was typed.
	const values = $derived(form && 'values' in form ? (form.values as Record<string, string>) : undefined);
	// Opened right away while there's nothing yet.
	// svelte-ignore state_referenced_locally
	let addOpen = $state(data.state === 'ready' && !data.stock.length && !data.retired.length);
	const f = t.lending.fields;
</script>

<Title title={t.lending.title} />
<PageHeader title={t.lending.title} lead={t.lending.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.lending.notSetUp}</p>
{:else}
	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
	{#if form && 'added' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.lending.added}</p>{/if}

	<section class="block">
		<h2 class="ui-label">{t.lending.out} <span class="count">{data.out.length}</span></h2>
		{#if data.out.length}
			<ul class="ui-list">
				{#each data.out as loan (loan.id)}
					<li class="row">
						<a class="main" href="/leihinstrumente/{loan.instrumentId}">
							<span class="head">
								<span class="title">{loan.name}</span>
								{#if loan.days !== undefined && (loan.urgency === 'overdue' || loan.urgency === 'due-soon')}
									<span class="chip {loan.urgency}"><Icon name={loan.urgency === 'overdue' ? 'alert' : 'clock'} size={12} />{t.loans.due(loan.days)}</span>
								{/if}
							</span>
							{#if loan.details.length}<span class="muted">{loan.details.join(' · ')}</span>{/if}
							<span class="who"><Icon name="user" size={14} />{loan.who} · {t.lending.since(loan.from)} · {loan.due ? t.loans.dueAt(loan.due) : t.lending.noDue}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="msg info">{t.lending.noneOut}</p>
		{/if}
	</section>

	{#snippet instrumentRow(instrument: Instrument)}
		<li class="row">
			<a class="main" href="/leihinstrumente/{instrument.id}">
				<span class="head">
					<span class="title">{instrument.name}</span>
					<span class="chip state {instrument.state}">{t.lending.statuses[instrument.state]}</span>
				</span>
				{#if instrument.details.length || instrument.with}
					<span class="muted">{[...instrument.details, instrument.with && t.lending.with(instrument.with)].filter(Boolean).join(' · ')}</span>
				{/if}
			</a>
			<Icon name="chevron" size={16} />
		</li>
	{/snippet}

	<section class="block">
		<h2 class="ui-label">{t.lending.stock} <span class="count">{data.stock.length}</span></h2>
		{#if data.stock.length}
			<ul class="ui-list">
				{#each data.stock as instrument (instrument.id)}{@render instrumentRow(instrument)}{/each}
			</ul>
		{:else}
			<p class="msg info">{t.lending.noInstruments}</p>
		{/if}
	</section>

	<details class="ui-card add" bind:open={addOpen}>
		<summary><Icon name="plus" size={16} />{t.lending.add}</summary>
		<p class="muted">{t.lending.addLead}</p>
		<form method="POST" action="?/add" use:enhance={adding.submit({ reset: true })}>
			<label class="field">
				{f.kind}
				<input name="kind" required maxlength="100" placeholder={f.kindHint} value={values?.kind ?? ''} />
			</label>
			<label class="field">
				{f.size}
				<input name="size" maxlength="40" placeholder={f.sizeHint} value={values?.size ?? ''} />
			</label>
			<label class="field">
				{f.maker}
				<input name="maker" maxlength="200" value={values?.maker ?? ''} />
			</label>
			<label class="field">
				{f.serial}
				<input name="serial" maxlength="100" placeholder={f.serialHint} value={values?.serial ?? ''} />
			</label>
			<label class="field wide">
				{f.accessories}
				<input name="accessories" maxlength="500" placeholder={f.accessoriesHint} value={values?.accessories ?? ''} />
			</label>
			<label class="field wide">
				{f.value}
				<input name="value" maxlength="200" value={values?.value ?? ''} />
			</label>
			<label class="field wide">
				{f.notes}
				<textarea name="notes" rows="2" maxlength="1000">{values?.notes ?? ''}</textarea>
			</label>
			<div class="wide">
				<button class="btn" disabled={adding.busy}><Icon name="check" size={16} />{t.lending.save}</button>
			</div>
		</form>
	</details>

	{#if data.retired.length}
		<details class="block ui-disclosure retired">
			<summary>{t.lending.retired(data.retired.length)}</summary>
			<ul class="ui-list">
				{#each data.retired as instrument (instrument.id)}{@render instrumentRow(instrument)}{/each}
			</ul>
		</details>
	{/if}
{/if}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.count {
		margin-left: var(--space-1);
		color: var(--text-muted);
		font-weight: 600;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: var(--text-muted);
	}

	.main {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
		color: var(--text);
		text-decoration: none;
	}

	.main:hover .title {
		color: var(--accent);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-2xs);
		font-weight: 700;
		white-space: nowrap;
	}

	.chip.overdue {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.chip.due-soon,
	.chip.repair {
		background: color-mix(in oklab, var(--warn) 12%, transparent);
		color: var(--warn);
	}

	.chip.available {
		background: color-mix(in oklab, var(--ok) 12%, transparent);
		color: var(--ok);
	}

	.chip.on-loan {
		background: color-mix(in oklab, var(--accent) 12%, transparent);
		color: var(--accent);
	}

	.chip.retired {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}

	.who {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.add {
		margin-bottom: var(--space-6);
		padding: var(--space-4) var(--space-5);
	}

	.add summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.add summary::-webkit-details-marker {
		display: none;
	}

	.add[open] summary {
		margin-bottom: var(--space-2);
	}

	.add form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.retired summary {
		color: var(--text-muted);
	}
</style>

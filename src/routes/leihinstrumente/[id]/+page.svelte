<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { INSTRUMENT_STATUSES } from '#lib/lending/lending.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const f = t.lending.fields;
	const instrument = $derived(data.instrument);
	// Lending it out needs it free; the details are behind a disclosure once it exists.
	let editOpen = $state(false);
	const facts = $derived(
		[
			[f.maker, instrument.maker],
			[f.serial, instrument.serial],
			[f.accessories, instrument.accessories],
			[f.value, instrument.value],
			[f.notes, instrument.notes]
		].filter((fact): fact is [string, string] => !!fact[1])
	);
</script>

<Title title={data.name} />
<a class="back" href="/leihinstrumente"><Icon name="back" size={16} />{t.lending.back}</a>
<PageHeader title={data.name} />

{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
{#if form && 'saved' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{form.saved}</p>{/if}

<p class="state">
	<span class="chip {data.state}">{t.lending.statuses[data.state]}</span>
	{#if data.open}<span>{t.lending.with(data.open.who)}</span>{/if}
</p>

{#if facts.length}
	<dl class="facts ui-card">
		{#each facts as [label, value] (label)}
			<div><dt>{label}</dt><dd>{value}</dd></div>
		{/each}
	</dl>
{/if}

{#if data.open}
	<section class="ui-card section" aria-labelledby="loan-title">
		<h2 id="loan-title" class="ui-label">{t.lending.out}</h2>
		<p class="who">
			<strong>{data.open.who}</strong> · {t.lending.since(data.open.from)} · {data.open.due ? t.loans.dueAt(data.open.due) : t.lending.noDue}
			{#if data.open.days !== undefined && (data.open.urgency === 'overdue' || data.open.urgency === 'due-soon')}
				<span class="chip {data.open.urgency}"><Icon name={data.open.urgency === 'overdue' ? 'alert' : 'clock'} size={12} />{t.loans.due(data.open.days)}</span>
			{/if}
		</p>
		{#if data.open.handover}<p class="note"><span class="muted">{t.lending.handedOver}:</span> {data.open.handover}</p>{/if}
		<form method="POST" action="?/giveBack" class="grid" use:enhance={saving.submit({ reset: true })}>
			<input type="hidden" name="loan" value={data.open.id} />
			<label class="field">
				{t.lending.returnedOn}
				<input name="returned" type="date" min={data.open.fromDay} value={data.today} />
			</label>
			<label class="field wide">
				{t.lending.returnNote}
				<input name="returnNote" maxlength="1000" placeholder={t.lending.returnNoteHint} />
			</label>
			<div class="wide">
				<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.lending.giveBack}</button>
			</div>
		</form>
	</section>
{:else if data.state === 'available'}
	<section class="ui-card section" aria-labelledby="lend-title">
		<h2 id="lend-title" class="ui-label">{t.lending.lend}</h2>
		<form method="POST" action="?/lend" class="grid" use:enhance={saving.submit({ reset: true })}>
			<label class="field wide">
				{t.lending.lendTo}
				<select name="email" required>
					<option value="">{t.lending.pick}</option>
					{#each data.people as person (person.email)}<option value={person.email}>{person.name}</option>{/each}
				</select>
			</label>
			<label class="field">
				{t.lending.lentFrom}
				<input name="from" type="date" value={data.today} />
			</label>
			<label class="field">
				{t.lending.dueLabel}
				<input name="due" type="date" min={data.today} aria-describedby="due-hint" />
				<span id="due-hint" class="hint">{t.lending.dueHint}</span>
			</label>
			<label class="field wide">
				{t.lending.handover}
				<input name="handover" maxlength="1000" placeholder={t.lending.handoverHint} />
			</label>
			<div class="wide">
				<button class="btn" disabled={saving.busy}><Icon name="loan" size={16} />{t.lending.lend}</button>
			</div>
		</form>
	</section>
{:else}
	<p class="msg info">{t.lending.notFree(t.lending.statuses[data.state])}</p>
{/if}

<details class="ui-card section edit" bind:open={editOpen}>
	<summary><Icon name="edit" size={16} />{t.lending.edit}</summary>
	<form method="POST" action="?/update" class="grid" use:enhance={saving.submit()}>
		<label class="field">
			{f.kind}
			<input name="kind" required maxlength="100" value={instrument.kind} />
		</label>
		<label class="field">
			{f.size}
			<input name="size" maxlength="40" value={instrument.size ?? ''} />
		</label>
		<label class="field">
			{f.maker}
			<input name="maker" maxlength="200" value={instrument.maker ?? ''} />
		</label>
		<label class="field">
			{f.serial}
			<input name="serial" maxlength="100" value={instrument.serial ?? ''} />
		</label>
		<label class="field wide">
			{f.accessories}
			<input name="accessories" maxlength="500" value={instrument.accessories ?? ''} />
		</label>
		<label class="field wide">
			{f.value}
			<input name="value" maxlength="200" value={instrument.value ?? ''} />
		</label>
		<label class="field wide">
			{f.notes}
			<textarea name="notes" rows="2" maxlength="1000">{instrument.notes ?? ''}</textarea>
		</label>
		<label class="field">
			{f.status}
			{#if data.open}
				<input type="hidden" name="status" value={instrument.status} />
				<span class="hint">{t.lending.statusWhileOut}</span>
			{:else}
				<select name="status" value={instrument.status}>
					{#each INSTRUMENT_STATUSES as status (status)}<option value={status}>{t.lending.statuses[status]}</option>{/each}
				</select>
			{/if}
		</label>
		<div class="wide">
			<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.lending.save}</button>
		</div>
	</form>
</details>

<section class="section" aria-labelledby="history-title">
	<h2 id="history-title" class="ui-label">{t.lending.history}</h2>
	{#if data.history.length}
		<ul class="ui-list">
			{#each data.history as loan (loan.id)}
				<li class="past">
					<strong>{loan.who}</strong>
					<span class="muted">{t.lending.period(loan.from, loan.returned)}</span>
					{#if loan.handover}<span class="note"><span class="muted">{t.lending.handedOver}:</span> {loan.handover}</span>{/if}
					{#if loan.returnNote}<span class="note"><span class="muted">{t.lending.cameBack}:</span> {loan.returnNote}</span>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">{t.lending.noHistory}</p>
	{/if}
</section>

{#if !data.open && !data.history.length}
	<form method="POST" action="?/remove" class="remove" use:enhance={saving.submit()} onsubmit={(event) => confirm(t.lending.removeQuestion) || event.preventDefault()}>
		<button class="btn small ghost danger" disabled={saving.busy}><Icon name="trash" size={14} />{t.lending.remove}</button>
	</form>
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 32px;
		margin-bottom: var(--space-2);
		color: var(--accent);
		font-weight: 600;
	}

	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
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

	.facts {
		display: grid;
		gap: var(--space-2);
		margin: 0 0 var(--space-5);
		padding: var(--space-4) var(--space-5);
	}

	.facts div {
		display: grid;
		grid-template-columns: minmax(8rem, 12rem) 1fr;
		gap: var(--space-3);
	}

	.facts dt {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	@media (max-width: 480px) {
		.facts div {
			grid-template-columns: 1fr;
			gap: 0;
		}
	}

	.section {
		margin-bottom: var(--space-5);
	}

	.ui-card.section {
		padding: var(--space-4) var(--space-5);
	}

	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin: var(--space-2) 0;
	}

	.note {
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.edit summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.edit summary::-webkit-details-marker {
		display: none;
	}

	.past {
		display: grid;
		gap: 2px;
		padding: var(--space-3) var(--space-4);
	}

	.remove {
		margin-top: var(--space-6);
	}

	.remove .danger {
		color: var(--danger);
	}
</style>

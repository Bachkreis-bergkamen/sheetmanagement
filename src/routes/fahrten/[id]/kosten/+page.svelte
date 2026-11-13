<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { FEE_CHOICES, formatEuros } from '#lib/trips/organising.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const c = t.trips.organising.costs;
	const euros = (cents: number) => formatEuros(cents, config.locale);
	/** "120,50" in the field, as people type it. */
	const plain = (cents?: number) => (cents === undefined ? '' : (cents / 100).toLocaleString(config.locale, { minimumFractionDigits: cents % 100 ? 2 : 0 }).replace(/\s/g, ''));
	// The choice per row, so the amount field shows only for "anderer Betrag".
	let choices = $state<Record<string, string>>({});
	$effect.pre(() => {
		choices = Object.fromEntries(data.rows.map((row) => [row.email, row.choice]));
	});
</script>

<Title title={c.pageTitle(data.trip.title)} />

<a class="back no-print" href="/fahrten/{data.trip.id}"><Icon name="back" size={16} />{data.trip.title}</a>

<header class="head">
	<h1>{c.title}</h1>
	<p class="lead">{c.lead}</p>
</header>

{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}

<form method="POST" action="?/fees" class="ui-card fees no-print" use:enhance={saving.submit()}>
	<label class="field">{c.fee}<input name="fee" inputmode="decimal" value={plain(data.trip.fee)} placeholder="120" /></label>
	<label class="field">{c.feeReduced}<input name="feeReduced" inputmode="decimal" value={plain(data.trip.feeReduced)} placeholder="80" /></label>
	<button class="btn small" disabled={saving.busy}>{c.saveFees}</button>
</form>

{#if data.rows.length}
	<dl class="sums">
		<div><dt>{c.due}</dt><dd>{euros(data.due)}</dd></div>
		<div class="paid"><dt>{c.paid}</dt><dd>{euros(data.paid)}</dd></div>
		<div class:open={data.open > 0}><dt>{c.open}</dt><dd>{euros(data.open)}</dd></div>
	</dl>
	{#if data.due}
		<span class="bar" aria-hidden="true"><span style:width="{(data.paid / data.due) * 100}%"></span></span>
	{/if}

	<ul class="ui-list rows">
		{#each data.rows as row (row.email)}
			<li>
				<form method="POST" action="?/pay" class="row" class:done={row.paidOn || row.fee === 0} use:enhance={saving.submit()}>
					<input type="hidden" name="email" value={row.email} />
					<span class="who">
						<strong>{row.name}</strong>
						<span class="muted">{euros(row.fee)}</span>
					</span>
					<select name="choice" aria-label={c.fee} bind:value={choices[row.email]}>
						{#each FEE_CHOICES as choice (choice)}
							{#if choice !== 'ermaessigt' || data.trip.feeReduced !== undefined}<option value={choice}>{c.choices[choice]}</option>{/if}
						{/each}
					</select>
					{#if choices[row.email] === 'eigen'}
						<input class="amount" name="amount" inputmode="decimal" aria-label={c.amount} value={plain(row.fee)} required />
					{/if}
					<label class="check"><input type="checkbox" name="paid" checked={!!row.paidOn} />{c.isPaid}</label>
					<input class="day" type="date" name="paidOn" aria-label={c.paidOn} value={row.paidOn ?? ''} max={data.today} />
					<button class="btn secondary small" disabled={saving.busy}>{c.save}</button>
				</form>
				{#if form?.error && form.email === row.email}<p class="msg error">{form.error}</p>{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="ui-card empty muted">{c.nobody}</p>
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

	.head {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}

	.lead {
		max-width: 62ch;
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.fees {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		padding: var(--space-4);
	}

	.fees .field {
		flex: 0 1 160px;
	}

	/* Due, paid, open: three numbers in a row, the open one in the warning colour while there's some. */
	.sums {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-5);
		margin: 0 0 var(--space-2);
	}

	.sums div {
		display: grid;
	}

	.sums dt {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.sums dd {
		margin: 0;
		font-size: var(--text-xl);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.sums .paid dd {
		color: var(--accent);
	}

	.sums .open dd {
		color: var(--warn);
	}

	.bar {
		display: block;
		height: 6px;
		margin-bottom: var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.rows li {
		padding: var(--space-2) var(--space-4);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.who {
		display: grid;
		flex: 1 1 160px;
		min-width: 0;
	}

	.done .who strong::after {
		content: ' ✓';
		color: var(--accent);
	}

	.row select,
	.row input:not([type='checkbox']):not([type='hidden']) {
		min-height: 36px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
	}

	.amount {
		width: 7em;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}

	.check input {
		accent-color: var(--accent);
	}

	.empty {
		padding: var(--space-5);
	}
</style>

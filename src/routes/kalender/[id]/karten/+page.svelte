<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const changing = new FormState();
	const eventUrl = $derived(`/kalender/${encodeURIComponent(data.concert.id)}`);
	// After a failed save the form keeps what was typed.
	const values = $derived({ ...data.values, ...(form?.values ?? {}) });
	const open = $derived(form?.values ? 'open' in form.values : data.values.open);
</script>

<Title title="{t.tickets.manage} · {data.concert.title}" />

<Crumbs items={[{ href: '/kalender', label: t.concerts.title }, { href: eventUrl, label: data.concert.title }]} />

<header class="head">
	<h1>{t.tickets.manage}</h1>
	<p class="muted">{data.concert.title} · {data.concert.date.long}{data.concert.date.time ? ` · ${data.concert.date.time}` : ''}</p>
</header>

{#if data.concert.past}<p class="msg info">{t.tickets.setup.past}</p>{/if}

<div class="layout">
	<form class="ui-card setup" method="POST" action="?/save" use:enhance={saving.submit()}>
		<p class="muted">{t.tickets.setup.lead}</p>
		{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
		{#if form?.saved}<p class="msg ok" role="status">{t.tickets.setup.saved}</p>{/if}

		<label class="check">
			<input type="checkbox" name="open" checked={open} />
			<span>{t.tickets.setup.open}</span>
		</label>

		<label class="field">
			<span>{t.tickets.setup.capacity}</span>
			<input name="capacity" type="number" min="1" max="5000" inputmode="numeric" required value={values.capacity} />
			<small>{t.tickets.setup.capacityHint}</small>
		</label>

		<label class="field">
			<span>{t.tickets.setup.prices}</span>
			<textarea name="prices" rows="3" required placeholder={'Erwachsene 12\nErmäßigt 6\nKinder bis 12 0'}>{values.prices}</textarea>
			<small>{t.tickets.setup.pricesHint}</small>
		</label>

		<fieldset class="fee">
			<legend>{t.tickets.setup.fee}</legend>
			<p class="hint">{t.tickets.setup.feeHint}</p>
			<div class="pair">
				<label class="field">
					<span>{t.tickets.setup.feePercent}</span>
					<input name="feePercent" inputmode="decimal" value={values.feePercent} />
				</label>
				<label class="field">
					<span>{t.tickets.setup.feeCents}</span>
					<input name="feeCents" inputmode="decimal" value={values.feeCents} />
				</label>
			</div>
			{#if data.example}<p class="hint example">{data.example}</p>{/if}
		</fieldset>

		<label class="field">
			<span>{t.tickets.setup.onlineUntil}</span>
			<input name="onlineUntil" type="datetime-local" required value={values.onlineUntil} />
			<small>{t.tickets.setup.onlineUntilHint}</small>
		</label>

		<button class="btn" disabled={saving.busy}>{t.tickets.setup.save}</button>
	</form>

	<div class="side">
		<section class="ui-card counts" aria-label={t.tickets.title}>
			<dl>
				<div><dt>{t.tickets.counts.sold}</dt><dd>{data.counts.sold}</dd></div>
				<div><dt>{t.tickets.counts.left}</dt><dd>{data.counts.left}</dd></div>
				<div><dt>{t.tickets.counts.checkedIn}</dt><dd>{data.counts.checkedIn}</dd></div>
			</dl>
			<p><strong>{t.tickets.counts.takings}: {data.counts.takings}</strong></p>
			{#if data.counts.feeCents}<p class="hint">{t.tickets.counts.fees(data.counts.fees)}</p>{/if}
			<div class="counts-actions">
				{#if !data.concert.past}<a class="btn" href="/einlass/{encodeURIComponent(data.concert.id)}"><Icon name="check" size={18} />{t.tickets.door}</a>{/if}
				{#if data.orders.length}<a class="btn secondary" href="{eventUrl}/karten/gaeste.csv" download><Icon name="download" size={18} />{t.tickets.orders.csv}</a>{/if}
			</div>
		</section>

		{#if data.prices.length}
			<!-- What the website shows: the price, the surcharge and what it comes to, apart. -->
			<table class="ui-card prices">
				<thead>
					<tr><th></th><th>{t.tickets.setup.prices}</th><th>{t.tickets.setup.fee}</th><th>{t.tickets.setup.online}</th></tr>
				</thead>
				<tbody>
					{#each data.prices as price (price.type)}
						<tr><th>{price.label}</th><td>{price.text.cents}</td><td>+ {price.text.fee}</td><td>{price.text.online}</td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<section class="orders" aria-labelledby="orders-title">
	<h2 id="orders-title">{t.tickets.orders.title}</h2>
	{#if form && 'conflict' in form}<p class="msg error" role="alert">{form.conflict}</p>{/if}
	{#if data.orders.length}
		<ul class="ui-list">
			{#each data.orders as order (order.id)}
				<li class="order" class:cancelled={order.status === 'cancelled'}>
					<div class="who">
						<strong>{order.name}</strong>
						<span class="hint">{order.email}</span>
					</div>
					<div class="what">
						<span>{t.tickets.orders.tickets(order.tickets)} · {order.kinds}</span>
						<span class="hint">
							{order.amount}{#if order.checkedIn} · {order.checkedIn} {t.tickets.doorPage.admitted}{/if}{#if order.status !== 'reserved'} · {order.status === 'paid' ? t.tickets.orders.paid : t.tickets.orders.cancelled}{/if}
						</span>
					</div>
					<form class="ui-actions" method="POST" action="?/status" use:enhance={changing.submit()}>
						<input type="hidden" name="order" value={order.id} />
						{#if order.status === 'cancelled'}
							<button name="status" value="reserved" disabled={changing.busy}>{t.tickets.orders.restore}</button>
						{:else}
							{#if order.status === 'reserved'}<button name="status" value="paid" disabled={changing.busy}>{t.tickets.orders.markPaid}</button>{/if}
							<button name="status" value="cancelled" disabled={changing.busy}>{t.tickets.orders.cancel}</button>
						{/if}
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="msg info">{t.tickets.orders.empty}</p>
	{/if}
</section>

<style>
	.head {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-5);
	}

	.muted,
	.hint,
	small {
		color: var(--text-muted);
	}

	.hint,
	small {
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: var(--space-5);
		align-items: start;
		margin-bottom: var(--space-6);
	}

	.setup,
	.side {
		display: grid;
		gap: var(--space-4);
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--tap);
		font-weight: 600;
	}

	.check input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}

	.fee {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
	}

	.fee legend {
		padding: 0 var(--space-1);
		font-weight: 600;
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.example {
		color: var(--text);
	}

	.counts dl {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-3);
		margin: 0 0 var(--space-3);
	}

	.counts dt {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.counts dd {
		margin: 0;
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.prices {
		width: 100%;
		border-collapse: separate;
		font-size: var(--text-sm);
	}

	.prices th,
	.prices td {
		padding: 4px var(--space-2);
		text-align: right;
	}

	.prices th:first-child {
		text-align: left;
	}

	.prices thead th {
		color: var(--text-muted);
		font-weight: 600;
	}

	.orders h2 {
		margin-bottom: var(--space-3);
		font-size: var(--text-lg);
	}

	.order {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) auto;
		gap: var(--space-2) var(--space-4);
		align-items: center;
		padding: var(--space-3) var(--space-4);
	}

	.order.cancelled .who,
	.order.cancelled .what {
		opacity: 0.55;
		text-decoration: line-through;
	}

	.who,
	.what {
		display: grid;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.counts-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	@media (max-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}

		/* One column: how it stands and the door first, the setup below. */
		.side {
			order: -1;
		}
	}

	@media (max-width: 760px) {
		.order {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>

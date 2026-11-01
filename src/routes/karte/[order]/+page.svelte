<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();
</script>

<Title title="{t.tickets.title}{data.concert ? ` · ${data.concert.title}` : ''}" />

<section class="order">
	<header class="head">
		<img class="logo" src={data.logo} alt="" width="56" height="56" />
		<div>
			<h1>{data.concert?.title ?? t.tickets.title}</h1>
			{#if data.concert}
				<p class="when">{data.concert.date}{data.concert.time ? ` · ${data.concert.time}` : ''}</p>
				{#if data.concert.location}<p class="muted">{data.concert.location}</p>{/if}
			{/if}
		</div>
	</header>

	{#if data.cancelled}
		<p class="cancelled" role="alert">{t.tickets.ticket.cancelled}</p>
	{:else}
		<p class="muted">{t.tickets.ticket.lead}</p>
	{/if}

	<!-- The bill, with the online surcharge apart from the price; Freikarten have none. -->
	{#if data.free}
		<p class="bill">{t.tickets.free.nothingToPay}</p>
	{:else}
		<div class="bill">
			<ul>
				{#each data.lines as line (line.text)}<li>{line.text}</li>{/each}
			</ul>
			<p class="total"><span>{t.tickets.ticket.total}</span><strong>{data.total}</strong></p>
			{#if data.hasFee}<p class="muted small">{t.tickets.ticket.fee}</p>{/if}
			<p class="small">{t.tickets.ticket.payAtDoor}</p>
		</div>
	{/if}

	<ol class="tickets" class:void={data.cancelled}>
		{#each data.tickets as ticket, i (ticket.code)}
			<li class="ticket">
				<div class="ticket-head">
					<span class="ui-label">{t.tickets.ticket.of(i + 1, data.tickets.length)}</span>
					<strong>{ticket.label}</strong>
					<span>{ticket.seat || t.tickets.ticket.freeSeating}</span>
					<span class="muted small">{ticket.price ? `${ticket.price} · ` : ''}{data.name}</span>
				</div>
				<svg class="qr" viewBox="0 0 {ticket.qr.size} {ticket.qr.size}" role="img" aria-label="{t.tickets.ticket.code} {ticket.code}" shape-rendering="crispEdges">
					<rect width={ticket.qr.size} height={ticket.qr.size} fill="#fff" />
					<path d={ticket.qr.path} fill="#000" />
				</svg>
				<code class="code">{ticket.code}</code>
			</li>
		{/each}
	</ol>

	<button class="btn ghost print" onclick={() => window.print()}>{t.tickets.ticket.print}</button>
</section>

<style>
	.order {
		display: grid;
		gap: var(--space-4);
		max-width: 560px;
		margin: 0 auto;
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.logo {
		flex: none;
		width: 56px;
		height: 56px;
		object-fit: contain;
	}

	h1 {
		margin: 0;
	}

	.when {
		font-weight: 600;
	}

	.muted {
		color: var(--text-muted);
	}

	.small {
		font-size: var(--text-sm);
	}

	.cancelled {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--danger) 14%, transparent);
		font-weight: 600;
	}

	.bill {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.bill ul {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.total {
		display: flex;
		justify-content: space-between;
		padding-top: var(--space-2);
		border-top: 1px solid var(--hairline);
	}

	.tickets {
		display: grid;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tickets.void {
		opacity: 0.45;
	}

	/* A ticket: what it is on top, the code below a hairline perforation. */
	.ticket {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: var(--space-5) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		break-inside: avoid;
	}

	.ticket-head {
		display: grid;
		justify-items: center;
		gap: 2px;
		width: 100%;
		padding-bottom: var(--space-3);
		border-bottom: 2px dashed var(--hairline);
		text-align: center;
	}

	/* White behind the code in both schemes: scanners want dark on light. */
	.qr {
		width: min(240px, 70vw);
		height: auto;
		border-radius: var(--radius-control);
	}

	.code {
		font-size: var(--text-sm);
		letter-spacing: 0.08em;
		overflow-wrap: anywhere;
	}

	.print {
		justify-self: start;
	}

	@media print {
		.print {
			display: none;
		}
	}
</style>

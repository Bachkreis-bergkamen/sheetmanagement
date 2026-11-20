<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import type { ConcertSummary } from '#lib/server/library.ts';
	import Icon from './Icon.svelte';

	let { concert }: { concert: ConcertSummary } = $props();
	const label = $derived(concert.label);
	const meta = $derived(
		[
			label ? undefined : concert.dateText || t.concert.dateUnknown,
			concert.location,
			concert.programCount ? t.pieces.count(concert.programCount) : undefined
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<!-- A concert that may be known only by year or month, e.g. from the orchestra's history. -->
<a class="row" href="/kalender/{encodeURIComponent(concert.id)}">
	<span class="date" class:year-only={!label?.month} aria-hidden="true">
		{#if label?.day}<span class="day">{label.day}</span>{/if}
		{#if label?.month}<span class="month">{label.month}</span>{/if}
		<span class="year">{label?.year ?? '?'}</span>
	</span>
	<span class="body">
		<span class="title">{concert.title}</span>
		<span class="meta">
			<span class="sr">{label?.long ?? concert.dateText ?? t.concert.dateUnknown}</span>
			{meta}
		</span>
	</span>
	<span class="chevron"><Icon name="chevron" size={16} /></span>
</a>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		transition: background 0.12s;
	}

	.row:hover {
		background: var(--surface-2);
	}

	.date {
		display: grid;
		justify-items: center;
		align-content: center;
		flex: none;
		width: 52px;
		min-height: 48px;
		padding: var(--space-1) 0;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
		line-height: 1.15;
	}

	.day {
		font-size: var(--text-lg);
		font-weight: 700;
	}

	.month,
	.year {
		font-size: var(--text-2xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.year-only .year {
		font-size: var(--text-sm);
		font-weight: 700;
	}

	.body {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.meta:empty {
		display: none;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.chevron {
		display: grid;
		flex: none;
		color: var(--text-muted);
		transition: transform 0.15s;
	}

	.row:hover .chevron {
		transform: translateX(2px);
		color: var(--accent);
	}
</style>

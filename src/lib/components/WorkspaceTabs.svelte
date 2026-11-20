<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import type { NavGroup } from '#lib/nav.ts';
	import Icon from './Icon.svelte';

	/**
	 * The pages of one job as tabs above the page ("Noten pflegen": Meldungen · Fehlende
	 * Stimmen · …), so the next chore is one tap away instead of a trip through "Mehr".
	 * Scrolls sideways on phones; the current tab is scrolled into view.
	 */
	let {
		group,
		current,
		counts = {}
	}: {
		group: NavGroup;
		current: string | undefined;
		/** Open work per page ("Meldungen 1"), the same numbers as "Wartet auf dich" (#139). */
		counts?: Record<string, number>;
	} = $props();

	function reveal(node: HTMLElement) {
		node.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
	}
</script>

<nav class="workspace no-print" aria-label={group.label}>
	<span class="label">{group.label}</span>
	<ul use:reveal>
		{#each group.items as item (item.href)}
			<li>
				<a href={item.href} class:active={item.href === current} aria-current={item.href === current ? 'page' : undefined}>
					<Icon name={item.icon} size={16} />{item.label}
					{#if counts[item.href]}<span class="count">{counts[item.href]}<span class="sr-only"> {t.nav.open}</span></span>{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.workspace {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.label {
		margin-left: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	ul {
		display: flex;
		gap: var(--space-2);
		margin: 0;
		padding: 0 0 var(--space-1);
		overflow-x: auto;
		list-style: none;
		scrollbar-width: none;
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: 36px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	a:hover {
		background: var(--surface-2);
		color: var(--text);
	}

	a.active {
		border-color: transparent;
		background: var(--accent-soft);
		color: var(--accent);
	}

	/* Something waits here: the warm "Wartet auf dich" colour, in a small pill. */
	.count {
		/* Keeps the hidden screen-reader text inside the scrolling row. */
		position: relative;
		display: grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		margin-right: -4px;
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--warn);
		color: var(--bg);
		font-size: var(--text-2xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>

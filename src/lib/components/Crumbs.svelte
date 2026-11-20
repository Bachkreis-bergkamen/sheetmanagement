<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';

	/**
	 * Where a page sits: "Konzerte › Herbstkonzert" on wide screens. Phones show only a
	 * back link to the last step, like a back button.
	 */
	let { items }: { items: { href: string; label: string }[] } = $props();
	const parent = $derived(items.at(-1));
</script>

<nav class="crumbs" aria-label={t.nav.crumbs}>
	<ol>
		{#each items as item (item.href)}
			<li><a href={item.href}>{item.label}</a><Icon name="chevron" size={14} /></li>
		{/each}
	</ol>
	{#if parent}
		<a class="back" href={parent.href}><Icon name="back" size={18} />{parent.label}</a>
	{/if}
</nav>

<style>
	.crumbs {
		margin-bottom: var(--space-4);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		color: var(--text-muted);
	}

	a {
		color: var(--text-muted);
		transition: color var(--fast) var(--ease);
	}

	ol a {
		max-width: 28ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a:hover {
		color: var(--accent);
	}

	.back {
		display: none;
	}

	@media (max-width: 720px) {
		ol {
			display: none;
		}

		.back {
			display: inline-flex;
			align-items: center;
			gap: 2px;
			min-height: 36px;
			margin-left: -6px;
			color: var(--accent);
			font-size: var(--text-base);
		}
	}
</style>

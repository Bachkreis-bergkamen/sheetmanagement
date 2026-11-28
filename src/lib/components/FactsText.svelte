<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import type { FactLine, ParsedFacts } from '#lib/repertoire/facts.ts';

	/** A piece's "Wissenswertes" (#411) as paragraphs, links kept; its sources small below. */
	let { facts, sources = true }: { facts: ParsedFacts; sources?: boolean } = $props();
</script>

{#snippet line(segments: FactLine)}{#each segments as segment, i (i)}{#if 'url' in segment}<a href={segment.url} target="_blank" rel="noopener noreferrer nofollow">{segment.label}</a>{:else}{segment.text}{/if}{/each}{/snippet}

<div class="facts-text">
	{#each facts.paragraphs as paragraph, i (i)}<p>{@render line(paragraph)}</p>{/each}
	{#if sources && facts.sources.length}
		<p class="sources">
			<span>{t.facts.sources}:</span>
			{#each facts.sources as source, i (i)}{#if i}{' · '}{/if}{@render line(source)}{/each}
		</p>
	{/if}
</div>

<style>
	.facts-text p {
		margin: 0 0 var(--space-2);
		line-height: 1.55;
		text-wrap: pretty;
	}

	.facts-text p:last-child {
		margin-bottom: 0;
	}

	.sources {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.sources span {
		font-weight: 600;
	}

	@media print {
		/* On paper a link shows as its site's name; the address itself would only be noise. */
		.facts-text a {
			color: inherit;
			text-decoration: none;
		}
	}
</style>

<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import { programLength, roundMinutes } from '#lib/repertoire/duration.ts';
	import type { ProgramItem } from '#lib/server/library.ts';
	import Icon from './Icon.svelte';

	/** `total`: a last row with the programme's length, once any piece has a duration. */
	let { items, total = false }: { items: ProgramItem[]; total?: boolean } = $props();
	// Numbers are shown only when the programme has them; old programmes often don't.
	const numbered = $derived(items.some((item) => item.position !== undefined));
	const length = $derived(programLength(items.map((item) => item.duration)));
	// The timeline: one segment per piece with a duration, as wide as its share of the concert.
	const timed = $derived(items.flatMap((item, i) => (item.duration ? [{ i, item, share: item.duration / length.seconds }] : [])));
	let hovered = $state<number | null>(null);
</script>

<ol class="program">
	{#each items as item, i (i)}
		<li class:lit={hovered === i} onpointerenter={() => (hovered = i)} onpointerleave={() => (hovered = null)}>
			<svelte:element
				this={item.pieceId ? 'a' : 'div'}
				class="item"
				href={item.pieceId ? `/stuecke/${encodeURIComponent(item.pieceId)}` : undefined}
			>
				{#if numbered}<span class="number">{item.position ?? ''}</span>{/if}
				<span class="body">
					<span class="title">{item.title}</span>
					{#if item.subtitle || item.notes || item.status === 'none'}
						<span class="meta">
							{#if item.subtitle}<span>{item.subtitle}</span>{/if}
							{#if item.status === 'none'}<span class="tag">{t.concert.notInArchive}</span>{/if}
							{#if item.notes}<span class="note">{item.notes}</span>{/if}
						</span>
					{/if}
				</span>
				<!-- In minutes: on a date page "17:30" would read as a clock time (#218). -->
				{#if item.duration}<span class="duration">{t.duration.minutes(roundMinutes(item.duration))}</span>{/if}
				{#if item.pieceId}<span class="chevron"><Icon name="chevron" size={16} /></span>{/if}
			</svelte:element>
		</li>
	{/each}
	{#if total && length.known}
		<li class="total">
			{#if timed.length > 1}
				<!-- How the evening is shared out, piece by piece; the list above says the same in words. -->
				<span class="timeline" aria-hidden="true">
					{#each timed as segment (segment.i)}
						<!-- Hover only lights up the piece in the list; nothing to do with the keyboard. -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span
							class="segment"
							class:lit={hovered === segment.i}
							style:flex-grow={segment.share}
							title="{segment.item.title} · {t.duration.minutes(roundMinutes(segment.item.duration ?? 0))}"
							onpointerenter={() => (hovered = segment.i)}
							onpointerleave={() => (hovered = null)}
						></span>
					{/each}
				</span>
			{/if}
			<span class="length"><Icon name="clock" size={16} />{t.duration.total(roundMinutes(length.seconds), length.missing)}</span>
		</li>
	{/if}
</ol>

<style>
	.program {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	li + li {
		border-top: 1px solid var(--hairline);
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 56px;
		padding: var(--space-3) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	a.item:hover {
		background: var(--surface-2);
	}

	.number {
		flex: none;
		width: 1.75rem;
		color: var(--accent);
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 700;
		text-align: right;
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
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.tag {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.note {
		font-style: italic;
	}

	.duration {
		flex: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.total {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.length {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.timeline {
		display: flex;
		gap: 3px;
		height: 10px;
	}

	.segment {
		flex-basis: 0;
		min-width: 6px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--accent) 45%, var(--surface-2));
		transition:
			background var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	.segment:nth-child(even) {
		background: color-mix(in oklab, var(--accent) 70%, var(--surface-2));
	}

	.segment.lit {
		background: var(--accent);
		transform: scaleY(1.5);
	}

	li.lit a.item {
		background: var(--surface-2);
	}

	.chevron {
		display: grid;
		flex: none;
		color: var(--text-muted);
		transition: transform 0.15s;
	}

	a.item:hover .chevron {
		transform: translateX(2px);
		color: var(--accent);
	}
</style>

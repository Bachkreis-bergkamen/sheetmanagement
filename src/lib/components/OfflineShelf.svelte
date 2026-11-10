<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { offlineParts } from '#lib/offline/parts.svelte.ts';
	import Icon from './Icon.svelte';
	import InstrumentGlyph from './InstrumentGlyph.svelte';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';

	/**
	 * Every part kept on this device (#62), from any piece, by piece: one line that opens up, so it
	 * doesn't push the concerts down (#302). Each part opens in the practice viewer, also without a
	 * connection (the bare PDF when the viewer's page isn't kept yet).
	 */
	let { offline }: { offline: boolean } = $props();

	$effect(() => offlineParts.start(offline));

	const pieces = $derived(
		[...Map.groupBy(offlineParts.listed, (part) => part.pieceId ?? part.piece).values()].map((parts) => ({
			title: parts[0].piece,
			pieceId: parts[0].pieceId,
			parts
		}))
	);

	/** The viewer online; offline too once its page is kept, else the saved PDF. */
	const href = (id: string) => (offlineParts.online ? `/ueben/${encodeURIComponent(id)}` : offlineParts.offlineHref(id));

	async function removeAll() {
		if (confirm(t.pwa.shelf.confirmRemoveAll)) await offlineParts.remove(offlineParts.listed.map((part) => part.id));
	}
</script>

{#if offlineParts.supported && pieces.length}
	<details class="shelf ui-disclosure">
		<summary>
			<Icon name="download" size={18} /><span>{t.pwa.shelf.title}</span>
			<span class="count">{t.pwa.shelf.count(offlineParts.listed.length)}</span>
		</summary>
		<div class="body">
			<p class="muted">{t.pwa.shelf.lead}</p>
			<ul class="pieces">
				{#each pieces as piece (piece.pieceId ?? piece.title)}
					<li class="piece">
						{#if piece.pieceId}<a class="title" href="/stuecke/{encodeURIComponent(piece.pieceId)}">{piece.title}</a>{:else}<span class="title">{piece.title}</span>{/if}
						<ul class="parts">
							{#each piece.parts as part (part.id)}
								<li class="part">
									<a class="open" href={href(part.id)} title={t.pwa.shelf.view(part.label)}>
										<InstrumentGlyph glyph={part.glyph ?? glyphOf(part.label)} size={16} /><span>{part.label}</span>
									</a>
									<button class="remove" onclick={() => offlineParts.remove([part.id])} title={t.pwa.removePart(part.label)} aria-label={t.pwa.removePart(part.label)}>
										<Icon name="x" size={14} />
									</button>
								</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
			<button class="btn ghost small remove-all" onclick={removeAll}><Icon name="trash" size={16} />{t.pwa.shelf.removeAll}</button>
		</div>
	</details>
{/if}

<style>
	.shelf {
		margin-bottom: var(--space-5);
		padding: 0 var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
	}

	summary :global(svg) {
		flex: none;
		color: var(--ok);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.body {
		display: grid;
		gap: var(--space-3);
		padding-bottom: var(--space-4);
	}

	.pieces {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.piece {
		display: grid;
		gap: var(--space-1);
	}

	.title {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	a.title:hover {
		color: var(--accent);
	}

	.parts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.part {
		display: inline-flex;
		align-items: stretch;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
		overflow: hidden;
	}

	.part > * {
		transition: background var(--fast) var(--ease);
	}

	.part > :hover {
		background: color-mix(in oklab, var(--accent) 24%, transparent);
	}

	.open {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		padding: 4px var(--space-3);
		color: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.remove {
		display: grid;
		place-items: center;
		width: 32px;
		border: 0;
		border-left: 1px solid color-mix(in oklab, var(--accent) 20%, transparent);
		background: none;
		color: inherit;
		cursor: pointer;
	}

	.remove-all {
		justify-self: start;
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>

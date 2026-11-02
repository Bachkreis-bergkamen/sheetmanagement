<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { offlineParts, type OfflinePart } from '#lib/offline/parts.svelte.ts';
	import ConcertMode from './ConcertMode.svelte';
	import Icon from './Icon.svelte';
	import InstrumentGlyph from './InstrumentGlyph.svelte';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';

	/**
	 * Every part kept on this device (#62), from any piece, by piece: each opens in the concert
	 * mode's viewer, also without a connection, or all of them one after another.
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
	let viewing = $state<OfflinePart[] | null>(null);

	async function removeAll() {
		if (confirm(t.pwa.shelf.confirmRemoveAll)) await offlineParts.remove(offlineParts.listed.map((part) => part.id));
	}
</script>

{#if viewing}<ConcertMode files={viewing} marks={{}} onclose={() => (viewing = null)} />{/if}

{#if offlineParts.supported && pieces.length}
	<section class="shelf" aria-labelledby="offline-shelf">
		<div class="head">
			<div>
				<h2 id="offline-shelf"><Icon name="download" size={18} />{t.pwa.shelf.title}</h2>
				<p class="muted">{t.pwa.shelf.lead}</p>
			</div>
			<div class="actions">
				<button class="btn" onclick={() => (viewing = pieces.flatMap((piece) => piece.parts))}><Icon name="eye" size={16} />{t.pwa.shelf.viewAll}</button>
				<button class="btn ghost" onclick={removeAll}><Icon name="trash" size={16} />{t.pwa.shelf.removeAll}</button>
			</div>
		</div>
		<ul class="pieces">
			{#each pieces as piece (piece.pieceId ?? piece.title)}
				<li class="piece">
					{#if piece.pieceId}<a class="title" href="/stuecke/{encodeURIComponent(piece.pieceId)}">{piece.title}</a>{:else}<span class="title">{piece.title}</span>{/if}
					<ul class="parts">
						{#each piece.parts as part (part.id)}
							<li class="part">
								<button class="open" onclick={() => (viewing = [part])} title={t.pwa.shelf.view(part.label)}>
									<InstrumentGlyph glyph={part.glyph ?? glyphOf(part.label)} size={18} /><span>{part.label}</span>
								</button>
								<button class="remove" onclick={() => offlineParts.remove([part.id])} title={t.pwa.removePart(part.label)} aria-label={t.pwa.removePart(part.label)}>
									<Icon name="x" size={14} />
								</button>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.shelf {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-7);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
	}

	h2 :global(svg) {
		color: var(--ok);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	@media (max-width: 560px) {
		.actions {
			width: 100%;
		}

		.actions .btn {
			flex: 1 1 0;
			justify-content: center;
		}
	}

	.pieces {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.piece {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
	}

	.piece + .piece {
		border-top: 1px solid var(--hairline);
	}

	.title {
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

	.part button {
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition: background var(--fast) var(--ease);
	}

	.part button:hover {
		background: color-mix(in oklab, var(--accent) 24%, transparent);
	}

	.open {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 38px;
		padding: 6px var(--space-3);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.remove {
		display: grid;
		place-items: center;
		width: 34px;
		border-left: 1px solid color-mix(in oklab, var(--accent) 20%, transparent) !important;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>

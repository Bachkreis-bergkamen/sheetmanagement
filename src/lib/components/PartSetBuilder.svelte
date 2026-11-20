<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as t from '#lib/i18n/texts.ts';
	import { mergedFileName } from '#lib/music/my-parts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';
	import type { SetPart } from '#lib/music/part-set.ts';

	/**
	 * A full set of parts to print (#195): per piece, the copies of each part from who plays what,
	 * to check and change, then one PDF built in the browser. For a concert's programme, or for a
	 * single piece (#251).
	 */
	let {
		data,
		children
	}: {
		data: {
			back: { href: string; label: string };
			title: string;
			date?: string;
			players: number;
			pieces: { title: string; pieceId?: string; parts: SetPart[] }[];
		};
		/** Shown under the heading, e.g. a choice of orchestra. */
		children?: Snippet;
	} = $props();

	// The copies, as suggested until changed here.
	// svelte-ignore state_referenced_locally
	let copies = $state<Record<string, number>>(Object.fromEntries(data.pieces.flatMap((piece) => piece.parts.map((part) => [part.id, part.copies]))));
	const printed = $derived(
		data.pieces.flatMap((piece) => piece.parts.filter((part) => part.pdf && (copies[part.id] ?? 0) > 0).map((part) => ({ ...part, piece: piece.title })))
	);
	const total = $derived(printed.reduce((sum, part) => sum + copies[part.id], 0));

	let progress = $state<string | null>(null);
	let failed = $state<string | null>(null);
	let skipped = $state<{ piece: string; label: string; reason: string }[]>([]);

	/**
	 * Every copy of every part in programme order, one PDF, put together in the browser: the
	 * Worker has too little CPU time for it. A part that can't be read is left out and named.
	 */
	async function build() {
		failed = null;
		skipped = [];
		try {
			const { PDFDocument } = await import('@cantoo/pdf-lib');
			const merged = await PDFDocument.create();
			for (const [i, part] of printed.entries()) {
				progress = t.partSet.building(i + 1, printed.length);
				let reason = '';
				try {
					const response = await fetch(`/api/noten/${encodeURIComponent(part.id)}`);
					if (!response.ok) reason = t.myParts.skipHttp(response.status, '');
					else {
						// Copy-protected publisher PDFs open with the empty password (#80).
						const doc = await PDFDocument.load(await response.arrayBuffer(), { password: '' });
						for (let copy = 0; copy < copies[part.id]; copy++) {
							for (const page of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(page);
						}
					}
				} catch (error) {
					console.error(error);
					reason = navigator.onLine ? t.myParts.skipUnreadable : t.myParts.skipOffline;
				}
				if (reason) skipped.push({ piece: part.piece, label: part.label, reason });
			}
			if (!merged.getPageCount()) return void (failed = t.myParts.mergeFailed);
			const link = document.createElement('a');
			link.href = URL.createObjectURL(new Blob([(await merged.save()) as BlobPart], { type: 'application/pdf' }));
			link.download = mergedFileName(data.title, t.partSet.fileName);
			link.click();
			setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
		} catch (error) {
			console.error(error);
			failed = t.myParts.mergeFailed;
		} finally {
			progress = null;
		}
	}
</script>

<Title title="{t.partSet.title} · {data.title}" />

<a class="back" href={data.back.href}><Icon name="back" size={16} />{data.back.label}</a>

<header class="head">
	<h1>{t.partSet.title}{#if data.pieces.length === 1}: {data.title}{/if}</h1>
	{#if data.date}<p class="date">{data.date}</p>{/if}
	<p class="lead">{t.partSet.lead(data.players)}</p>
	{@render children?.()}
</header>

{#each data.pieces as piece, i (i)}
	<section class="block">
		<h2 class="piece">
			<span class="number">{i + 1}</span>
			{#if piece.pieceId}<a href="/stuecke/{encodeURIComponent(piece.pieceId)}">{piece.title}</a>{:else}{piece.title}{/if}
		</h2>
		{#if piece.parts.length}
			<ul class="ui-list parts">
				{#each piece.parts as part (part.id)}
					<li class:off={!copies[part.id]}>
						<span class="label">
							<span class="name">{part.label}</span>
							<span class="meta">
								{t.partSet.players(part.players)}
								{#if part.status !== 'ok'}<span class="chip warn"><Icon name="alert" size={12} />{t.piece.partStatus[part.status]}</span>{/if}
								{#if !part.pdf && part.status === 'ok'}<span class="chip">{t.partSet.notPdf}</span>{/if}
							</span>
						</span>
						<input
							class="count"
							type="number"
							inputmode="numeric"
							min="0"
							max="40"
							bind:value={copies[part.id]}
							disabled={!part.pdf}
							aria-label={t.partSet.copies(part.label)}
						/>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="msg info">{t.partSet.noMusic}</p>
		{/if}
	</section>
{/each}

{#if failed}<p class="msg error" role="alert">{failed}</p>{/if}
{#if skipped.length}
	<div class="msg error" role="alert">
		<p>{t.myParts.skipped(skipped.length)}</p>
		<ul>
			{#each skipped as part, i (i)}<li><strong>{part.piece}</strong> – {part.label}: {part.reason}</li>{/each}
		</ul>
	</div>
{/if}

<!-- The total and the one action, kept in reach while scrolling a long programme. -->
<div class="bar">
	<span class="total" role="status">{t.partSet.total(total, printed.length)}</span>
	<button class="btn" onclick={build} disabled={!!progress || !total}><Icon name="print" size={16} />{progress ?? t.partSet.build}</button>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
		color: var(--accent);
		font-weight: 600;
	}

	.head {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.date,
	.lead {
		margin: 0;
		color: var(--text-muted);
	}

	.lead {
		max-width: 62ch;
	}

	.block {
		margin-bottom: var(--space-5);
	}

	.piece {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
		font-size: var(--text-lg);
	}

	.number {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.parts li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
	}

	.label {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	/* Nothing printed of it: quieter, but still readable. */
	.off .name {
		color: var(--text-muted);
		font-weight: 500;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.chip.warn {
		background: color-mix(in oklab, var(--warn) 12%, transparent);
		color: var(--warn);
	}

	.count {
		flex: none;
		width: 4.5rem;
		min-height: var(--tap);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.count:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.bar {
		position: sticky;
		bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-l);
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		backdrop-filter: blur(8px);
		box-shadow: var(--shadow-raised);
	}

	.total {
		font-weight: 600;
	}

	/* Above the tab bar, which phones show at the bottom. */
	@media (max-width: 720px) {
		.bar {
			bottom: calc(var(--tabbar-height) + var(--space-2) + env(safe-area-inset-bottom));
		}
	}
</style>

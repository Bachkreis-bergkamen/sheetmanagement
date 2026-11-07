<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { OpenScore } from '#lib/music/score-reader.ts';
	import Icon from './Icon.svelte';

	/**
	 * Shows a part's pages, drawn in the browser with pdf.js, so composer and arranger can be
	 * typed off the page when reading the text fails (scans). The link opens the PDF in the
	 * browser's own viewer, where text can be selected and copied.
	 */
	let { fileId, hint = t.viewer.hint }: { fileId: string; hint?: string } = $props();

	let score = $state<OpenScore | null>(null);
	let pages = $state(0);
	let page = $state(1);
	let zoomed = $state(false);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let canvas = $state<HTMLCanvasElement>();
	let box = $state<HTMLDivElement>();

	// A new file: open it, and free the old one.
	$effect(() => {
		const id = fileId;
		let opened: OpenScore | null = null;
		let cancelled = false;
		loading = true;
		error = null;
		score = null;
		page = 1;
		(async () => {
			try {
				const { openScore } = await import('#lib/music/score-reader.ts');
				opened = await openScore(id);
				if (cancelled) return void opened.destroy();
				score = opened;
				pages = opened.doc.numPages;
			} catch (cause) {
				if (!cancelled) error = (cause as { reason?: string }).reason === 'download' ? t.suggest.downloadFailed : t.suggest.unreadable;
			} finally {
				if (!cancelled) loading = false;
			}
		})();
		return () => {
			cancelled = true;
			opened?.destroy();
		};
	});

	// Draws the current page at the box's width, twice as wide when zoomed. One drawing at a
	// time: pdf.js refuses a second one on the same canvas.
	let drawing: Promise<unknown> = Promise.resolve();
	$effect(() => {
		if (!score || !canvas || !box) return;
		const width = Math.max(200, box.clientWidth - 2) * (zoomed ? 2 : 1);
		const [current, number, target] = [score, page, canvas];
		drawing = drawing
			.then(() => import('#lib/music/score-reader.ts'))
			.then(({ renderPage }) => renderPage(current, number, target, width))
			.catch(() => (error = t.suggest.unreadable));
	});
</script>

<div class="viewer">
	<div class="bar">
		<button type="button" class="icon" onclick={() => page--} disabled={page <= 1} aria-label={t.viewer.previous}><Icon name="back" size={16} /></button>
		<span class="pages">{t.viewer.page(page, pages || 1)}</span>
		<button type="button" class="icon" onclick={() => page++} disabled={page >= pages} aria-label={t.viewer.next}><Icon name="chevron" size={16} /></button>
		<button type="button" class="text" onclick={() => (zoomed = !zoomed)} aria-pressed={zoomed}>{zoomed ? t.viewer.smaller : t.viewer.larger}</button>
		<a class="text" href="/api/noten/{encodeURIComponent(fileId)}" target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} />{t.viewer.open}</a>
	</div>
	<div class="box" bind:this={box}>
		{#if error}
			<p class="note">{error}</p>
		{:else if loading}
			<p class="note">{t.viewer.loading}</p>
		{/if}
		<canvas bind:this={canvas} hidden={!!error || loading}></canvas>
	</div>
	<p class="hint">{hint}</p>
</div>

<style>
	.viewer {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
	}

	.pages {
		min-width: 5em;
		color: var(--text-muted);
		text-align: center;
	}

	.icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
	}

	.icon:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.text {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.box {
		max-height: 70vh;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: #fff;
	}

	canvas {
		display: block;
	}

	.note {
		margin: 0;
		padding: var(--space-4);
		/* On the white sheet in both schemes, so the light muted ink. */
		color: #625e55;
		font-size: var(--text-sm);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>

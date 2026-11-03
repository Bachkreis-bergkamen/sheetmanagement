<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { instrumentationFromScore } from '#lib/music/instrumentation.ts';
	import Icon from '#lib/components/Icon.svelte';

	/**
	 * The Besetzung of every score at once (#249), read in the browser: the Worker may not read
	 * PDFs on the free plan's CPU budget. Scans without text go to text recognition when asked.
	 * Counts how many scores have a text layer, which says how far reading alone gets.
	 */
	let { scores, saved }: { scores: { pieceId: string; title: string; fileId: string }[]; saved?: number } = $props();

	type Result = { pieceId: string; title: string; text: string; kind: 'found' | 'nothing' | 'scan' | 'failed'; byOcr: boolean; take: boolean };
	let results = $state<Result[]>([]);
	let running = $state(false);
	let stopping = false;
	let ocr = $state(false);
	let stats = $state({ withText: 0, scans: 0, byOcr: 0, found: 0, failed: 0 });

	async function run() {
		running = true;
		stopping = false;
		results = [];
		stats = { withText: 0, scans: 0, byOcr: 0, found: 0, failed: 0 };
		const { readScorePages, createLabelReader } = await import('#lib/music/score-reader.ts');
		let reader: Awaited<ReturnType<typeof createLabelReader>> | undefined;
		try {
			for (const score of scores) {
				if (stopping) break;
				const result: Result = { pieceId: score.pieceId, title: score.title, text: '', kind: 'nothing', byOcr: false, take: false };
				try {
					const { lines, labels } = await readScorePages(score.fileId, 1);
					let found = labels;
					if (lines.length) stats.withText++;
					else {
						stats.scans++;
						if (ocr) {
							reader ??= await createLabelReader();
							found = await reader.labels(score.fileId);
							result.byOcr = true;
							stats.byOcr++;
						} else result.kind = 'scan';
					}
					result.text = instrumentationFromScore(found, config);
					if (result.text) {
						result.kind = 'found';
						result.take = true;
						stats.found++;
					}
				} catch {
					result.kind = 'failed';
					stats.failed++;
				}
				results.push(result);
			}
		} finally {
			await reader?.close();
			running = false;
		}
	}

	const taken = $derived(results.filter((result) => result.kind === 'found' && result.take));
</script>

<section class="run" aria-labelledby="score-run-title">
	<h2 id="score-run-title"><Icon name="music" size={18} />{t.gaps.scores.title}</h2>
	<p class="muted">{t.gaps.scores.lead(scores.length)}</p>
	{#if saved !== undefined}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.gaps.scores.saved(saved)}</p>{/if}

	<label class="check"><input type="checkbox" bind:checked={ocr} disabled={running} />{t.gaps.scores.ocr}</label>
	<div class="actions">
		{#if running}
			<button class="btn ghost" type="button" onclick={() => (stopping = true)}>{t.gaps.scores.stop}</button>
		{:else}
			<button class="btn" type="button" onclick={run} disabled={!scores.length}>{t.gaps.scores.start}</button>
		{/if}
		{#if results.length}<span class="muted" role="status">{t.gaps.scores.progress(results.length, scores.length)}</span>{/if}
	</div>

	{#if results.length}
		<ul class="stats">
			<li><strong>{stats.withText}</strong> {t.gaps.scores.withText}</li>
			<li><strong>{stats.scans}</strong> {t.gaps.scores.scans}</li>
			{#if stats.byOcr}<li><strong>{stats.byOcr}</strong> {t.gaps.scores.byOcr}</li>{/if}
			<li><strong>{stats.found}</strong> {t.gaps.scores.found}</li>
			{#if stats.failed}<li><strong>{stats.failed}</strong> {t.gaps.scores.failed}</li>{/if}
		</ul>

		<form method="POST" action="?/instrumentation" use:enhance={() => async ({ update }) => { await update(); results = []; }}>
			<input type="hidden" name="entries" value={JSON.stringify(taken.map((result) => ({ id: result.pieceId, text: result.text })))} />
			<ul class="results">
				{#each results as result (result.pieceId)}
					<li class={result.kind}>
						{#if result.kind === 'found'}
							<label class="check">
								<input type="checkbox" bind:checked={result.take} />
								<span><strong>{result.title}</strong>{result.byOcr ? ' (OCR)' : ''}: <input class="text" bind:value={result.text} aria-label={result.title} /></span>
							</label>
						{:else}
							<strong>{result.title}</strong>
							<span class="muted">{result.kind === 'scan' ? t.gaps.scores.scan : result.kind === 'failed' ? t.gaps.scores.failed : t.gaps.scores.nothing}</span>
						{/if}
					</li>
				{/each}
			</ul>
			{#if !running && taken.length}<button class="btn">{t.gaps.scores.take(taken.length)}</button>{/if}
		</form>
	{/if}
</section>

<style>
	.run {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-6, 32px);
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-lg);
	}

	p {
		margin: 0;
	}

	.check {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}

	.check input[type='checkbox'] {
		margin-top: 3px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.results {
		display: grid;
		gap: var(--space-2);
		max-height: 420px;
		margin: 0 0 var(--space-3);
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.results li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: baseline;
	}

	.results .text {
		width: min(100%, 520px);
		margin-top: var(--space-1);
		font: inherit;
		font-size: var(--text-sm);
	}
</style>

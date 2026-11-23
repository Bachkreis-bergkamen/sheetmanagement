<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';

	/** Missing parts of one piece on IMSLP (#198): asked only when someone taps, the server caches it. */
	let { pieceId }: { pieceId: string } = $props();

	type Answer =
		| { state: 'found'; search: string; title: string; url: string; parts: string[]; complete: boolean; gaps: { id: string; label: string; found: boolean }[] }
		| { state: 'none' | 'unavailable'; search?: string };

	let busy = $state(false);
	let answer = $state<Answer | null>(null);

	async function look() {
		busy = true;
		try {
			const response = await fetch(`/api/imslp?stueck=${encodeURIComponent(pieceId)}`, { headers: { accept: 'application/json' } });
			answer = response.headers.get('content-type')?.includes('json') ? ((await response.json()) as Answer) : { state: 'unavailable' };
		} catch {
			answer = { state: 'unavailable' };
		} finally {
			busy = false;
		}
	}
</script>

{#if !answer}
	<button class="mini ghost" type="button" title={t.imslp.searchHint} disabled={busy} onclick={look}>
		<Icon name="search" size={12} />{busy ? t.imslp.searching : t.imslp.search}
	</button>
{:else}
	<div class="imslp" role="status">
		{#if answer.state === 'found'}
			<a href={answer.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} />{t.imslp.open}</a>
			<p>{answer.parts.length ? t.imslp.has(answer.parts.join(', ')) : t.imslp.noParts}</p>
			{#if answer.complete}<p>{t.imslp.complete}</p>{/if}
			{#if answer.gaps.length}
				<ul>
					{#each answer.gaps as gap (gap.id)}
						<li class:found={gap.found}><Icon name={gap.found ? 'check' : 'alert'} size={12} />{gap.found ? t.imslp.found(gap.label) : t.imslp.notFound(gap.label)}</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<p>{answer.state === 'none' ? t.imslp.none : t.imslp.unavailable}</p>
			{#if answer.search}<a href={answer.search} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} />{t.imslp.searchThere}</a>{/if}
		{/if}
	</div>
{/if}

<style>
	.imslp {
		display: grid;
		gap: var(--space-1);
		flex-basis: 100%;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-s);
		background: var(--surface-2);
		font-size: var(--text-sm);
	}

	.imslp p {
		margin: 0;
		color: var(--text-muted);
	}

	.imslp a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-weight: 600;
	}

	.imslp ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.imslp li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
	}

	.imslp li.found {
		color: var(--ok);
	}
</style>

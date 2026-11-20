<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const first = $derived(data.pieces[0]);
	const complete = $derived(data.total ? Math.round(((data.total - data.filters[0].count) / data.total) * 100) : 0);
</script>

<Title title={t.details.title} />
<PageHeader title={t.details.title} lead={t.details.lead} />

{#if data.done}
	<p class="msg ok" role="status"><Icon name="check" size={16} />{t.details.allDone}</p>
{/if}
{#if form?.message}
	<p class="msg error" role="alert">{form.message}</p>
{:else if form?.noRecording}
	<p class="msg ok" role="status"><Icon name="check" size={16} />{t.details.noRecordingSaved(form.noRecording)}</p>
{/if}

<div class="progress" aria-label={t.details.progress(complete)}>
	<span class="bar"><span style:width="{complete}%"></span></span>
	<span class="ui-hint">{t.details.progress(complete)}</span>
</div>

<div class="toolbar">
	<nav class="chips" aria-label={t.details.filterLabel}>
		{#each data.filters as option (option.value)}
			<a class="chip" class:active={data.filter === option.value} href="?filter={option.value}" aria-current={data.filter === option.value ? 'page' : undefined}>
				{t.details.filters[option.value]} <span class="count">{option.count}</span>
			</a>
		{/each}
	</nav>
	{#if first}
		<a class="btn" href="/stuecke/{encodeURIComponent(first.id)}/bearbeiten?liste={data.filter}">
			<Icon name="sparkle" size={16} />{t.details.start(data.pieces.length)}
		</a>
	{/if}
</div>

{#if data.pieces.length}
	<ul class="list">
		{#each data.pieces as piece (piece.id)}
			<li>
				<a href="/stuecke/{encodeURIComponent(piece.id)}/bearbeiten?liste={data.filter}">
					<span class="main">
						<strong>{piece.title}</strong>
						{#if piece.composer || piece.catalogue}<span class="ui-hint">{[piece.composer, piece.catalogue].filter(Boolean).join(' · ')}</span>{/if}
					</span>
					<span class="gaps">
						{#each piece.gaps as gap (gap)}<span class="gap">{t.details.missing[gap]}</span>{/each}
					</span>
					<Icon name="chevron" size={18} />
				</a>
				{#if piece.gaps.includes('recording')}
					<!-- For pieces nobody ever recorded: say so once, and the list stops asking. -->
					<form method="POST" action="?/noRecording&filter={data.filter}" use:enhance={saving.submit()}>
						<input type="hidden" name="id" value={piece.id} />
						<button class="btn ghost small" disabled={saving.busy} title={t.details.noRecordingHint(piece.title)} aria-label={t.details.noRecordingHint(piece.title)}>
							{t.details.noRecording}
						</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="msg info">{t.details.none}</p>
{/if}

<style>
	.msg {
		margin-bottom: var(--space-4);
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.bar {
		flex: 1;
		max-width: 320px;
		height: 8px;
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.chip.active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.count {
		opacity: 0.75;
		font-variant-numeric: tabular-nums;
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
		overflow: hidden;
	}

	.list li {
		display: flex;
		align-items: center;
	}

	.list li + li {
		border-top: 1px solid var(--border);
	}

	.list form {
		flex: none;
		padding-right: var(--space-3);
	}

	.list a {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: var(--text);
	}

	.list a:hover {
		background: var(--surface-2);
	}

	.main {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.gaps {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-1);
	}

	.gap {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	/* On a phone the button goes under the piece, so the title keeps the width. */
	@media (max-width: 600px) {
		.list li {
			flex-wrap: wrap;
		}

		.list a {
			flex-basis: 100%;
		}

		.list form {
			margin-left: auto;
			padding: 0 var(--space-4) var(--space-3);
		}
	}
</style>

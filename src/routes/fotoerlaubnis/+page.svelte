<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();
	let copied = $state('');

	/** The names of one group, for the photographer or the person who posts the pictures. */
	async function copy(answer: string, names: string[]) {
		try {
			await navigator.clipboard.writeText(names.join('\n'));
			copied = answer;
		} catch {
			copied = '';
		}
	}
</script>

<Title title={t.photos.overview.title} />
<PageHeader title={t.photos.overview.title} lead={t.photos.overview.lead} />

{#each data.groups as group (group.answer)}
	<section class="block">
		<div class="head">
			<h2 class="ui-label">{t.photos.overview.answers[group.answer]} · {t.photos.overview.count(group.players.length)}</h2>
			{#if group.answer !== 'yes' && group.players.length}
				<button class="btn ghost small" type="button" onclick={() => copy(group.answer, group.players.map((player) => player.name))}>
					<Icon name={copied === group.answer ? 'check' : 'share'} size={14} />{copied === group.answer ? t.photos.overview.copied : t.photos.overview.copy}
				</button>
			{/if}
		</div>
		{#if group.players.length}
			<ul class="ui-list">
				{#each group.players as player, i (i)}
					<li class="row" class:no={group.answer === 'no'}>
						<span>{player.name}</span>
						{#if player.byParent}<span class="muted">{t.photos.overview.byParent}</span>{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{t.photos.overview.empty}</p>
		{/if}
	</section>
{/each}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.head h2 {
		margin: 0;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
	}

	.row.no span:first-child {
		font-weight: 600;
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>

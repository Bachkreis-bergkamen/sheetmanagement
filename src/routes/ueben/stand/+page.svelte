<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import DrillOverview from '#lib/components/DrillOverview.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();
	const tx = t.drills.leaders;
</script>

<Title title={tx.title} />
<PageHeader title={tx.title} lead={tx.lead} />

{#if data.members.length}
	<div class="grid">
		{#each data.members as member (member.email)}
			<DrillOverview name={member.name} detail={member.instrument} overview={member.overview} />
		{/each}
	</div>
{:else}
	<p class="msg info">{tx.none}</p>
{/if}
<p class="hint">{tx.privacy}</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
		gap: var(--space-3);
	}

	.hint {
		margin-top: var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>

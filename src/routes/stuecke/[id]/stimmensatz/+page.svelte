<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import PartSetBuilder from '#lib/components/PartSetBuilder.svelte';

	let { data } = $props();
</script>

<PartSetBuilder {data}>
	{#if data.orchestras.length > 1}
		<!-- A plain GET form: the copies follow whoever plays in the chosen orchestra. -->
		<form class="orchestra" method="get">
			<label for="orchester">{t.partSet.orchestra}</label>
			<select id="orchester" name="orchester" value={data.orchestra} onchange={(event) => event.currentTarget.form?.requestSubmit()}>
				<option value="">{t.partSet.allOrchestras}</option>
				{#each data.orchestras as name (name)}<option value={name}>{name}</option>{/each}
			</select>
			<noscript><button class="btn ghost">{t.partSet.apply}</button></noscript>
		</form>
	{/if}
</PartSetBuilder>

<style>
	.orchestra {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	select {
		min-height: var(--tap);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
</style>

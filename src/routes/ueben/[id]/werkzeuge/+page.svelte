<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import PracticeTools from '#lib/components/PracticeTools.svelte';
	import Title from '#lib/components/Title.svelte';

	/** The practice tools in a window of their own (#410); the root layout leaves out its bars here. */
	let { data } = $props();
</script>

<Title title={t.practice.viewer.windowTitle(data.piece)} />

<div class="window">
	<header>
		<strong>{data.part}</strong>
		<span>{data.piece}</span>
	</header>
	{#if data.recording}
		<section class="panel"><PracticeTools tool="recording" recording={data.recording} /></section>
	{/if}
	<section class="panel"><PracticeTools tool="tools" /></section>
	<p class="hint">{t.practice.viewer.windowHint}</p>
</div>

<style>
	.window {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
	}

	header {
		display: grid;
	}

	header span,
	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		margin: 0;
		font-size: var(--text-xs);
	}

	.panel {
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
	}
</style>

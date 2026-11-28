<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';
	import Metronome from './Metronome.svelte';
	import Tuner from './Tuner.svelte';

	/**
	 * A tool of the practice viewer: the piece's recording, or metronome, tuner and drone with a
	 * tab each (all keep running while another is shown). Beside the page (PracticeScore) or in
	 * a window of its own, e.g. on a second screen (/ueben/[id]/werkzeuge).
	 */
	let { tool, recording = null }: { tool: 'recording' | 'tools'; recording?: { url: string; youtube?: string | null } | null } = $props();

	let playing = $state(false);
	type Tab = 'metronome' | 'tuner' | 'drone';
	let tab = $state<Tab>('metronome');
	const TABS: Tab[] = ['metronome', 'tuner', 'drone'];
</script>

{#if tool === 'recording' && recording}
	<section class="recording" aria-label={t.practice.recording.title}>
		{#if recording.youtube && playing}
			<div class="video">
				<iframe
					src="https://www.youtube-nocookie.com/embed/{recording.youtube}?autoplay=1&rel=0"
					title={t.practice.recording.title}
					allow="autoplay; encrypted-media; picture-in-picture"
					allowfullscreen
				></iframe>
			</div>
		{:else if recording.youtube}
			<button type="button" class="btn" onclick={() => (playing = true)}><Icon name="music" size={16} />{t.practice.recording.play}</button>
			<p class="muted">{t.practice.recording.hint}</p>
		{/if}
		<a class="external" href={recording.url} target="_blank" rel="noopener noreferrer nofollow"><Icon name="external" size={14} />{t.practice.recording.open}</a>
	</section>
{:else if tool === 'tools'}
	<div class="tabs" role="group" aria-label={t.practice.viewer.tools}>
		{#each TABS as each (each)}
			<button type="button" class:on={tab === each} aria-pressed={tab === each} onclick={() => (tab = each)}>{t.practice[each].title}</button>
		{/each}
	</div>
	<div hidden={tab !== 'metronome'}><Metronome /></div>
	<div hidden={tab === 'metronome'}><Tuner show={tab === 'drone' ? 'drone' : 'tuner'} /></div>
{/if}

<style>
	/* Three short words, wrapping in a very narrow panel. */
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		margin: 0 0 var(--space-3);
		padding: 3px;
		border-radius: var(--radius-control);
		background: color-mix(in oklab, var(--text) 6%, transparent);
	}

	.tabs button {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 32px;
		padding: 0 var(--space-1);
		border: 0;
		border-radius: calc(var(--radius-control) - 2px);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.tabs button.on {
		background: var(--surface);
		box-shadow: var(--shadow);
		color: var(--text);
		font-weight: 600;
	}

	[hidden] {
		display: none;
	}

	.recording {
		display: grid;
		gap: var(--space-2);
		padding-right: var(--space-5);
	}

	.video {
		position: relative;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: var(--radius-s);
		background: var(--brand-ink);
	}

	.video iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.external {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>

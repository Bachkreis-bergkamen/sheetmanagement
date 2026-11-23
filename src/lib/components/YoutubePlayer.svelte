<script lang="ts">
	import { clockText, embedUrl, watchUrl } from '#lib/album/album.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';

	/**
	 * A recording (#408) that loads nothing from YouTube until it's played: then
	 * youtube-nocookie, which sets no cookies before the video runs. Changing `start` while it
	 * plays jumps there.
	 */
	let { youtube, start, title }: { youtube: string; start?: number; title: string } = $props();
	let playing = $state(false);
</script>

<div class="player">
	{#if playing}
		<div class="frame">
			<iframe src={embedUrl(youtube, start)} {title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
		</div>
	{:else}
		<button type="button" class="poster" onclick={() => (playing = true)}>
			<span class="play"><Icon name="music" size={22} /></span>
			<span class="label">{t.album.video.play}{start ? ` · ${t.album.video.at(clockText(start))}` : ''}</span>
			<span class="hint">{t.album.video.playHint}</span>
		</button>
	{/if}
	<a class="open" href={watchUrl(youtube, start)} target="_blank" rel="noopener noreferrer nofollow"><Icon name="external" size={14} />{t.album.video.open}</a>
</div>

<style>
	.player {
		display: grid;
		gap: var(--space-1);
	}

	.frame,
	.poster {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: var(--radius-control);
		background: #111;
	}

	iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}

	.poster {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 0;
		background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 70%, #000), #111);
		color: #fff;
		font: inherit;
		cursor: pointer;
	}

	.play {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.18);
		transition: transform var(--fast) var(--ease);
	}

	.poster:hover .play {
		transform: scale(1.06);
	}

	.label {
		font-weight: 600;
	}

	.hint {
		max-width: 36ch;
		opacity: 0.75;
		font-size: var(--text-sm);
		text-align: center;
	}

	.open {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		width: fit-content;
		font-size: var(--text-sm);
	}
</style>

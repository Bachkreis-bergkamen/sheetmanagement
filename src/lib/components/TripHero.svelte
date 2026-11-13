<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, untrack } from 'svelte';
	import { t } from '#lib/i18n/index.ts';

	/**
	 * A trip's header (#334): a photo of each place, one after another, with the trip's name on
	 * it. The photos come from Wikimedia Commons through the app (/fahrten/[id]/bild?nr=…), each
	 * credited. They change every few seconds, not while pointed at or with reduced motion; the
	 * dots pick one. With a place in focus below (its number among the pictures), its picture shows
	 * and stays.
	 */
	let {
		tripId,
		pictures,
		focus = null,
		children
	}: {
		tripId: string;
		pictures: { place: string; title: string; artist?: string; license?: string; page: string; tall: boolean }[];
		focus?: number | null;
		children: Snippet;
	} = $props();

	const EVERY_MS = 7000;
	let shown = $state(0);
	// Only the pictures shown so far and the next one load, not all at once.
	let loaded = $state(new Set([0, 1]));
	let resting = $state(false);
	const current = $derived(pictures[shown] ?? pictures[0]);

	function show(i: number) {
		shown = (i + pictures.length) % pictures.length;
		loaded = new Set([...loaded, shown, (shown + 1) % pictures.length]);
	}

	// Follows the focus only: what show() reads and writes mustn't run this again.
	$effect(() => {
		const to = focus;
		if (to !== null && to >= 0 && to < pictures.length) untrack(() => show(to));
	});

	onMount(() => {
		if (pictures.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const timer = setInterval(() => {
			if (!resting && focus === null && document.visibilityState === 'visible') show(shown + 1);
		}, EVERY_MS);
		return () => clearInterval(timer);
	});
</script>

<figure class="hero" onpointerenter={() => (resting = true)} onpointerleave={() => (resting = false)} onfocusin={() => (resting = true)} onfocusout={() => (resting = false)}>
	{#each pictures as picture, i (picture.page)}
		{#if loaded.has(i)}
			<img src="/fahrten/{tripId}/bild{i ? `?nr=${i}` : ''}" alt={t.trips.picture.alt(picture.title)} class:tall={picture.tall} class:on={i === shown} aria-hidden={i !== shown} />
		{/if}
	{/each}
	<div class="overlay">
		{@render children()}
		{#if pictures.length > 1}
			<div class="dots" role="group" aria-label={t.trips.picture.pictures}>
				{#each pictures as picture, i (picture.page)}
					<button type="button" class:on={i === shown} aria-pressed={i === shown} aria-label={t.trips.picture.show(i + 1, picture.place)} title={picture.place} onclick={() => show(i)}></button>
				{/each}
			</div>
		{/if}
	</div>
	<figcaption>
		<a href={current.page} target="_blank" rel="noopener noreferrer">{current.title} · {t.trips.picture.credit(current.artist, current.license)}</a>
	</figcaption>
</figure>

<style>
	.hero {
		position: relative;
		margin: 0 0 var(--space-2);
		overflow: hidden;
		border-radius: var(--radius-l);
		background: var(--surface-2);
		/* A definite width, or the minimum height would widen it past the page through its ratio. */
		width: 100%;
		aspect-ratio: 16 / 7;
		min-height: 220px;
	}

	/* On a phone the picture gets more height, so the name on it has room. */
	@media (max-width: 560px) {
		.hero {
			aspect-ratio: 4 / 3;
		}
	}

	/* The pictures lie on each other and fade from one to the next. */
	img {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		transform: scale(1.04);
		transition:
			opacity 1.2s var(--ease),
			transform 8s linear;
	}

	img.on {
		opacity: 1;
		transform: scale(1);
	}

	/* A tower or dome: its upper part, not the middle of its walls. */
	img.tall {
		object-position: center 25%;
	}

	@media (prefers-reduced-motion: reduce) {
		img {
			transform: none;
			transition: none;
		}
	}

	/* The trip's name on the photo, on a shade that keeps it readable on any picture. */
	.overlay {
		position: absolute;
		inset: auto 0 0;
		display: grid;
		gap: var(--space-1);
		padding: var(--space-6) var(--space-4) var(--space-5);
		background: linear-gradient(to top, rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.35) 60%, transparent);
		color: #fff;
	}

	.overlay :global(h1) {
		color: #fff;
		overflow-wrap: break-word;
		text-shadow: 0 1px 12px rgb(0 0 0 / 0.35);
	}

	.dots {
		position: absolute;
		right: var(--space-4);
		bottom: var(--space-4);
		display: flex;
		gap: var(--space-1);
	}

	/* A small dot, in a target large enough for a finger. */
	.dots button {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.dots button::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.5);
		box-shadow: 0 0 4px rgb(0 0 0 / 0.4);
		transition:
			background var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	.dots button.on::before {
		background: #fff;
		transform: scale(1.3);
	}

	.dots button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
		border-radius: 50%;
	}

	figcaption {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		max-width: calc(100% - 2 * var(--space-2));
		padding: 2px var(--space-2);
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: rgb(0 0 0 / 0.45);
		font-size: var(--text-2xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	figcaption a {
		color: #fff;
	}
</style>

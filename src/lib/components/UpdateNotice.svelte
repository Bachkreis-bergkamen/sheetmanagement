<script lang="ts">
	import { updated } from '$app/state';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';

	/**
	 * A new version after a deploy (#140), taken in quietly: deploys come several times a day,
	 * and a notice each time got in the way. SvelteKit notices a new version (it asks every
	 * few minutes, and on coming back to the tab); the new service worker takes over in the
	 * background, and the next link opens as a full page load of the new version. Nothing
	 * reloads by itself, so nothing typed is lost. Only a page left open for long, like the
	 * parts on a music stand, gets the notice "Neue Version verfügbar · Neu laden".
	 */
	const PATIENCE_MS = 60 * 60 * 1000;
	let overdue = $state(false);
	let reloading = $state(false);

	$effect(() => {
		if (!('serviceWorker' in navigator)) return;
		let registration: ServiceWorkerRegistration | undefined;
		// Pages always come fresh from the network, so a waiting worker only holds old app files:
		// it takes over at once. Pages already open keep working, their files then come from the network.
		const activate = (worker: ServiceWorker) => worker.postMessage('skip-waiting');
		const watch = (worker: ServiceWorker | null) => {
			worker?.addEventListener('statechange', () => {
				if (worker.state === 'installed' && navigator.serviceWorker.controller) activate(worker);
			});
		};
		const onfound = () => watch(registration?.installing ?? null);
		navigator.serviceWorker.getRegistration().then((found) => {
			registration = found;
			if (!found) return;
			if (found.waiting && navigator.serviceWorker.controller) activate(found.waiting);
			watch(found.installing);
			found.addEventListener('updatefound', onfound);
		});
		return () => registration?.removeEventListener('updatefound', onfound);
	});

	// A new version on the server means a new service worker too: look for it.
	$effect(() => {
		if (updated.current && 'serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((found) => found?.update());
	});

	// Links open as full page loads from now on (SvelteKit reads the attribute up to <body>).
	$effect(() => {
		if (!updated.current) return;
		document.body.dataset.sveltekitReload = '';
		const timer = setTimeout(() => (overdue = true), PATIENCE_MS);
		return () => clearTimeout(timer);
	});

	function reload() {
		reloading = true;
		location.reload();
	}
</script>

{#if overdue}
	<div class="update no-print" role="status">
		<Icon name="sparkle" size={16} />
		<span>{t.pwa.newVersion}</span>
		<button type="button" onclick={reload} disabled={reloading}>{t.pwa.reload}</button>
	</div>
{/if}

<style>
	.update {
		position: fixed;
		left: 50%;
		bottom: var(--space-5);
		z-index: 55;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		max-width: calc(100vw - 2 * var(--space-4));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--text);
		color: var(--bg);
		box-shadow: var(--shadow-raised);
		font-size: var(--text-sm);
		transform: translateX(-50%);
		animation: rise 0.3s var(--ease);
	}

	span {
		white-space: nowrap;
	}

	button {
		height: 32px;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--brand);
		color: var(--brand-ink);
		font: inherit;
		font-weight: 650;
		white-space: nowrap;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
	}

	/* Above the bottom navigation on phones. */
	@media (max-width: 720px) {
		.update {
			bottom: calc(var(--tabbar-height) + var(--dock-height, 0px) + env(safe-area-inset-bottom) + var(--space-3));
		}
	}
</style>

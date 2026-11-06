<script lang="ts">
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { t } from '#lib/i18n/index.ts';
	import { dismissal, hintDue, INSTALL_HINT_KEY } from '#lib/install/install.ts';
	import { install, promptInstall } from '#lib/install/state.svelte.ts';
	import { tour } from '#lib/tour/state.svelte.ts';
	import Icon from './Icon.svelte';

	/**
	 * The start page's offer to put the app on the home screen (#279): on phones only, never once
	 * it's installed, never while the tour is on screen. "Später" asks again in a month, "Nicht
	 * mehr fragen" never; the profile keeps the way to the guide either way.
	 */
	let { name, logo }: { name: string; logo: string } = $props();

	let stored = $state<string | null>('never');
	$effect(() => {
		try {
			stored = localStorage.getItem(INSTALL_HINT_KEY);
		} catch {
			// Without storage it can't remember "Später", so it doesn't ask at all.
		}
	});

	const phone = $derived(install.device?.platform === 'ios' || install.device?.platform === 'android');
	const shown = $derived(phone && !install.installed && !tour.showing && hintDue(stored, Date.now()));

	function dismiss(kind: 'later' | 'never') {
		stored = dismissal(kind, Date.now());
		try {
			localStorage.setItem(INSTALL_HINT_KEY, stored);
		} catch {
			// Then only for this visit.
		}
	}

	async function start() {
		// The browser's own dialog where it has one; the guide everywhere else.
		if ((await promptInstall()) === 'unavailable') goto('/install');
	}
</script>

{#if shown}
	<aside class="ui-card hint no-print" aria-labelledby="install-hint" transition:slide={{ duration: 220 }}>
		<span class="app-icon" aria-hidden="true"><img src={logo} alt="" width="30" height="30" /></span>
		<div class="text">
			<h2 id="install-hint">{t.install.hint.title(name)}</h2>
			<p>{t.install.hint.body}</p>
		</div>
		<div class="actions">
			<button class="btn small" onclick={start}><Icon name="download" size={14} />{t.install.hint.install}</button>
			<button class="btn small ghost" onclick={() => dismiss('later')}>{t.install.hint.later}</button>
			<button class="link" onclick={() => dismiss('never')}>{t.install.hint.never}</button>
		</div>
	</aside>
{/if}

<style>
	.hint {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.app-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.text {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 650;
	}

	p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.actions {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.link {
		min-height: 32px;
		padding: 0 var(--space-1);
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.link:hover {
		color: var(--text);
	}
</style>

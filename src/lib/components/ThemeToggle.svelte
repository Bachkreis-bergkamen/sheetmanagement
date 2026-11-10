<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import Segmented from './Segmented.svelte';

	/** System, light or dark as one segmented control; shown in the menu and on the profile. */
	type Theme = 'system' | 'light' | 'dark';
	const options = [
		{ value: 'system' as const, label: t.theme.system, icon: 'monitor' as const },
		{ value: 'light' as const, label: t.theme.light, icon: 'sun' as const },
		{ value: 'dark' as const, label: t.theme.dark, icon: 'moon' as const }
	];

	/** Fills its row, e.g. in the menu, instead of sizing to its labels. */
	let { wide = false }: { wide?: boolean } = $props();

	let theme = $state<Theme>('system');

	onMount(() => {
		const current = document.documentElement.dataset.theme;
		if (current === 'light' || current === 'dark') theme = current;
	});

	function set(next: Theme) {
		const root = document.documentElement;
		if (next === 'system') delete root.dataset.theme;
		else root.dataset.theme = next;
	}

	/**
	 * The whole page cross-fades into the new colour scheme (#129), with View Transitions or,
	 * without them, by fading the colours; with reduced motion it simply changes.
	 */
	function apply(next: Theme) {
		const root = document.documentElement;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) set(next);
		else if (document.startViewTransition) {
			root.classList.add('theme-switch');
			const transition = document.startViewTransition(() => set(next));
			// An aborted transition (tab hidden meanwhile) rejects `ready`; the theme is set regardless.
			transition.ready.catch(() => {});
			transition.finished.catch(() => {}).finally(() => root.classList.remove('theme-switch'));
		} else {
			root.classList.add('theme-fade');
			set(next);
			setTimeout(() => root.classList.remove('theme-fade'), 400);
		}
		try {
			if (next === 'system') localStorage.removeItem('theme');
			else localStorage.setItem('theme', next);
		} catch {
			// Storage can be blocked; the choice then lasts for this visit only.
		}
	}
</script>

<div class="theme" class:wide>
	<Segmented {options} bind:value={theme} label={t.theme.label} onchange={apply} />
</div>

<style>
	.theme {
		display: contents;
	}

	.theme.wide {
		display: grid;
		width: 100%;
	}

	.wide :global(.segmented) {
		display: grid;
	}
</style>

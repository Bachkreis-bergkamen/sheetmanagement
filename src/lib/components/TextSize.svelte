<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import Segmented from './Segmented.svelte';

	/**
	 * Small, normal or large text, for this device; shown in the menu and on the profile. Every
	 * size in the app is in rem, so the whole page grows or shrinks with it, the layout included.
	 */
	type Size = 'small' | 'normal' | 'large';
	const options = [
		{ value: 'small' as const, label: t.textSize.small },
		{ value: 'normal' as const, label: t.textSize.normal },
		{ value: 'large' as const, label: t.textSize.large }
	];

	/** Fills its row, e.g. in the menu, instead of sizing to its labels. */
	let { wide = false }: { wide?: boolean } = $props();

	let size = $state<Size>('normal');

	onMount(() => {
		const current = document.documentElement.dataset.textSize;
		if (current === 'small' || current === 'large') size = current;
	});

	function apply(next: Size) {
		const root = document.documentElement;
		if (next === 'normal') delete root.dataset.textSize;
		else root.dataset.textSize = next;
		try {
			if (next === 'normal') localStorage.removeItem('text-size');
			else localStorage.setItem('text-size', next);
		} catch {
			// Storage can be blocked; the choice then lasts for this visit only.
		}
	}
</script>

<div class="text-size" class:wide>
	<Segmented {options} bind:value={size} label={t.textSize.label} onchange={apply} />
</div>

<style>
	.text-size {
		display: contents;
	}

	.text-size.wide {
		display: grid;
		width: 100%;
	}

	.wide :global(.segmented) {
		display: grid;
	}
</style>

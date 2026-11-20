<script lang="ts">
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import * as t from '#lib/i18n/texts.ts';

	/**
	 * An instrument dropdown with the usual orchestra instruments; the rest are behind
	 * "Mehr Instrumente …". The current value is always offered, even if it's a rare one.
	 */
	let {
		name,
		value = $bindable(''),
		groups,
		common,
		required = false,
		empty = '…',
		label
	}: {
		name: string;
		value?: string;
		/** The instruments to offer, in order; a group with a label becomes an optgroup. */
		groups: { label?: string; names: string[] }[];
		common: string[];
		required?: boolean;
		/** Text of the empty choice; null for none. */
		empty?: string | null;
		label?: string;
	} = $props();

	/** Not an instrument name: opens the full list. */
	const MORE = '__mehr';
	let all = $state(false);
	let select = $state<HTMLSelectElement>();
	/** The last real choice, kept when "Mehr" is picked. */
	// svelte-ignore state_referenced_locally
	let chosen = value;

	const shown = (names: string[]) => (all ? names : names.filter((n) => common.includes(n) || n === value));
	const hidden = $derived(!all && groups.some((group) => group.names.some((n) => !common.includes(n) && n !== value)));

	function change() {
		if (value !== MORE) {
			chosen = value;
			return;
		}
		all = true;
		value = chosen;
		// Opens the list again, now with every instrument (where the browser allows it).
		requestAnimationFrame(() => {
			try {
				select?.showPicker();
			} catch {
				select?.focus();
			}
		});
	}
</script>

<select {name} bind:value bind:this={select} onchange={change} {required} aria-label={label}>
	{#if empty !== null}<option value="" disabled={required}>{empty}</option>{/if}
	{#each groups as group, i (i)}
		{#if group.label}
			{#if shown(group.names).length}
				<optgroup label={group.label}>
					{#each shown(group.names) as instrument (instrument)}<option value={instrument}>{instrumentLabel(instrument)}</option>{/each}
				</optgroup>
			{/if}
		{:else}
			{#each shown(group.names) as instrument (instrument)}<option value={instrument}>{instrumentLabel(instrument)}</option>{/each}
		{/if}
	{/each}
	{#if hidden}<option value={MORE}>{t.instruments.more}</option>{/if}
</select>

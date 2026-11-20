<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';

	/**
	 * The location of a new date, with suggestions while typing: places already used, then
	 * addresses from OpenStreetMap (/api/orte). A full address gives the concert's map link.
	 */
	let { name, value = '', placeholder }: { name: string; value?: string; placeholder?: string } = $props();

	// svelte-ignore state_referenced_locally
	let text = $state(value);
	let places = $state<string[]>([]);
	let open = $state(false);
	let active = $state(-1);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let asked = 0;
	const id = `place-${Math.random().toString(36).slice(2, 8)}`;

	// A reset form (after saving) or a refused one brings its own value.
	$effect(() => {
		text = value;
	});

	function typed() {
		clearTimeout(timer);
		const query = text.trim();
		if (query.length < 2) {
			places = [];
			return;
		}
		timer = setTimeout(async () => {
			const ask = ++asked;
			try {
				const response = await fetch(`/api/orte?q=${encodeURIComponent(query)}`);
				const body = response.ok ? ((await response.json()) as { places: string[] }) : { places: [] };
				// Only the answer to what's typed now counts.
				if (ask !== asked) return;
				places = body.places.filter((place) => place !== text);
				active = -1;
				open = places.length > 0;
			} catch {
				// Without suggestions the field still takes what's typed.
			}
		}, 250);
	}

	function choose(place: string) {
		text = place;
		places = [];
		open = false;
	}

	function keydown(event: KeyboardEvent) {
		if (!open || !places.length) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + places.length) % places.length;
		} else if (event.key === 'Enter' && active >= 0) {
			event.preventDefault();
			choose(places[active]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			open = false;
		}
	}
</script>

<div class="place">
	<input
		{name}
		bind:value={text}
		maxlength="200"
		{placeholder}
		autocomplete="off"
		role="combobox"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-autocomplete="list"
		aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
		oninput={typed}
		onkeydown={keydown}
		onfocus={() => (open = places.length > 0)}
		onblur={() => (open = false)}
	/>
	{#if open}
		<ul class="list" id="{id}-list" role="listbox" aria-label={t.calendar.add.places}>
			{#each places as place, i (place)}
				<!-- The keyboard stays in the field (arrows and Enter); mousedown keeps the focus there too. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{id}-{i}"
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => choose(place)}
					onpointermove={() => (active = i)}
				>
					<Icon name="pin" size={16} /><span>{place}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.place {
		position: relative;
	}

	.place input {
		width: 100%;
	}

	.list {
		position: absolute;
		inset: calc(100% + 4px) 0 auto;
		z-index: 20;
		margin: 0;
		padding: var(--space-1);
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow-2, 0 8px 24px rgb(0 0 0 / 0.12));
	}

	.list li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-s);
		font-size: var(--text-md);
		cursor: pointer;
	}

	.list li :global(svg) {
		flex: none;
		color: var(--text-muted);
	}

	.list li.active {
		background: var(--surface-2);
	}
</style>

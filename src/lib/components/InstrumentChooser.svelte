<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { config } from '#lib/config/index.ts';
	import type { InstrumentFamily } from '#lib/config/types.ts';
	import { t } from '#lib/i18n/index.ts';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import Icon from './Icon.svelte';
	import InstrumentGlyph from './InstrumentGlyph.svelte';
	import InstrumentSelect from './InstrumentSelect.svelte';

	/**
	 * One instrument, picked from a grid of little drawings with a search field: the usual ones
	 * first, then every instrument by family. Sends the name as `name`, like a select. Until the page runs
	 * JavaScript it's the plain dropdown, so the form also works without.
	 */
	let {
		name,
		value = $bindable(''),
		instruments,
		common,
		required = false,
		label,
		labelledby
	}: {
		name: string;
		value?: string;
		instruments: string[];
		common: string[];
		required?: boolean;
		label: string;
		/** Id of the text naming the field. */
		labelledby: string;
	} = $props();

	let ready = $state(false);
	let open = $state(false);
	let query = $state('');
	let root = $state<HTMLDivElement>();
	let trigger = $state<HTMLButtonElement>();
	let search = $state<HTMLInputElement>();
	let invalid = $state(false);
	const panelId = $derived(`${labelledby}-panel`);

	onMount(() => (ready = true));

	const info = $derived(new Map(config.instruments.map((instrument) => [instrument.name, instrument])));
	const family = (n: string): InstrumentFamily => info.get(n)?.family ?? 'sonstige';
	const familyLabel = (f: InstrumentFamily) => (f === 'partitur' ? t.piece.groups.featured : t.piece.groups[f]);

	/** Lower case without accents, so "flote" finds "Flöte". */
	const fold = (text: string) =>
		text
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{M}/gu, '');
	const words = (n: string) => [instrumentLabel(n), n, ...(info.get(n)?.aliases ?? []), ...(info.get(n)?.variants ?? [])].map(fold);

	const sections = $derived.by(() => {
		const q = fold(query.trim());
		if (q) {
			const hits = instruments.filter((n) => words(n).some((word) => word.includes(q)));
			// Names that start with the search come first: "horn" → Horn before Englischhorn.
			const starts = (n: string) => words(n).some((word) => word.startsWith(q));
			return [{ label: '', names: [...hits.filter(starts), ...hits.filter((n) => !starts(n))] }];
		}
		const usual = instruments.filter((n) => common.includes(n));
		const families: { label: string; names: string[] }[] = [];
		// Each family lists all its instruments, the usual ones too: nobody has to know which those are.
		for (const n of instruments) {
			const heading = familyLabel(family(n));
			const section = families.find((s) => s.label === heading);
			if (section) section.names.push(n);
			else families.push({ label: heading, names: [n] });
		}
		return [{ label: t.instruments.common, names: usual }, ...families].filter((s) => s.names.length);
	});

	async function show() {
		open = true;
		query = '';
		await tick();
		// Fine pointers get the search field; on a phone the keyboard would hide the grid.
		if (matchMedia('(pointer: fine)').matches) search?.focus();
		else (root?.querySelector<HTMLElement>('.tile[aria-pressed="true"]') ?? root?.querySelector<HTMLElement>('.panel'))?.focus();
	}

	function close(refocus = true) {
		open = false;
		if (refocus) trigger?.focus();
	}

	function pick(n: string) {
		value = n;
		invalid = false;
		close();
	}

	const tiles = () => [...(root?.querySelectorAll<HTMLButtonElement>('.tile') ?? [])];

	/** Arrow keys walk the grid: sideways in reading order, up and down to the nearest tile. */
	function move(event: KeyboardEvent) {
		const all = tiles();
		const here = event.target as HTMLElement;
		if (here === search) {
			if (event.key === 'ArrowDown') all[0]?.focus();
			else if (event.key === 'Enter' && all[0]) pick(all[0].dataset.name ?? '');
			else return;
			event.preventDefault();
			return;
		}
		const i = all.indexOf(here as HTMLButtonElement);
		if (i < 0) return;
		let next: HTMLElement | undefined;
		if (event.key === 'ArrowRight') next = all[i + 1];
		else if (event.key === 'ArrowLeft') next = all[i - 1];
		else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			const box = here.getBoundingClientRect();
			const down = event.key === 'ArrowDown';
			const rows = all.filter((tile) => {
				const top = tile.getBoundingClientRect().top;
				return down ? top > box.top + 4 : top < box.top - 4;
			});
			const rowTop = rows.map((tile) => tile.getBoundingClientRect().top).sort((a, b) => (down ? a - b : b - a))[0];
			const row = rows.filter((tile) => Math.abs(tile.getBoundingClientRect().top - rowTop) < 4);
			next = row.sort((a, b) => Math.abs(a.getBoundingClientRect().left - box.left) - Math.abs(b.getBoundingClientRect().left - box.left))[0];
			if (!next && !down) next = search;
		} else return;
		event.preventDefault();
		next?.focus();
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else move(event);
	}

	// Closes when a click (the phone's backdrop too) or the focus goes elsewhere.
	function outside(event: PointerEvent) {
		const target = event.target as HTMLElement;
		if (open && !trigger?.contains(target) && !target.closest?.('.panel')) close(false);
	}
	function focusout(event: FocusEvent) {
		if (open && event.relatedTarget && !root?.contains(event.relatedTarget as Node)) close(false);
	}
</script>

<svelte:window onpointerdown={outside} />

{#if !ready}
	<InstrumentSelect {name} bind:value groups={[{ names: instruments }]} {common} {required} {label} />
{:else}
	<div class="chooser" bind:this={root} onfocusout={focusout}>
		<input type="hidden" {name} {value} />
		<!-- Only there for the browser's "please fill in" check, shown under the button. -->
		<input
			class="validity"
			tabindex="-1"
			aria-hidden="true"
			{required}
			{value}
			oninvalid={() => (invalid = true)}
		/>
		<button
			bind:this={trigger}
			type="button"
			class="trigger"
			class:invalid
			aria-haspopup="dialog"
			aria-expanded={open}
			aria-controls={panelId}
			aria-labelledby="{labelledby} {labelledby}-value"
			onclick={() => (open ? close() : show())}
		>
			{#if value}
				<span class="glyph"><InstrumentGlyph glyph={glyphOf(value)} size={24} /></span>
				<span id="{labelledby}-value" class="value">{instrumentLabel(value)}</span>
			{:else}
				<span id="{labelledby}-value" class="value placeholder">{t.instruments.choose}</span>
			{/if}
			<span class="caret" class:up={open}><Icon name="down" size={16} /></span>
		</button>

		{#if open}
			<div class="backdrop" aria-hidden="true"></div>
			<div id={panelId} class="panel" role="dialog" aria-labelledby={labelledby} tabindex="-1" onkeydown={keydown}>
				<label class="search">
					<Icon name="search" size={16} />
					<input bind:this={search} bind:value={query} type="search" placeholder={t.instruments.search} aria-label={t.instruments.search} autocomplete="off" />
				</label>
				<div class="scroll">
					{#each sections as section (section.label)}
						<section>
							{#if section.label}<p class="group" aria-hidden="true">{section.label}</p>{/if}
							<div class="grid" role="group" aria-label={section.label || undefined}>
								{#each section.names as n (n)}
									<button type="button" class="tile" data-name={n} aria-pressed={n === value} onclick={() => pick(n)}>
										<span class="plate"><InstrumentGlyph glyph={glyphOf(n)} size={34} /></span>
										<span>{instrumentLabel(n)}</span>
									</button>
								{/each}
							</div>
						</section>
					{:else}
						<p class="none">{t.instruments.none(query.trim())}</p>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.chooser {
		position: relative;
	}

	.validity {
		position: absolute;
		bottom: 0;
		left: var(--space-4);
		width: 1px;
		height: 1px;
		padding: 0;
		border: 0;
		opacity: 0;
		pointer-events: none;
	}

	.trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: 42px;
		padding: 6px var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: var(--text-md);
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition: border-color var(--fast) var(--ease);
	}

	.trigger:hover,
	.trigger[aria-expanded='true'] {
		border-color: color-mix(in oklab, var(--accent) 55%, var(--border));
	}

	.trigger:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.trigger.invalid {
		border-color: var(--danger);
	}

	.glyph {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-s);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.value {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.placeholder {
		color: var(--text-muted);
		font-weight: 400;
	}

	.caret {
		display: grid;
		color: var(--text-muted);
		transition: transform var(--fast) var(--ease);
	}

	.caret.up {
		transform: rotate(180deg);
	}

	.panel {
		position: absolute;
		z-index: 30;
		top: calc(100% + 6px);
		left: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: min(520px, calc(100vw - 2 * var(--space-4)));
		max-height: min(440px, 62vh);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
		color: var(--text);
		transform-origin: top left;
		animation: pop 0.16s var(--ease);
	}

	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.98);
		}
	}

	.backdrop {
		display: none;
	}

	/* On a phone the grid comes up from the bottom, over the tab bar, like a native sheet. */
	@media (max-width: 640px) {
		.backdrop {
			position: fixed;
			z-index: 90;
			inset: 0;
			display: block;
			background: var(--scrim);
			animation: fade 0.2s var(--ease);
		}

		.panel {
			position: fixed;
			z-index: 91;
			top: auto;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 78dvh;
			padding-bottom: env(safe-area-inset-bottom);
			border-width: 1px 0 0;
			border-radius: var(--radius-l) var(--radius-l) 0 0;
			animation: sheet 0.24s var(--ease);
		}

		.grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@keyframes sheet {
		from {
			transform: translateY(40%);
			opacity: 0.4;
		}
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-2);
		padding: 0 var(--space-3);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text-muted);
	}

	.search:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 0;
	}

	.search input {
		flex: 1;
		min-width: 0;
		padding: 10px 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-md);
	}

	.scroll {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 var(--space-2) var(--space-2);
	}

	.group {
		margin: var(--space-2) var(--space-2) var(--space-1);
		color: var(--text-muted);
		font-family: var(--font);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 2px;
	}

	.tile {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 6px;
		min-height: 88px;
		padding: var(--space-2) var(--space-1);
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1.2;
		text-align: center;
		cursor: pointer;
		transition:
			background var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	/* Each drawing sits on a soft round plate, like an app on a home screen. */
	.plate {
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: var(--bg);
		color: color-mix(in oklab, var(--text) 78%, transparent);
		transition:
			color var(--fast) var(--ease),
			background var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	.tile:hover,
	.tile:focus-visible {
		background: color-mix(in oklab, var(--bg) 60%, transparent);
		outline: 0;
	}

	.tile:hover .plate,
	.tile:focus-visible .plate {
		background: var(--accent-soft);
		color: var(--accent);
		transform: translateY(-1px) scale(1.06);
	}

	.tile:focus-visible {
		border-color: var(--accent);
	}

	.tile:active {
		transform: scale(0.97);
	}

	.tile[aria-pressed='true'] {
		border-color: color-mix(in oklab, var(--accent) 45%, transparent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 650;
	}

	.tile[aria-pressed='true'] .plate {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.none {
		margin: var(--space-4) var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}
</style>

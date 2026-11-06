<script lang="ts" generics="T">
	import { tick } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import { applyFilters, countWith, type FilterGroup } from '#lib/filters.ts';
	import Icon from './Icon.svelte';

	/**
	 * Filters for a list, several at once (#lib/filters.ts has the rules). A button says how many
	 * are on; it opens a panel (a sheet from the bottom on phones, below the button on wide
	 * screens) where each option says how many entries it would leave, before it's tapped.
	 * The list behind follows each tap.
	 */
	let {
		value = $bindable([]),
		items,
		groups,
		label,
		size = 'normal'
	}: {
		value: string[];
		/** The list as it is before these filters (after a search, say): what the counts count. */
		items: readonly T[];
		groups: FilterGroup<T>[];
		/** The panel's heading and the button's name for screen readers. */
		label: string;
		/** "large" stands beside a search field of the same height. */
		size?: 'normal' | 'large';
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let trigger = $state<HTMLButtonElement>();
	let spot = $state<{ top: number; right: number } | null>(null);
	let isOpen = $state(false);

	const total = $derived(applyFilters(items, groups, value).length);

	async function open() {
		if (!dialog || !trigger) return;
		// Wide screens: right under the button, its right edges in line. Phones: the sheet.
		const box = trigger.getBoundingClientRect();
		spot = innerWidth > 720 ? { top: box.bottom + 8, right: Math.max(16, document.documentElement.clientWidth - box.right) } : null;
		dialog.showModal();
		isOpen = true;
		await tick();
		dialog.querySelector<HTMLElement>('input:not([disabled])')?.focus();
	}

	function toggle(option: string, on: boolean) {
		value = on ? [...value, option] : value.filter((each) => each !== option);
	}
</script>

<button
	bind:this={trigger}
	class="trigger {size}"
	class:on={value.length > 0}
	aria-haspopup="dialog"
	aria-expanded={isOpen}
	aria-label={value.length ? t.filters.active(label, value.length) : label}
	onclick={open}
>
	<Icon name="sliders" size={16} />
	<span class="text">{t.filters.button}</span>
	{#if value.length}<span class="badge" aria-hidden="true">{value.length}</span>{/if}
</button>

<dialog
	bind:this={dialog}
	class="panel"
	class:anchored={!!spot}
	style:top={spot ? `${spot.top}px` : undefined}
	style:right={spot ? `${spot.right}px` : undefined}
	aria-labelledby="filter-title"
	onclose={() => (isOpen = false)}
	onclick={(event) => {
		// A tap on the dimmed backdrop (the dialog element itself) closes it.
		if (event.target === dialog) dialog?.close();
	}}
>
	<header>
		<h2 id="filter-title">{label}</h2>
		<button class="close" onclick={() => dialog?.close()} aria-label={t.filters.close}><Icon name="x" size={18} /></button>
	</header>

	<div class="groups">
		{#each groups as group (group.key)}
			<fieldset>
				<legend>{group.label}</legend>
				{#each group.options as option (option.value)}
					{@const checked = value.includes(option.value)}
					{@const n = countWith(items, groups, value, option.value)}
					<label class="option" class:none={!n && !checked}>
						<input type="checkbox" {checked} disabled={!n && !checked} onchange={(event) => toggle(option.value, event.currentTarget.checked)} />
						<span class="box" aria-hidden="true"><Icon name="check" size={14} /></span>
						<span class="name">{option.label}</span>
						<!-- What the list would hold with this one on: no surprises after tapping. -->
						<span class="count" aria-label={t.filters.would(n)}>{n}</span>
					</label>
				{/each}
			</fieldset>
		{/each}
	</div>

	<footer>
		<button class="reset" disabled={!value.length} onclick={() => (value = [])}>{t.filters.reset}</button>
		<button class="btn" onclick={() => dialog?.close()}>{t.filters.show(total)}</button>
	</footer>
</dialog>

<style>
	.trigger {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--space-2);
		height: 40px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition:
			background var(--fast) var(--ease),
			border-color var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.trigger.large {
		height: 46px;
		border-radius: var(--radius-m);
	}

	@media (pointer: coarse) {
		.trigger {
			height: var(--tap);
		}
	}

	.trigger:hover {
		border-color: color-mix(in oklab, var(--accent) 50%, var(--border));
	}

	.trigger > :global(svg) {
		color: var(--text-muted);
	}

	/* Filters on: tinted like the current tab, so a shortened list never looks like all of it. */
	.trigger.on {
		border-color: transparent;
		background: var(--accent-soft);
		color: var(--accent);
	}

	.trigger.on > :global(svg) {
		color: inherit;
	}

	.badge {
		display: grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: var(--text-2xs);
		font-variant-numeric: tabular-nums;
	}

	/* Narrow phones: the icon and the number carry it. */
	@media (max-width: 400px) {
		.text {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
	}

	/* ---------- The panel: a sheet from the bottom on phones ---------- */

	.panel {
		position: fixed;
		inset: auto 0 0;
		display: none;
		width: 100%;
		max-width: none;
		max-height: min(80dvh, 640px);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-l) var(--radius-l) 0 0;
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-raised);
	}

	.panel[open] {
		display: grid;
		grid-template-rows: auto 1fr auto;
		animation: sheet-in 0.25s var(--ease);
	}

	.panel::backdrop {
		background: var(--scrim);
	}

	@keyframes sheet-in {
		from {
			translate: 0 24px;
			opacity: 0;
		}
	}

	/* Wide screens: a card right under the button. */
	.panel.anchored {
		inset: auto;
		width: 360px;
		max-height: min(70dvh, 560px);
		border: 1px solid var(--border);
		border-radius: var(--radius-l);
	}

	.panel.anchored::backdrop {
		background: transparent;
	}

	@media (prefers-reduced-motion: reduce) {
		.panel[open] {
			animation: none;
		}
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.close {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		cursor: pointer;
	}

	.groups {
		display: grid;
		gap: var(--space-4);
		overflow-y: auto;
		padding: var(--space-2) var(--space-5) var(--space-4);
		overscroll-behavior: contain;
	}

	fieldset {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--space-1);
		padding: 0;
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.option {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--tap);
		margin: 0 calc(-1 * var(--space-2));
		padding: 0 var(--space-2);
		border-radius: var(--radius-control);
		cursor: pointer;
		transition: background var(--fast) var(--ease);
	}

	.option:hover {
		background: var(--surface-2);
	}

	.option input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.box {
		display: grid;
		flex: none;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 1.5px solid var(--border);
		border-radius: var(--radius-xs);
		color: transparent;
		transition:
			background var(--fast) var(--ease),
			border-color var(--fast) var(--ease);
	}

	.option input:checked + .box {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.option input:focus-visible + .box {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.name {
		flex: 1;
		min-width: 0;
	}

	.count {
		min-width: 28px;
		padding: 1px 8px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.option:has(input:checked) .count {
		background: var(--accent-soft);
		color: var(--accent);
	}

	/* Would leave nothing: still listed, so the choice is known, but not to be picked. */
	.option.none {
		color: var(--text-muted);
		cursor: default;
	}

	.option.none:hover {
		background: none;
	}

	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-5) calc(var(--space-4) + env(safe-area-inset-bottom));
		border-top: 1px solid var(--hairline);
	}

	.panel.anchored footer {
		padding-bottom: var(--space-4);
	}

	.reset {
		min-height: 36px;
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.reset:disabled {
		opacity: 0.5;
		cursor: default;
	}

	footer .btn {
		flex: 1;
		max-width: 220px;
	}
</style>

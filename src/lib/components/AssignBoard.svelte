<script lang="ts" module>
	import type { UnitWarning } from '#lib/trips/organising.ts';
	import { t as texts } from '#lib/i18n/index.ts';

	/** What's wrong with a place, in words. */
	export function warningText(warning: UnitWarning) {
		const w = texts.trips.organising.warnings;
		return warning.kind === 'full' ? w.full(warning.over) : warning.kind === 'wish' ? w.wish(warning.names) : w.young;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import type { BoardPerson } from '#lib/trips/organising.ts';
	import Icon, { type IconName } from './Icon.svelte';

	/**
	 * People into rooms, host families or vehicles (#334, step 3): a card per place with its people
	 * and warnings, and those without a place yet. Organisers drag a name onto a card; on a phone
	 * or with the keyboard the small menu at each name does the same.
	 */
	interface Unit {
		id: string;
		title: string;
		/** "4 Betten", "Bus · 50 Plätze". */
		sub?: string;
		icon: IconName;
		places?: number;
		people: BoardPerson[];
		warnings: string[];
		/** Lines under the people: a family's address, the pick-ups, the big instruments. */
		details?: string[];
	}

	let {
		units,
		unplaced,
		edits,
		hidden = {},
		search = '',
		tools
	}: {
		units: Unit[];
		unplaced: BoardPerson[];
		edits: boolean;
		/** More fields for the assign action, e.g. the way for vehicles. */
		hidden?: Record<string, string>;
		/** More of the page's address to keep after saving, e.g. "&weg=rueck". */
		search?: string;
		/** Editing or removing a place, at the foot of its card. */
		tools?: Snippet<[string]>;
	} = $props();

	const saving = new FormState();
	let form = $state<HTMLFormElement>();
	let email = $state('');
	let unit = $state('');
	/** The card a name is dragged over, '' for "no place yet". */
	let over = $state<string | null>(null);

	function move(who: string, where: string) {
		email = who;
		unit = where;
		// After Svelte wrote the values into the form.
		queueMicrotask(() => form?.requestSubmit());
	}

	const drop = (where: string) => (event: DragEvent) => {
		event.preventDefault();
		over = null;
		const who = event.dataTransfer?.getData('text/plain');
		if (who) move(who, where);
	};
	const dragOver = (where: string) => (event: DragEvent) => {
		if (!edits) return;
		event.preventDefault();
		over = where;
	};
</script>

{#if edits}
	<form method="POST" action="?/assign{search}" bind:this={form} use:enhance={saving.submit()} hidden>
		<input type="hidden" name="email" value={email} />
		<input type="hidden" name="unit" value={unit} />
		{#each Object.entries(hidden) as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
	</form>
{/if}

{#snippet chip(person: BoardPerson, current: string)}
	<li class="chip" class:young={person.young} draggable={edits} ondragstart={(event) => event.dataTransfer?.setData('text/plain', person.email)}>
		{#if edits}<span class="grip" aria-hidden="true"><Icon name="grip" size={14} /></span>{/if}
		<span class="name">{person.name}</span>
		{#if person.young}<span class="badge">{t.trips.organising.board.young}</span>{/if}
		{#if person.wish}
			<span class="wish" class:met={person.wishMet} title={person.wishMet ? `${t.trips.organising.board.wishMet}: ${person.wish}` : t.trips.organising.board.wish(person.wish)}>
				<Icon name={person.wishMet ? 'check' : 'bulb'} size={14} /><span class="sr-only">{person.wishMet ? t.trips.organising.board.wishMet : t.trips.organising.board.wish(person.wish)}</span>
			</span>
		{/if}
		{#if edits}
			<select class="move" aria-label={t.trips.organising.board.moveTo(person.name)} disabled={saving.busy} onchange={(event) => move(person.email, event.currentTarget.value)}>
				<option value="" selected={!current}>{t.trips.organising.board.nowhere}</option>
				{#each units as one (one.id)}<option value={one.id} selected={one.id === current}>{one.title}</option>{/each}
			</select>
		{/if}
	</li>
{/snippet}

<div class="board" class:busy={saving.busy}>
	<div class="ui-card pool" role="group" class:over={over === ''} ondragover={dragOver('')} ondragleave={() => (over = null)} ondrop={drop('')} aria-label={t.trips.organising.board.unplaced}>
		<header>
			<h2>{t.trips.organising.board.unplaced}</h2>
			<span class="count">{unplaced.length}</span>
		</header>
		{#if unplaced.length}
			<ul class="chips">{#each unplaced as person (person.email)}{@render chip(person, '')}{/each}</ul>
			{#if edits}<p class="hint">{t.trips.organising.board.dragHint}</p>{/if}
		{:else}
			<p class="muted">{t.trips.organising.board.allPlaced}</p>
		{/if}
	</div>

	<div class="units">
		{#each units as one (one.id)}
			{@const full = one.places !== undefined && one.people.length >= one.places}
			<div class="ui-card unit" role="group" aria-label={one.title} class:warn={one.warnings.length} class:over={over === one.id} ondragover={dragOver(one.id)} ondragleave={() => (over = null)} ondrop={drop(one.id)}>
				<header>
					<span class="tile" aria-hidden="true"><Icon name={one.icon} size={18} /></span>
					<span class="head">
						<h3>{one.title}</h3>
						{#if one.sub}<span class="muted">{one.sub}</span>{/if}
					</span>
					<span class="count" class:full>{t.trips.organising.board.places(one.people.length, one.places)}</span>
				</header>
				{#if one.places}
					<span class="seats" aria-hidden="true">
						{#each Array.from({ length: Math.min(one.places, 60) }, (_, i) => i) as i (i)}<span class:taken={i < one.people.length}></span>{/each}
					</span>
				{/if}
				{#if one.people.length}
					<ul class="chips">{#each one.people as person (person.email)}{@render chip(person, one.id)}{/each}</ul>
				{:else}
					<p class="muted empty">{t.trips.organising.board.empty}</p>
				{/if}
				{#each one.warnings as warning (warning)}<p class="warning"><Icon name="alert" size={14} />{warning}</p>{/each}
				{#each one.details ?? [] as detail (detail)}<p class="detail">{detail}</p>{/each}
				{#if tools}{@render tools(one.id)}{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.board {
		display: grid;
		grid-template-columns: minmax(220px, 280px) 1fr;
		align-items: start;
		gap: var(--space-4);
		transition: opacity var(--fast) var(--ease);
	}

	.board.busy {
		opacity: 0.7;
	}

	/* Those without a place stay in view while the list of places scrolls. */
	.pool {
		position: sticky;
		top: var(--space-4);
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.units {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-3);
	}

	.unit {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		padding: var(--space-4);
		transition:
			border-color var(--fast) var(--ease),
			background var(--fast) var(--ease);
	}

	.unit.warn {
		border-color: color-mix(in oklab, var(--warn) 45%, transparent);
	}

	.over {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 6%, var(--surface));
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	h2 {
		flex: 1;
		font-size: var(--text-md);
	}

	.head {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	h3 {
		overflow: hidden;
		font-size: var(--text-md);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.head .muted {
		font-size: var(--text-sm);
	}

	.tile {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.count {
		flex: none;
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		font-weight: 650;
	}

	.count.full {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.warn .count.full {
		background: color-mix(in oklab, var(--warn) 15%, transparent);
		color: var(--warn);
	}

	/* The beds or seats as little blocks, filled as people come in. */
	.seats {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}

	.seats span {
		width: 10px;
		height: 6px;
		border-radius: 2px;
		background: var(--surface-2);
	}

	.seats .taken {
		background: var(--accent);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		max-width: 100%;
		min-height: 32px;
		padding: 0 4px 0 var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-pill);
		background: var(--surface-lifted);
		font-size: var(--text-sm);
	}

	.chip[draggable='true'] {
		cursor: grab;
	}

	.chip[draggable='true']:active {
		cursor: grabbing;
	}

	.grip {
		display: inline-flex;
		color: var(--text-muted);
	}

	.name {
		overflow: hidden;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.badge {
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 650;
	}

	.wish {
		display: inline-flex;
		color: var(--warn);
	}

	.wish.met {
		color: var(--ok, var(--accent));
	}

	/* The menu at a name: just an arrow until it's opened. */
	.move {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--surface-2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='%23888'%3E%3Cpath d='M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z'/%3E%3C/svg%3E") center / 12px no-repeat;
		color: transparent;
		cursor: pointer;
		appearance: none;
	}

	.move option {
		color: var(--text);
	}

	.warning,
	.detail,
	.hint {
		font-size: var(--text-sm);
	}

	.warning {
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--warn);
		font-weight: 600;
	}

	.detail,
	.hint,
	.muted {
		color: var(--text-muted);
	}

	.detail {
		white-space: pre-line;
	}

	.empty {
		font-size: var(--text-sm);
	}

	@media (max-width: 720px) {
		.board {
			grid-template-columns: 1fr;
		}

		.pool {
			position: static;
		}
	}
</style>

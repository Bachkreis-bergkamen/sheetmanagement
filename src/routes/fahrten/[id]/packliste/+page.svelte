<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const p = t.trips.organising.packing;
	// Ticked at once on the phone; the server's answer follows.
	let ticked = $state<string[]>([]);
	$effect.pre(() => {
		ticked = [...data.ticked];
	});
	const packed = $derived(data.packing.filter((item) => ticked.includes(item.id)).length);
	let items = $state('');
	$effect.pre(() => {
		items = data.packing.map((item) => item.text).join('\n');
	});
	const suggest = () => {
		const have = new Set(items.split('\n').map((line) => line.trim().toLowerCase()));
		items = [...items.split('\n').filter((line) => line.trim()), ...data.suggestions.filter((one) => !have.has(one.toLowerCase()))].join('\n');
	};
	const action = $derived(data.fuer ? `?/tick&fuer=${data.fuer}` : '?/tick');
</script>

<Title title={p.pageTitle(data.trip.title)} />

<a class="back" href="/fahrten/{data.trip.id}"><Icon name="back" size={16} />{data.trip.title}</a>

<header class="head">
	<h1>{data.person?.byParent ? p.forChild(data.person.name) : p.title}</h1>
	<p class="lead">{p.lead}</p>
	{#if data.progress}<p class="muted">{p.ready(data.progress.ready, data.progress.of)}</p>{/if}
</header>

{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}

{#if data.packing.length}
	<section class="ui-card list">
		{#if data.person}
			<p class="progress">
				<span class="bar" aria-hidden="true"><span class:full={packed === data.packing.length} style:width="{(packed / data.packing.length) * 100}%"></span></span>
				<span>{p.progress(packed, data.packing.length)}</span>
			</p>
		{/if}
		<ul>
			{#each data.packing as item (item.id)}
				<li>
					{#if data.person}
						<form method="POST" {action} use:enhance={saving.submit()}>
							<input type="hidden" name="item" value={item.id} />
							<label class="tick" class:done={ticked.includes(item.id)}>
								<input
									type="checkbox"
									name="packed"
									checked={ticked.includes(item.id)}
									onchange={(event) => {
										const on = event.currentTarget.checked;
										ticked = on ? [...ticked, item.id] : ticked.filter((id) => id !== item.id);
										event.currentTarget.form?.requestSubmit();
									}}
								/>
								<span>{item.text}</span>
							</label>
						</form>
					{:else}
						<span class="plain">{item.text}</span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if !data.person}<p class="muted">{p.notGoing}</p>{/if}
	</section>
{:else}
	<p class="ui-card empty muted">{p.empty}</p>
{/if}

{#if data.organises}
	<details class="add ui-card" open={!data.packing.length}>
		<summary><Icon name="edit" size={16} />{p.edit}</summary>
		<form method="POST" action="?/items" class="items" use:enhance={saving.submit()}>
			<label class="field">{p.items}<textarea name="items" rows="10" bind:value={items}></textarea></label>
			<div class="actions">
				<button type="button" class="btn ghost small" onclick={suggest}><Icon name="sparkle" size={14} />{p.suggest}</button>
				<button class="btn small" disabled={saving.busy}>{p.save}</button>
			</div>
		</form>
	</details>
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 32px;
		margin-bottom: var(--space-2);
		color: var(--accent);
		font-weight: 600;
	}

	.head {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}

	.lead {
		max-width: 62ch;
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.list {
		display: grid;
		gap: var(--space-2);
		max-width: 560px;
		padding: var(--space-4);
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.bar {
		flex: 1;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width var(--fast) var(--ease);
	}

	.bar .full {
		background: var(--ok);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li + li {
		border-top: 1px solid var(--hairline);
	}

	/* A whole row to tap on the phone. */
	.tick,
	.plain {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--tap);
	}

	.tick {
		cursor: pointer;
	}

	.tick input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}

	.tick.done span {
		color: var(--text-muted);
		text-decoration: line-through;
	}

	.empty {
		padding: var(--space-5);
	}

	.add {
		max-width: 560px;
		margin-top: var(--space-5);
		padding: 0 var(--space-4);
	}

	.add summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--tap);
		color: var(--accent);
		list-style: none;
		cursor: pointer;
		font-weight: 600;
	}

	.add summary::-webkit-details-marker {
		display: none;
	}

	.items {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>

<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { formatDays } from '#lib/trips/trips.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Nothing from '#lib/components/Nothing.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';
	import TripForm from '#lib/components/TripForm.svelte';

	let { data, form } = $props();
	let adding = $state(false);
</script>

<Title title={t.trips.title} />
<PageHeader title={t.trips.title} lead={t.trips.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.trips.notSetUp}</p>
{:else}
	{#if data.creates}
		<details class="ui-card new" bind:open={adding}>
			<summary><Icon name="plus" size={18} />{t.trips.new}</summary>
			<div class="body-form">
				<TripForm orchestras={data.orchestras} action="?/create" submit={t.trips.create} error={form?.error} />
			</div>
		</details>
	{/if}

	{#snippet list(trips: typeof data.upcoming)}
		<ul class="ui-list trips">
			{#each trips as trip (trip.id)}
				<li>
					<a class="trip" href="/fahrten/{trip.id}">
						<span class="badge" class:done={trip.past}><Icon name="suitcase" size={20} /></span>
						<span class="body">
							<span class="title">{trip.title}</span>
							<span class="when">{formatDays(trip.firstDay, trip.lastDay, config.locale)}</span>
							<span class="meta">
								{[t.trips.kinds[trip.kind], ...(trip.places.length ? [trip.places.join(' → ')] : []), t.trips.signedUp(trip.signedUp, trip.cap)].join(' · ')}
							</span>
							<!-- Under the text, not beside it: on a phone a badge in the row squeezes the title. -->
							{#if trip.yourTurn}
								<span class="pill todo"><Icon name="alert" size={12} />{t.trips.yourTurn}</span>
							{:else if trip.mine === 'angemeldet'}
								<span class="pill go"><Icon name="check" size={12} />{t.trips.youGo}</span>
							{:else if trip.mine === 'warteliste'}
								<span class="pill">{t.trips.youWait}</span>
							{:else if trip.mine === 'abgemeldet'}
								<span class="pill">{t.trips.youCancelled}</span>
							{/if}
							{#each trip.children as child (child)}
								<span class="pill go"><Icon name="check" size={12} />{t.trips.childGoes(child)}</span>
							{/each}
						</span>
						<span class="chevron"><Icon name="chevron" size={16} /></span>
					</a>
				</li>
			{/each}
		</ul>
	{/snippet}

	{#if data.upcoming.length}
		<h2 class="ui-label">{t.trips.upcoming}</h2>
		{@render list(data.upcoming)}
	{:else}
		<Nothing text={t.trips.empty} glyphs={['trumpet', 'violin', 'flute']} />
	{/if}
	{#if data.past.length}
		<h2 class="ui-label past">{t.trips.past}</h2>
		{@render list(data.past)}
	{/if}
{/if}

<style>
	.new {
		margin-bottom: var(--space-5);
		padding: 0;
	}

	.new summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		color: var(--accent);
		font-weight: 650;
		cursor: pointer;
		list-style: none;
	}

	.new summary::-webkit-details-marker {
		display: none;
	}

	.body-form {
		padding: 0 var(--space-4) var(--space-4);
	}

	.past {
		margin-top: var(--space-6);
	}

	.trip {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	.trip:hover {
		background: var(--surface-2);
	}

	.badge {
		display: grid;
		place-items: center;
		flex: none;
		width: 42px;
		height: 42px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.badge.done {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.body {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}

	.title {
		font-weight: 650;
	}

	.when {
		font-size: var(--text-md);
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.pill {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-1);
		margin-top: var(--space-1);
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.pill.todo,
	.pill.go {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.chevron {
		display: grid;
		flex: none;
		align-self: center;
		color: var(--text-muted);
	}
</style>

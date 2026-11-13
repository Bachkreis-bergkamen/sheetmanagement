<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { formatDays, formatWeekday, tripDays } from '#lib/trips/trips.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Nothing from '#lib/components/Nothing.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';
	import TripForm from '#lib/components/TripForm.svelte';

	let { data, form } = $props();
	let adding = $state(false);
	// Pictures that didn't come: their trip shows the suitcase instead of a broken image.
	let failed = $state(new Set<string>());
	const fail = (id: string) => () => (failed = new Set([...failed, id]));
	type Trip = (typeof data.upcoming)[number];
</script>

<Title title={t.trips.title} />
<PageHeader title={t.trips.title} lead={t.trips.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.trips.notSetUp}</p>
{:else}
	{#if data.creates}
		<details class="ui-card ui-disclosure new" bind:open={adding}>
			<summary><span class="plus"><Icon name="plus" size={16} /></span>{t.trips.new}</summary>
			<div class="body-form">
				<TripForm orchestras={data.orchestras} action="?/create" submit={t.trips.create} error={form?.error} />
			</div>
		</details>
	{/if}

	<!-- Where you stand with a trip: your answer, or your children's. -->
	{#snippet standing(trip: Trip)}
		{#if trip.yourTurn}
			<span class="pill todo"><Icon name="alert" size={12} />{t.trips.yourTurn}</span>
		{:else if trip.mine === 'angemeldet'}
			<span class="pill go"><Icon name="check" size={12} />{t.trips.youGo}</span>
		{:else if trip.mine === 'warteliste'}
			<span class="pill wait"><Icon name="clock" size={12} />{t.trips.youWait}</span>
		{:else if trip.mine === 'abgemeldet'}
			<span class="pill">{t.trips.youCancelled}</span>
		{/if}
		{#each trip.children as child (child)}
			<span class="pill go"><Icon name="check" size={12} />{t.trips.childGoes(child)}</span>
		{/each}
	{/snippet}

	{#if data.upcoming.length}
		<h2 class="ui-label">{t.trips.upcoming}</h2>
		<!-- The trips ahead as cards: the sight of the place, the name, when and where, and your answer. -->
		<ul class="cards">
			{#each data.upcoming as trip (trip.id)}
				<li>
					<a class="card" href="/fahrten/{trip.id}">
						<span class="cover" class:blank={!trip.picture || failed.has(trip.id)}>
							{#if trip.picture && !failed.has(trip.id)}
								<img src="/fahrten/{trip.id}/bild?klein" alt="" loading="lazy" onerror={fail(trip.id)} />
							{:else}
								<span class="cover-mark"><Icon name="suitcase" size={32} /></span>
							{/if}
							<span class="kind">{t.trips.kinds[trip.kind]}</span>
						</span>
						<span class="card-body">
							<span class="title">{trip.title}</span>
							<span class="when">{formatDays(trip.firstDay, trip.lastDay, config.locale)} · {t.trips.dayCount(tripDays(trip).length)}</span>
							{#if trip.places.length}
								<span class="route"><Icon name="pin" size={14} /><span>{trip.places.join(' → ')}</span></span>
							{/if}
							<span class="foot">
								<span class="seats">
									{#if trip.cap}
										<span class="bar" aria-hidden="true"><span style:width="{Math.min(100, (trip.signedUp / trip.cap) * 100)}%"></span></span>
									{/if}
									{t.trips.signedUp(trip.signedUp, trip.cap)}
								</span>
								{#if trip.yourTurn && trip.signupUntil}<span class="deadline">{t.trips.until(formatWeekday(trip.signupUntil, config.locale))}</span>{/if}
							</span>
							{#if trip.yourTurn || trip.mine || trip.children.length}
								<span class="pills">{@render standing(trip)}</span>
							{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<Nothing text={t.trips.empty} glyphs={['trumpet', 'violin', 'flute']} />
	{/if}

	{#if data.past.length}
		<h2 class="ui-label past-label">{t.trips.past}</h2>
		<ul class="ui-list past">
			{#each data.past as trip (trip.id)}
				<li>
					<a class="row" href="/fahrten/{trip.id}">
						{#if trip.picture && !failed.has(trip.id)}
							<img class="thumb" src="/fahrten/{trip.id}/bild?klein" alt="" loading="lazy" onerror={fail(trip.id)} />
						{:else}
							<span class="thumb badge"><Icon name="suitcase" size={18} /></span>
						{/if}
						<span class="row-body">
							<span class="title">{trip.title}</span>
							<span class="meta">{[formatDays(trip.firstDay, trip.lastDay, config.locale), ...(trip.places.length ? [trip.places.join(' → ')] : [])].join(' · ')}</span>
						</span>
						<span class="chevron"><Icon name="chevron" size={16} /></span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.new {
		margin-bottom: var(--space-6);
		padding: var(--space-1) var(--space-4);
	}

	.new > summary {
		color: var(--accent);
	}

	.plus {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--accent-soft);
	}

	.body-form {
		padding: var(--space-2) 0 var(--space-4);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: grid;
		grid-template-rows: auto 1fr;
		height: 100%;
		overflow: hidden;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
		color: inherit;
		transition:
			box-shadow var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	.card:hover {
		box-shadow: var(--shadow-raised);
		transform: translateY(-2px);
	}

	.card:active {
		transform: scale(0.99);
	}

	.card:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.cover {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: var(--accent-soft);
		color: var(--accent);
	}

	/* No picture yet: a low band with the suitcase, not a large empty frame. */
	.cover.blank {
		aspect-ratio: 3 / 1;
	}

	.cover img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.cover-mark {
		opacity: 0.7;
	}

	/* The kind, on the picture's corner. */
	.kind {
		position: absolute;
		top: var(--space-3);
		left: var(--space-3);
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		background: rgb(0 0 0 / 0.55);
		color: #fff;
		font-size: var(--text-2xs);
		font-weight: 650;
		backdrop-filter: blur(6px);
	}

	.card-body {
		display: grid;
		align-content: start;
		gap: var(--space-1);
		padding: var(--space-4);
	}

	.title {
		font-weight: 650;
	}

	.card .title {
		font-size: var(--text-lg);
		line-height: 1.25;
	}

	.when {
		font-size: var(--text-md);
		font-weight: 600;
	}

	.route {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.route :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		margin-top: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.seats {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.bar {
		display: block;
		width: 56px;
		height: 6px;
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.bar > span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
	}

	.deadline {
		color: var(--warn);
		font-weight: 600;
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 3px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.pill.todo {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.pill.go {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.pill.wait {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.past-label {
		margin-top: var(--space-6);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		color: inherit;
		transition: background var(--fast) var(--ease);
	}

	.row:hover {
		background: var(--surface-2);
	}

	.thumb {
		flex: none;
		width: 56px;
		height: 42px;
		border-radius: var(--radius-s);
		background: var(--surface-2);
		object-fit: cover;
		filter: grayscale(0.6);
		opacity: 0.85;
	}

	.badge {
		display: grid;
		place-items: center;
		color: var(--text-muted);
		filter: none;
	}

	.row-body {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.chevron {
		display: grid;
		flex: none;
		color: var(--text-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.card:hover {
			transform: none;
		}
	}
</style>

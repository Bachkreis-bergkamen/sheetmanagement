<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { LONG_AGO_YEARS } from '#lib/repertoire/chronicle.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();
	const stats = $derived(data.stats);

	type View = 'timeline' | 'numbers';
	let view = $state<View>('timeline');
	const views = [
		{ value: 'timeline' as const, label: t.chronicle.views.timeline, icon: 'history' as const },
		{ value: 'numbers' as const, label: t.chronicle.views.numbers, icon: 'chart' as const }
	];

	const tiles = $derived(
		[
			{ value: stats.concerts, label: t.chronicle.concerts(stats.concerts) },
			{ value: stats.pieces, label: t.chronicle.pieces(stats.pieces) },
			{ value: stats.performances, label: t.chronicle.performances(stats.performances) },
			stats.firstYear !== undefined && { value: stats.firstYear, label: t.chronicle.since, before: true }
		].filter((tile) => !!tile)
	);

	/** Bars relative to the largest value in their list, never thinner than a sliver. */
	const width = (value: number, max: number) => `${Math.max(4, Math.round((value / Math.max(max, 1)) * 100))}%`;
	/** The composers card stays about as long as the pieces next to it. */
	const COMPOSERS = 6;
	const maxPlayed = $derived(Math.max(0, ...stats.mostPlayed.map((piece) => piece.count)));
	const maxComposer = $derived(Math.max(0, ...stats.composers.map((composer) => composer.count)));
	const maxDecade = $derived(Math.max(0, ...stats.decades.map((decade) => decade.concerts)));
</script>

<Title title={t.chronicle.title} />
<PageHeader title={t.chronicle.title} lead={t.chronicle.lead} />

{#if data.sheet !== 'ok'}
	<p class="msg info">{t.chronicle.noSheet}</p>
{:else if stats.concerts === 0}
	<p class="msg info">{t.chronicle.empty}</p>
{:else}
	<ul class="tiles">
		{#each tiles as tile (tile.label)}
			<li class="ui-card tile">
				{#if tile.before}<span class="tile-label">{tile.label}</span>{/if}
				<strong>{tile.value}</strong>
				{#if !tile.before}<span class="tile-label">{tile.label}</span>{/if}
			</li>
		{/each}
	</ul>

	<div class="toolbar">
		<Segmented options={views} bind:value={view} label={t.chronicle.views.label} />
		{#if data.canReport}
			<div class="ui-actions"><a href="/chronik/saison"><Icon name="chart" size={16} />{t.chronicle.seasonReport}</a></div>
		{/if}
	</div>

	{#if view === 'timeline'}
		{#each data.timeline as decade, i (decade.decade)}
			<!-- The newest decade open; older ones a click away, so a long history stays short. -->
			<details class="decade ui-disclosure" open={i === 0}>
				<summary>
					<span class="decade-name">{decade.decade === null ? t.chronicle.undated : t.chronicle.decade(decade.decade)}</span>
					<span class="ui-muted">{t.chronicle.decadeLine(
						decade.years.reduce((sum, year) => sum + year.concerts.length, 0),
						new Set(decade.years.flatMap((year) => year.concerts.flatMap((concert) => concert.program.map((item) => item.pieceId ?? item.title)))).size
					)}</span>
				</summary>
				{#each decade.years as year (year.year)}
					<section class="year">
						<h2 class="year-name">{year.year ?? t.chronicle.yearUnknown}</h2>
						<ol class="concerts">
							{#each year.concerts as concert (concert.id)}
								<li class="concert">
									<a class="concert-title" href="/kalender/{encodeURIComponent(concert.id)}">{concert.title}</a>
									<span class="ui-muted">{[concert.label, concert.location].filter(Boolean).join(' · ')}</span>
									{#if concert.program.length}
										<ul class="program">
											{#each concert.program as item, j (j)}
												<li>
													{#if item.pieceId}
														<a href="/stuecke/{encodeURIComponent(item.pieceId)}">{item.title}</a>
													{:else}
														<span>{item.title}</span>
													{/if}
													{#if concert.debuts.includes(j)}<span class="debut" title={t.chronicle.debutHint}>{t.chronicle.debut}<span class="sr-only">: {t.chronicle.debutHint}</span></span>{/if}
												</li>
											{/each}
										</ul>
									{:else}
										<p class="ui-muted small">{t.chronicle.noProgram}</p>
									{/if}
								</li>
							{/each}
						</ol>
					</section>
				{/each}
			</details>
		{/each}
	{:else}
		<div class="numbers">
			<section class="ui-card">
				<h2 class="card-title">{t.chronicle.mostPlayed}</h2>
				{#if stats.mostPlayed.length}
					<ol class="bars">
						{#each stats.mostPlayed as piece (piece.key)}
							<li>
								<div class="bar-text">
									{#if piece.pieceId}<a href="/stuecke/{encodeURIComponent(piece.pieceId)}">{piece.title}</a>{:else}<span>{piece.title}</span>{/if}
									<span class="count">{t.chronicle.times(piece.count)}</span>
								</div>
								<span class="bar" style:width={width(piece.count, maxPlayed)}></span>
								{#if piece.firstYear !== undefined && piece.lastYear !== undefined}
									<span class="ui-muted small">{t.chronicle.playedIn(piece.firstYear, piece.lastYear)}</span>
								{/if}
							</li>
						{/each}
					</ol>
				{:else}
					<p class="ui-muted">{t.chronicle.mostPlayedNone}</p>
				{/if}
			</section>

			{#if stats.composers.length}
				<section class="ui-card">
					<h2 class="card-title">{t.chronicle.composers}</h2>
					<ol class="bars">
						{#each stats.composers.slice(0, COMPOSERS) as composer (composer.name)}
							<li>
								<div class="bar-text">
									<a href="/stuecke?komponist={encodeURIComponent(composer.name)}">{composer.name}</a>
									<span class="count">{t.chronicle.times(composer.count)}</span>
								</div>
								<span class="bar" style:width={width(composer.count, maxComposer)}></span>
								<span class="ui-muted small">{t.chronicle.composerLine(composer.count, composer.pieces)}</span>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			{#if stats.decades.length}
				<section class="ui-card wide">
					<h2 class="card-title">{t.chronicle.byDecade}</h2>
					<ol class="bars decades">
						{#each stats.decades as decade (decade.decade)}
							<li>
								<div class="bar-text">
									<strong>{t.chronicle.decade(decade.decade)}</strong>
									<span class="ui-muted small">{t.chronicle.decadeLine(decade.concerts, decade.pieces)}{decade.composers.length ? ` · ${decade.composers.join(', ')}` : ''}</span>
								</div>
								<span class="bar" style:width={width(decade.concerts, maxDecade)}></span>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			<section class="ui-card">
				<h2 class="card-title">{t.chronicle.longAgo}</h2>
				{#if stats.longAgo.length}
					<p class="ui-muted small lead">{t.chronicle.longAgoLead(LONG_AGO_YEARS)}</p>
					<ul class="plain">
						{#each stats.longAgo as piece (piece.key)}
							<li>
								<span class="name">
									{#if piece.pieceId}<a href="/stuecke/{encodeURIComponent(piece.pieceId)}">{piece.title}</a>{:else}<span>{piece.title}</span>{/if}
									{#if piece.planned}<span class="debut">{t.chronicle.plannedAgain}</span>{/if}
								</span>
								<span class="ui-muted small">{t.chronicle.lastPlayed(piece.lastYear!)}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="ui-muted">{t.chronicle.longAgoNone(LONG_AGO_YEARS)}</p>
				{/if}
			</section>

			{#if stats.neverPlayed.count}
				<section class="ui-card">
					<h2 class="card-title">{t.chronicle.neverPlayed}</h2>
					<p class="ui-muted small lead">{t.chronicle.neverPlayedLead(stats.neverPlayed.count)}</p>
					<ul class="plain">
						{#each stats.neverPlayed.pieces as piece (piece.id)}
							<li>
								<a href="/stuecke/{encodeURIComponent(piece.id)}">{piece.title}</a>
								{#if piece.composer}<span class="ui-muted small">{piece.composer}</span>{/if}
							</li>
						{/each}
					</ul>
					{#if stats.neverPlayed.count > stats.neverPlayed.pieces.length}
						<p class="ui-muted small">{t.chronicle.andMore(stats.neverPlayed.count - stats.neverPlayed.pieces.length)}</p>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: var(--space-3);
		margin: 0 0 var(--space-5);
		padding: 0;
		list-style: none;
	}

	.tile {
		display: grid;
		gap: 2px;
		padding: var(--space-4);
	}

	.tile strong {
		color: var(--accent);
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		line-height: 1.1;
	}

	.tile-label {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.decade {
		margin-bottom: var(--space-3);
		padding: 0 var(--space-4) var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.decade summary {
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-2) 0;
	}

	.decade-name {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}

	.year {
		position: relative;
		margin: var(--space-3) 0 var(--space-4);
		padding-left: var(--space-5);
		border-left: 2px solid var(--accent-soft);
	}

	.year-name {
		position: relative;
		margin: 0 0 var(--space-2);
		color: var(--accent);
		font-size: var(--text-base);
	}

	/* A dot on the line, where the year begins. */
	.year-name::before {
		content: '';
		position: absolute;
		top: 50%;
		left: calc(-1 * var(--space-5) - 6px);
		width: 10px;
		height: 10px;
		border: 2px solid var(--surface);
		border-radius: 50%;
		background: var(--accent);
		translate: 0 -50%;
	}

	.concerts {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.concert {
		display: grid;
		gap: 2px;
	}

	.concert-title {
		font-weight: 650;
		overflow-wrap: anywhere;
	}

	.concert-title:hover {
		color: var(--accent);
	}

	.program {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: var(--space-1) 0 0;
		padding: 0;
		list-style: none;
	}

	.program li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 10px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-sm);
	}

	.program a:hover {
		color: var(--accent);
		text-decoration: underline;
	}

	/* On the surface, not the pill's grey, so the green stays readable (#141). */
	.debut {
		padding: 0 6px;
		border: 1px solid color-mix(in oklab, var(--ok) 45%, transparent);
		border-radius: var(--radius-xs);
		background: var(--surface);
		color: var(--ok);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.numbers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
		align-items: start;
		gap: var(--space-4);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.card-title {
		margin: 0 0 var(--space-3);
		font-size: var(--text-lg);
	}

	.lead {
		margin: calc(-1 * var(--space-2)) 0 var(--space-3);
	}

	.bars {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.bars li {
		display: grid;
		gap: 4px;
	}

	.bar-text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}

	.bar-text a {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.bar-text a:hover,
	.plain a:hover {
		color: var(--accent);
		text-decoration: underline;
	}

	.count {
		color: var(--accent);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.bar {
		display: block;
		height: 8px;
		border-radius: var(--radius-pill);
		background: var(--accent);
		opacity: 0.75;
	}

	.plain {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.plain li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}

	.plain a {
		font-weight: 600;
	}

	.name {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}

	.small {
		font-size: var(--text-sm);
	}
</style>

<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';
	import FactsText from '#lib/components/FactsText.svelte';
	import { formatDuration, programLength, roundMinutes, startTimes } from '#lib/repertoire/duration.ts';

	let { data } = $props();
	const concertUrl = $derived(`/kalender/${encodeURIComponent(data.concert.id)}`);
	const when = $derived([data.concert.date, data.concert.time].filter(Boolean).join(', '));
	const length = $derived(programLength(data.items.map((item) => item.duration)));
	const hints = $derived({
		handout: t.print.handoutHint,
		booklet: t.print.bookletHint,
		moderation: t.print.moderationHint,
		setlist: t.print.setlistHint,
		musikfolge: t.musicReport.hint
	});
	// The Programmheft and the moderation (#411): which pieces have nothing to tell yet.
	const withFacts = $derived(data.kind === 'booklet' || data.kind === 'moderation');
	const factsGaps = $derived(withFacts ? data.items.filter((item) => !item.facts?.paragraphs.length) : []);
	const starts = $derived(startTimes(data.items.map((item) => item.duration)));
	const speaking = $derived(data.items.reduce((sum, item) => sum + (item.speaking ?? 0), 0));
</script>

<Title title={t.print.title(data.concert.title)} />

<div class="no-print controls">
	<a class="back" href={concertUrl}><Icon name="back" size={18} />{t.print.back}</a>
	<div class="tabs" role="tablist">
		<a role="tab" class="tab" class:active={data.kind === 'handout'} aria-selected={data.kind === 'handout'} href="?art=zettel" data-sveltekit-replacestate>
			{t.print.handout}
		</a>
		<a role="tab" class="tab" class:active={data.kind === 'booklet'} aria-selected={data.kind === 'booklet'} href="?art=programmheft" data-sveltekit-replacestate>
			{t.print.booklet}
		</a>
		<a role="tab" class="tab" class:active={data.kind === 'moderation'} aria-selected={data.kind === 'moderation'} href="?art=moderation" data-sveltekit-replacestate>
			{t.print.moderation}
		</a>
		<a role="tab" class="tab" class:active={data.kind === 'setlist'} aria-selected={data.kind === 'setlist'} href="?art=setlist" data-sveltekit-replacestate>
			{t.print.setlist}
		</a>
		{#if data.canReport}
			<a role="tab" class="tab" class:active={data.kind === 'musikfolge'} aria-selected={data.kind === 'musikfolge'} href="?art=musikfolge" data-sveltekit-replacestate>
				{t.musicReport.tab}
			</a>
		{/if}
	</div>
	<p class="hint">{hints[data.kind]}</p>
	<div class="buttons">
		{#if data.kind === 'musikfolge' && data.items.length}
			<a class="btn ghost" href="{concertUrl}/musikfolge.csv" download><Icon name="table" size={16} />{t.musicReport.csv}</a>
		{/if}
		<button class="btn" onclick={() => window.print()} disabled={!data.items.length}><Icon name="print" size={16} />{t.print.print}</button>
	</div>
</div>

{#if data.report?.scope && data.items.length}
	<!-- A concert with guests: everything we organise, only ours when a guest reports theirs. -->
	<form class="no-print scope" method="POST" action="?art=musikfolge&/scope" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<span class="scope-label">{t.partners.reportScope}</span>
		<span class="scope-options">
			<button name="scope" value="all" class="tab" class:active={data.report.scope === 'all'} aria-pressed={data.report.scope === 'all'}>{t.partners.reportAll}</button>
			<button name="scope" value="ours" class="tab" class:active={data.report.scope === 'ours'} aria-pressed={data.report.scope === 'ours'}>{t.partners.reportOurs}</button>
		</span>
		<p class="hint">{t.partners.reportScopeHint}</p>
	</form>
{/if}

{#if data.report && data.items.length}
	<!-- What's still missing, with a way to fill it in; not printed. -->
	<div class="no-print gaps" class:complete={!data.report.gaps.length}>
		{#if data.report.gaps.length}
			<p><Icon name="alert" size={16} />{t.musicReport.gaps(data.report.gaps.length)}</p>
			<ul>
				{#each data.report.gaps as gap, i (i)}
					<li>
						<strong>{gap.title}</strong>
						<span class="ui-hint">{gap.missing.map((field) => t.musicReport.missing[field]).join(', ')}</span>
						{#if gap.pieceId && data.report.canFill}
							<a href="/stuecke/{encodeURIComponent(gap.pieceId)}/bearbeiten">{t.musicReport.fill}</a>
						{:else if !gap.pieceId}
							<!-- A guest piece: its details are on its programme row. -->
							<a href="{concertUrl}/programm">{t.partners.fillInProgram}</a>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p><Icon name="check" size={16} />{t.musicReport.complete}</p>
		{/if}
		<p class="ui-hint">{t.musicReport.fullNames}</p>
	</div>
{/if}

{#if withFacts && data.items.length}
	<!-- What the Programmheft and the moderation still lack, with a way to fill it in; not printed. -->
	<div class="no-print gaps" class:complete={!factsGaps.length}>
		{#if factsGaps.length}
			<p><Icon name="alert" size={16} />{t.print.factsGaps(factsGaps.length)}</p>
			<ul>
				{#each factsGaps as gap, i (i)}
					<li>
						<strong>{gap.title}</strong>
						{#if gap.pieceId && data.canEditPieces}
							<a href="/stuecke/{encodeURIComponent(gap.pieceId)}/bearbeiten#facts">{t.print.fill}</a>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p><Icon name="check" size={16} />{t.print.factsComplete}</p>
		{/if}
	</div>
{/if}

{#if !data.items.length}
	<p class="msg info no-print">{t.print.empty}</p>
{:else if data.kind === 'booklet'}
	<!-- The Programmheft: the handout's head, then each piece with what there is to know about it. -->
	<article class="sheet booklet">
		<header>
			<p class="orchestra">{page.data.orchestraName}</p>
			<h1>{data.concert.title}</h1>
			{#if data.concert.partners.length}<p class="with">{t.partners.with(data.concert.partners)}</p>{/if}
			{#if when || data.concert.location}
				<p class="when">{[when, data.concert.location].filter(Boolean).join(' · ')}</p>
			{/if}
		</header>
		<h2>{t.print.program}</h2>
		<ol>
			{#each data.items as item, i (i)}
				<li>
					<h3>{item.title}</h3>
					{#if item.subtitle}<p class="composer">{item.subtitle}</p>{/if}
					{#if item.performers}<p class="by">{item.performers}</p>{/if}
					{#if item.notes}<p class="note">{item.notes}</p>{/if}
					{#if item.facts?.paragraphs.length}<div class="story"><FactsText facts={item.facts} /></div>{/if}
				</li>
			{/each}
		</ol>
		{#if length.known && !length.missing}<p class="total">{t.print.totalLength(roundMinutes(length.seconds))}</p>{/if}
	</article>
{:else if data.kind === 'moderation'}
	<!-- For whoever presents: the running order with times, and everything to tell, large enough for a dim stage. -->
	<article class="sheet moderation">
		<header>
			<p class="setlist-head">{[data.concert.title, when, data.concert.location].filter(Boolean).join(' · ')}</p>
			<p class="totals">
				{#if length.known}<span>{t.duration.total(roundMinutes(length.seconds), length.missing)}</span>{/if}
				{#if speaking}<span>{t.print.speakingTotal(roundMinutes(speaking))}</span>{/if}
			</p>
		</header>
		<ol>
			{#each data.items as item, i (i)}
				{@const start = starts[i]}
				<li>
					<div class="cue">
						<span class="number">{i + 1}</span>
						<div>
							<h3>{item.title}</h3>
							{#if item.subtitle}<p class="composer">{item.subtitle}</p>{/if}
							{#if item.performers}<p class="by">{item.performers}</p>{/if}
						</div>
						<p class="times">
							{#if start !== undefined}<span>{t.print.startsAt(Math.round(start / 60))}</span>{/if}
							{#if item.duration}<span>{formatDuration(item.duration)}</span>{/if}
							{#if item.speaking}<span>{t.facts.speaking(item.speaking)}</span>{/if}
						</p>
					</div>
					{#if item.notes}<p class="note">{item.notes}</p>{/if}
					{#if item.facts?.paragraphs.length}
						<div class="story"><FactsText facts={item.facts} sources={false} /></div>
					{:else}
						<p class="nothing">{t.print.nothingToTell}</p>
					{/if}
					<!-- Room to write by hand: what the conductor wants said, a thank-you, an encore. -->
					<div class="own" aria-hidden="true">{t.print.ownNotes}</div>
				</li>
			{/each}
		</ol>
	</article>
{:else if data.kind === 'handout'}
	<article class="sheet handout">
		<header>
			<p class="orchestra">{page.data.orchestraName}</p>
			<h1>{data.concert.title}</h1>
			{#if data.concert.partners.length}<p class="with">{t.partners.with(data.concert.partners)}</p>{/if}
			{#if when || data.concert.location}
				<p class="when">{[when, data.concert.location].filter(Boolean).join(' · ')}</p>
			{/if}
		</header>
		<h2>{t.print.program}</h2>
		<ol>
			{#each data.items as item, i (i)}
				<li>
					<span class="piece">{item.title}</span>
					{#if item.subtitle}<span class="composer">{item.subtitle}</span>{/if}
					{#if item.performers}<span class="by">{item.performers}</span>{/if}
					{#if item.notes}<span class="note">{item.notes}</span>{/if}
				</li>
			{/each}
		</ol>
		<!-- For the audience only when every piece has a duration; a guess would mislead. -->
		{#if length.known && !length.missing}<p class="total">{t.print.totalLength(roundMinutes(length.seconds))}</p>{/if}
	</article>
{:else if data.kind === 'musikfolge' && data.report}
	<article class="sheet report">
		<header>
			<h1>{t.musicReport.title}</h1>
			<dl>
				<div><dt>{t.musicReport.organizer}</dt><dd>{data.concert.organizer ?? page.data.orchestraName}</dd></div>
				<div><dt>{t.musicReport.date}</dt><dd>{when || '–'}</dd></div>
				<div><dt>{t.musicReport.venue}</dt><dd>{data.concert.location ?? '–'}</dd></div>
			</dl>
			<p class="concert">{data.concert.title}</p>
		</header>
		<div class="table">
			<table>
				<thead>
					<tr>{#each data.report.rows[0] as cell, i (i)}<th>{cell}</th>{/each}</tr>
				</thead>
				<tbody>
					{#each data.report.rows.slice(1) as row, r (r)}
						<tr>{#each row as cell, i (i)}<td class:empty={!cell && i !== 3}>{cell}</td>{/each}</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</article>
{:else}
	<article class="sheet setlist">
		<p class="setlist-head">{data.concert.title}{when ? ` · ${when}` : ''}</p>
		<ol>
			{#each data.items as item, i (i)}
				<li>
					<span class="number">{i + 1}</span>
					<span class="piece">{item.title}</span>
					{#if item.duration}<span class="time">{formatDuration(item.duration)}</span>{/if}
					{#if item.notes}<span class="note">{item.notes}</span>{/if}
				</li>
			{/each}
		</ol>
		{#if length.known}<p class="total">{t.duration.total(roundMinutes(length.seconds), length.missing)}</p>{/if}
	</article>
{/if}

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.back {
		display: inline-flex;
		flex-basis: 100%;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-weight: 500;
	}

	.tabs {
		display: flex;
		gap: var(--space-2);
	}

	.tab {
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.tab.active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.tabs {
		flex-wrap: wrap;
	}

	.hint {
		flex: 1;
		min-width: 200px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.scope {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		max-width: 720px;
		margin: 0 auto var(--space-3);
	}

	.scope-label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.scope-options {
		display: flex;
		gap: var(--space-2);
	}

	.scope .tab {
		cursor: pointer;
	}

	.scope .hint {
		flex-basis: 100%;
		margin: 0;
	}

	.gaps {
		display: grid;
		gap: var(--space-2);
		max-width: 720px;
		margin: 0 auto var(--space-5);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--warn) 10%, var(--surface));
	}

	.gaps.complete {
		background: color-mix(in oklab, var(--ok) 10%, var(--surface));
	}

	.gaps p {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.gaps ul {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding-left: var(--space-5);
	}

	.gaps li {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-2);
	}

	.gaps a {
		color: var(--accent);
		font-weight: 600;
	}

	.total {
		margin-top: var(--space-4);
		color: var(--text-muted);
		text-align: center;
	}

	.setlist .total {
		text-align: left;
	}

	.setlist .time {
		color: var(--text-muted);
		font-size: var(--text-xl);
		font-variant-numeric: tabular-nums;
	}

	.report header {
		margin-bottom: var(--space-4);
	}

	.report h1 {
		margin-bottom: var(--space-3);
	}

	.report dl {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin: 0 0 var(--space-2);
	}

	.report dt {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.report dd {
		margin: 0;
	}

	.concert {
		font-weight: 600;
	}

	.table {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-md);
	}

	th,
	td {
		padding: var(--space-2);
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}

	th {
		font-size: var(--text-xs);
	}

	td.empty {
		background: color-mix(in oklab, var(--warn) 10%, transparent);
	}

	td:first-child,
	td:last-child {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	/* The page as it will print, so what you see is what you get. */
	.sheet {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.handout header {
		margin-bottom: var(--space-6);
		text-align: center;
	}

	.orchestra {
		color: var(--text-muted);
		font-size: var(--text-sm);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.handout h1 {
		margin: var(--space-2) 0;
	}

	.when {
		color: var(--text-muted);
	}

	.with {
		margin-bottom: var(--space-1);
		font-size: var(--text-lg);
		font-style: italic;
	}

	.by {
		color: var(--text-muted);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.handout h2 {
		margin-bottom: var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-xs);
		letter-spacing: 0.12em;
		text-align: center;
		text-transform: uppercase;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.handout li {
		display: grid;
		gap: 2px;
		padding: var(--space-3) 0;
		border-bottom: 1px dotted var(--border);
		text-align: center;
		break-inside: avoid;
	}

	.handout li:last-child {
		border-bottom: 0;
	}

	.handout .piece {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
	}

	.composer {
		color: var(--text-muted);
	}

	.note {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-style: italic;
	}

	.setlist-head {
		margin-bottom: var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	.setlist li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: 2px solid var(--border);
		break-inside: avoid;
	}

	.number {
		min-width: 2ch;
		font-size: var(--text-3xl);
		font-weight: 800;
		text-align: right;
	}

	.setlist .piece {
		flex: 1;
		font-size: var(--text-3xl);
		font-weight: 700;
		line-height: 1.2;
	}

	.setlist .note {
		flex-basis: 100%;
		padding-left: calc(2ch + var(--space-4));
		font-size: var(--text-base);
	}

	.booklet header {
		margin-bottom: var(--space-6);
		text-align: center;
	}

	.booklet h1 {
		margin: var(--space-2) 0;
	}

	.booklet h2 {
		margin-bottom: var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-xs);
		letter-spacing: 0.12em;
		text-align: center;
		text-transform: uppercase;
	}

	.booklet li {
		padding: var(--space-4) 0;
		border-bottom: 1px dotted var(--border);
		break-inside: avoid-page;
	}

	.booklet li:last-child {
		border-bottom: 0;
	}

	.booklet h3,
	.moderation h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1.25;
	}

	.booklet li > p,
	.moderation .cue p:not(.times) {
		margin: 2px 0 0;
	}

	.story {
		margin-top: var(--space-3);
		font-size: var(--text-md);
		hyphens: auto;
	}

	.booklet .story {
		columns: 2 18rem;
		column-gap: var(--space-5);
	}

	.moderation header {
		margin-bottom: var(--space-4);
	}

	.totals {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.moderation li {
		padding: var(--space-4) 0;
		border-bottom: 2px solid var(--border);
	}

	.cue {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: baseline;
		gap: var(--space-3);
		break-after: avoid;
	}

	.moderation .number {
		font-size: var(--text-2xl);
	}

	.times {
		display: grid;
		justify-items: end;
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.moderation .note {
		margin: var(--space-2) 0 0;
	}

	/* Read out on stage: larger than in the booklet, short lines. */
	.moderation .story {
		max-width: 62ch;
		font-size: var(--text-lg);
	}

	.nothing {
		margin: var(--space-2) 0 0;
		color: var(--text-muted);
		font-style: italic;
	}

	.own {
		min-height: 4.5rem;
		margin-top: var(--space-3);
		padding: var(--space-1) var(--space-2);
		border: 1px dashed var(--border);
		border-radius: var(--radius-s);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		break-inside: avoid;
	}

	@media print {
		.moderation .story {
			font-size: 14pt;
		}

		.booklet .story {
			font-size: 10.5pt;
		}

		.sheet {
			max-width: none;
			padding: 0;
			border: 0;
		}

		.setlist .piece,
		.number {
			font-size: 22pt;
		}

		td.empty {
			background: none;
		}
	}
</style>

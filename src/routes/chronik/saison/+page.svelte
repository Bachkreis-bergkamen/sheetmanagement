<script lang="ts">
	import { page } from '$app/state';
	import { config } from '#lib/config/index.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();
	const report = $derived(data.report);

	const presetLabel = (key: (typeof data.presets)[number]['key']) =>
		key === 'twelve'
			? t.season.presets.twelve
			: key === 'season'
				? t.season.presets.season(data.seasonLabel)
				: key === 'lastYear'
					? t.season.presets.lastYear(data.lastYear)
					: t.season.presets.thisYear(data.thisYear);
	const href = (period: { from: string; to: string }) => `?von=${period.from}&bis=${period.to}`;
	const current = (period: { from: string; to: string }) => period.from === data.period.from && period.to === data.period.to;
	const average = $derived(report.attendance ? new Intl.NumberFormat(config.locale).format(report.attendance.average) : '');

	const figures = $derived([
		{ value: report.concerts.length, label: t.season.concerts(report.concerts.length) },
		{ value: report.pieces, label: t.season.pieces(report.pieces) },
		{ value: report.debuts.length, label: t.season.debuts },
		...(data.calendar ? [{ value: report.rehearsals, label: t.season.rehearsals(report.rehearsals) }] : [])
	]);
</script>

<Title title={t.season.title} />

<div class="no-print controls">
	<a class="back" href="/chronik"><Icon name="back" size={18} />{t.season.back}</a>
	<p class="lead">{t.season.lead}</p>
	<nav class="presets" aria-label={t.season.presetsLabel}>
		{#each data.presets as preset (preset.key)}
			<a class="preset" class:active={current(preset)} aria-current={current(preset) ? 'page' : undefined} href={href(preset)} data-sveltekit-replacestate>
				{presetLabel(preset.key)}
			</a>
		{/each}
	</nav>
	<form method="GET" class="period" data-sveltekit-replacestate>
		<label class="field">
			<span>{t.season.from}</span>
			<input type="date" name="von" value={data.period.from} required />
		</label>
		<label class="field">
			<span>{t.season.to}</span>
			<input type="date" name="bis" value={data.period.to} required />
		</label>
		<button class="btn ghost">{t.season.show}</button>
		<button type="button" class="btn" onclick={() => window.print()}><Icon name="print" size={16} />{t.season.print}</button>
	</form>
</div>

<article class="sheet">
	<header>
		<h1>{t.season.heading(page.data.orchestraName)}</h1>
		<p class="period-label">{data.periodLabel}</p>
	</header>

	<section>
		<h2>{t.season.figures}</h2>
		<ul class="figures">
			{#each figures as figure (figure.label)}
				<li><strong>{figure.value}</strong><span>{figure.label}</span></li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>{t.season.concertsTitle}</h2>
		{#if report.concerts.length}
			<ol class="concerts">
				{#each report.concerts as concert (concert.id)}
					<li>
						<p class="concert-head"><strong>{concert.title}</strong> <span class="ui-muted">{[concert.label, concert.location].filter(Boolean).join(' · ')}</span></p>
						{#if concert.program.length}
							<ol class="program">
								{#each concert.program as item, i (i)}
									<li>{item.title}{#if item.composer}<span class="ui-muted">{` · ${item.composer}`}</span>{/if}{#if concert.debuts.includes(i)}<span class="new">{` (${t.season.firstTime})`}</span>{/if}</li>
								{/each}
							</ol>
						{:else}
							<p class="ui-muted">{t.season.noProgram}</p>
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<p class="ui-muted">{t.season.noConcerts}</p>
		{/if}
	</section>

	<section>
		<h2>{t.season.debutsTitle}</h2>
		{#if report.debuts.length}
			<ul class="debuts">
				{#each report.debuts as debut, i (i)}
					<li><strong>{debut.title}</strong> <span class="ui-muted">{t.season.debutAt(debut.concert)}</span></li>
				{/each}
			</ul>
		{:else}
			<p class="ui-muted">{t.season.noDebuts}</p>
		{/if}
	</section>

	<section>
		<h2>{t.season.rehearsalsTitle}</h2>
		{#if data.calendar}
			<p>{t.season.rehearsalCount(report.rehearsals)}</p>
			{#if data.attendanceOn}
				<p>{report.attendance ? t.season.attendance(report.attendance.rehearsals, average, report.attendance.rate) : t.season.noAttendance}</p>
			{/if}
		{:else}
			<p class="ui-muted">{t.season.noCalendar}</p>
		{/if}
	</section>

	<section>
		<h2>{t.season.archiveTitle}</h2>
		<p>{t.season.reports(report.reports.made, report.reports.done)}</p>
		{#if data.wishesOn}<p>{t.season.wishes(report.wishes)}</p>{/if}
	</section>

	<p class="created ui-muted">{t.season.created(data.today)}</p>
</article>

<style>
	.controls {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		justify-self: start;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.back:hover {
		color: var(--accent);
	}

	.lead {
		max-width: 62ch;
		color: var(--text-muted);
	}

	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.preset {
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 0 14px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.preset.active {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.period {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3);
	}

	.period .field {
		margin: 0;
	}

	.sheet {
		max-width: 52rem;
		padding: var(--space-6);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	header {
		margin-bottom: var(--space-5);
	}

	h1 {
		margin: 0;
	}

	.period-label {
		margin-top: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-lg);
	}

	section {
		margin-bottom: var(--space-5);
		break-inside: avoid;
	}

	h2 {
		margin: 0 0 var(--space-2);
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--hairline);
		font-size: var(--text-lg);
	}

	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.figures li {
		display: grid;
	}

	.figures strong {
		color: var(--accent);
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		line-height: 1.1;
	}

	.figures span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.concerts {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.concert-head {
		margin: 0;
	}

	.program,
	.debuts {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-5);
	}

	.new {
		color: var(--ok);
		font-weight: 600;
	}

	section p + p {
		margin-top: var(--space-2);
	}

	.created {
		font-size: var(--text-xs);
	}

	@media print {
		.sheet {
			max-width: none;
			padding: 0;
			border: 0;
			box-shadow: none;
		}

		.figures strong {
			color: var(--text);
		}
	}
</style>

<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import type { ListAnswers, ListKind } from '#lib/trips/lists.ts';
	import { formatWeekday, localDay } from '#lib/trips/trips.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();
	const l = t.trips.lists;
	const day = (iso: string) => formatWeekday(iso.length > 10 ? localDay(iso, config.timeZone) : iso, config.locale);
	const euro = new Intl.NumberFormat(config.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
	const yes = (value: boolean | undefined) => (value === undefined ? '–' : value ? l.yes : l.no);
	const entriesOf = (kind: ListKind) => data.entries.filter((entry) => entry.kind === kind);
	const as = <K extends ListKind>(entry: { data: unknown }, _kind: K) => entry.data as ListAnswers[K];
	/** A form's label as a column heading: "Krankenversicherung (optional)" → "Krankenversicherung". */
	const short = (label: string) => label.replace(/ \(optional\)$/, '');
	const progressOf = (kind: ListKind) => data.progress.find((one) => one.kind === kind);
	let shown = $state<ListKind | 'kueche'>('ernaehrung');
	// The first list there is, unless the one picked is there.
	const current = $derived(shown === 'kueche' || data.readable.some((one) => one.kind === shown) ? shown : (data.readable[0]?.kind ?? 'kueche'));
</script>

<Title title="{l.evaluate} · {data.trip.title}" />

<a class="back" href="/fahrten/{data.trip.id}"><Icon name="back" size={16} />{data.trip.title}</a>

<header class="head">
	<h1>{l.evaluate}</h1>
	<p class="lead">{l.evaluateLead}</p>
	{#if !data.organises}<p class="msg info">{l.overview.onlyThese}</p>{/if}
	<p class="hint">{l.goneOn(day(data.goneOn))}</p>
</header>

<section class="ui-card section">
	<h2>{l.overview.title}</h2>
	<ul class="progress">
		{#each data.progress as one (one.kind)}
			<li>
				<span class="name">{l.kinds[one.kind]}</span>
				<span class="count" class:done={one.filled === one.of}>{one.filled} / {one.of}</span>
				<span class="bar" class:done={one.filled === one.of} aria-hidden="true"><span style:width="{one.of ? (100 * one.filled) / one.of : 100}%"></span></span>
				{#if one.missing.length}
					<span class="missing">{l.overview.missing(one.missing.join(', '))}</span>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<nav class="tabs" aria-label={l.title}>
	{#each data.readable as one (one.kind)}
		<button type="button" class="tab" class:on={current === one.kind} aria-pressed={current === one.kind} onclick={() => (shown = one.kind)}>{l.kinds[one.kind]}</button>
	{/each}
	{#if data.kitchen}
		<button type="button" class="tab" class:on={current === 'kueche'} aria-pressed={current === 'kueche'} onclick={() => (shown = 'kueche')}>{l.kitchen.title}</button>
	{/if}
</nav>

<section class="ui-card section">
	{#if current === 'kueche' && data.kitchen}
		<div class="title-row">
			<h2>{l.kitchen.title}</h2>
			<a class="file" href="/fahrten/{data.trip.id}/auswertung/kueche.csv" download><Icon name="download" size={16} />{l.overview.file}</a>
		</div>
		<p class="muted">{l.kitchen.lead}</p>
		<div class="kitchen">
			<table class="data">
				<thead><tr><th>{short(l.kitchen.diet)}</th><th class="num">{short(l.kitchen.count)}</th></tr></thead>
				<tbody>
					{#each data.kitchen.diets as one (one.diet)}
						<tr><td>{one.diet === 'unbekannt' ? l.kitchen.unknown : l.diet.diets[one.diet]}</td><td class="num">{one.count}</td></tr>
					{/each}
				</tbody>
				<tfoot><tr><td>{l.kitchen.people}</td><td class="num">{data.kitchen.people}</td></tr></tfoot>
			</table>
			{#if data.kitchen.allergies.length}
				<table class="data">
					<thead><tr><th>{short(l.kitchen.allergy)}</th><th>{short(l.diet.severity)}</th><th class="num">{short(l.kitchen.count)}</th></tr></thead>
					<tbody>
						{#each data.kitchen.allergies as one (one.what + one.severity)}
							<tr class:severe={one.severity === 'schwer'}><td>{one.what}</td><td>{l.diet.severities[one.severity]}</td><td class="num">{one.count}</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
		{#if data.kitchen.named.length}
			<h3>{l.kitchen.named}</h3>
			<ul class="named">
				{#each data.kitchen.named as one (one.name)}
					<li>
						<strong>{one.name}</strong>
						<span>{[l.diet.diets[one.diet], ...one.allergies.map((a) => `${a.what} (${l.diet.severities[a.severity]})`), ...(one.dietNote ? [one.dietNote] : [])].join(' · ')}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if current !== 'kueche'}
		{@const progress = progressOf(current)}
		{@const entries = entriesOf(current)}
		<div class="title-row">
			<h2>{current === 'instrumente' ? l.instruments.forInsurer : l.kinds[current]}</h2>
			<a class="file" href="/fahrten/{data.trip.id}/auswertung/{current}.csv" download><Icon name="download" size={16} />{l.overview.file}</a>
		</div>
		<p class="readers"><Icon name="eye" size={14} />{l.readers[data.readable.find((one) => one.kind === current)?.readers ?? 'organisers']}</p>
		{#if progress?.missing.length}<p class="missing">{l.overview.missing(progress.missing.join(', '))}</p>{/if}

		{#if current === 'instrumente' && data.instruments}
			{#if data.instruments.rows.length}
				<div class="scroll">
					<table class="data">
						<thead>
							<tr><th>{short(l.columns.name)}</th><th>{short(l.instruments.name)}</th><th>{short(l.instruments.owner)}</th><th class="num">{short(l.instruments.value)}</th><th>{short(l.instruments.insurance)}</th><th>{short(l.instruments.serial)}</th><th>{short(l.instruments.confirmedAt)}</th></tr>
						</thead>
						<tbody>
							{#each data.instruments.rows as row (row.instrument.id)}
								<tr>
									<td>{row.person}</td>
									<td>{row.instrument.name}{#if row.instrument.bulky}<span class="tag">{l.instruments.bulkyShort}</span>{/if}</td>
									<td>{l.instruments.owners[row.instrument.owner]}</td>
									<td class="num">{row.instrument.value === undefined ? '–' : euro.format(row.instrument.value)}</td>
									<td>{l.instruments.insurances[row.instrument.insurance]}</td>
									<td>{row.instrument.serial ?? ''}</td>
									<td>{row.instrument.confirmedAt ? day(row.instrument.confirmedAt) : '–'}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot><tr><td colspan="3">{l.instruments.total}</td><td class="num">{euro.format(data.instruments.total)}</td><td colspan="3"></td></tr></tfoot>
					</table>
				</div>
				{#if data.instruments.bulky.length}
					<h3>{l.instruments.bulkyList}</h3>
					<p>{data.instruments.bulky.map((row) => `${row.instrument.name} (${row.person})`).join(', ')}</p>
				{/if}
			{:else}
				<p class="muted">{l.overview.noEntries}</p>
			{/if}
		{:else if !entries.length}
			<p class="muted">{l.overview.noEntries}</p>
		{:else}
			<div class="scroll">
				<table class="data">
					<thead>
						<tr>
							<th>{short(l.columns.name)}</th>
							{#if current === 'ernaehrung'}<th>{short(l.diet.diet)}</th><th>{short(l.diet.allergies)}</th><th>{short(l.diet.medication)}</th>
							{:else if current === 'wuensche'}<th>{short(l.wishes.roomWith)}</th><th>{short(l.wishes.busWith)}</th><th>{short(l.wishes.note)}</th>
							{:else if current === 'notfall'}<th>{short(l.emergency.name)}</th><th>{short(l.emergency.phone)}</th><th>{short(l.emergency.insurance)}</th>
							{:else if current === 'dokumente'}<th>{short(l.documents.validId)}</th>
							{:else if current === 'einverstaendnis'}<th>{short(l.consents.photosShort)}</th><th>{short(l.consents.travelAloneShort)}</th><th>{short(l.consents.freeTimeShort)}</th>
							{:else if current === 'fragen'}{#each data.questions as question (question.id)}<th>{question.text}</th>{/each}{/if}
						</tr>
					</thead>
					<tbody>
						{#each entries as entry (entry.name)}
							<tr>
								<td>{entry.name}{#if entry.byParent}<span class="tag">{l.byParent}</span>{/if}</td>
								{#if current === 'ernaehrung'}
									{@const d = as(entry, 'ernaehrung')}
									<td>{l.diet.diets[d.diet]}{d.dietNote ? ` · ${d.dietNote}` : ''}</td>
									<td>{d.allergies.map((a) => `${a.what} (${l.diet.severities[a.severity]})`).join(', ') || '–'}</td>
									<td class="pre">{d.medication ?? ''}</td>
								{:else if current === 'wuensche'}
									{@const d = as(entry, 'wuensche')}
									<td>{d.roomWith ?? ''}</td><td>{d.busWith ?? ''}</td><td class="pre">{d.note ?? ''}</td>
								{:else if current === 'notfall'}
									{@const d = as(entry, 'notfall')}
									<td>{d.name}</td><td><a href="tel:{d.phone.replace(/[^\d+]/g, '')}">{d.phone}</a></td><td>{d.insurance ?? ''}</td>
								{:else if current === 'dokumente'}
									<td>{yes(as(entry, 'dokumente').validId)}</td>
								{:else if current === 'einverstaendnis'}
									{@const d = as(entry, 'einverstaendnis')}
									<td>{yes(d.photos)}</td><td>{yes(d.travelAlone)}</td><td>{entry.minor ? yes(d.freeTime) : '–'}</td>
								{:else if current === 'fragen'}
									{@const d = as(entry, 'fragen')}
									{#each data.questions as question (question.id)}<td>{d[question.id] === 'ja' ? l.yes : d[question.id] === 'nein' ? l.no : (d[question.id] ?? '')}</td>{/each}
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</section>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
		color: var(--accent);
		font-weight: 600;
	}

	.head {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.muted,
	.hint,
	.readers {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		font-size: var(--text-xs);
	}

	.readers {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.section {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		min-width: 0;
	}

	.section h2 {
		font-size: var(--text-lg);
	}

	.section h3 {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	/* Each list's state as a small tile, two or three side by side on a wide screen. */
	.progress {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.progress li {
		display: grid;
		grid-template-columns: 1fr auto;
		align-content: start;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: var(--bg);
	}

	.progress .name {
		font-weight: 600;
	}

	.count {
		color: var(--warn);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}

	.count.done {
		color: var(--ok);
	}

	.bar {
		grid-column: 1 / -1;
		height: 6px;
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
	}

	.bar.done span {
		background: var(--ok);
	}

	.missing {
		grid-column: 1 / -1;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.tab {
		min-height: 36px;
		padding: 0 var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: inherit;
		font: inherit;
		transition:
			background var(--fast) var(--ease),
			border-color var(--fast) var(--ease);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.tab:hover {
		background: var(--surface-2);
	}

	.tab:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.tab.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.file {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.kitchen {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-4);
	}

	.kitchen table {
		flex: 1 1 240px;
	}

	.scroll {
		overflow-x: auto;
	}

	.data {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.data th,
	.data td {
		padding: var(--space-2);
		border-bottom: 1px solid var(--hairline);
		text-align: left;
		vertical-align: top;
	}

	.data th {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.data tfoot td {
		border-bottom: 0;
		font-weight: 700;
	}

	.data .num {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.data .pre {
		white-space: pre-line;
	}

	.severe td {
		color: var(--danger);
		font-weight: 600;
	}

	.tag {
		margin-left: var(--space-1);
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
		white-space: nowrap;
	}

	.named {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}

	.named li {
		display: grid;
		gap: 2px;
	}
</style>

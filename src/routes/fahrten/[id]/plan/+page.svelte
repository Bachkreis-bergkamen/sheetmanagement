<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { formatWeekday, type PlanEntry, type PlanItem } from '#lib/trips/trips.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const trip = $derived(data.trip);
	const day = (iso: string) => formatWeekday(iso, config.locale);
	const todayPlan = $derived(data.days.find((entry) => entry.day === data.today));
	/** Printing: each day on a page of its own, or all after each other. */
	let pagePerDay = $state(true);
	const range = (start?: string, end?: string) => (start ? (end ? `${start}–${end}` : start) : '');
</script>

<Title title={t.trips.days.title(trip.title)} />

<a class="back no-print" href="/fahrten/{trip.id}"><Icon name="back" size={16} />{trip.title}</a>

<header class="head">
	<h1>{t.trips.days.title(trip.title)}</h1>
</header>

<div class="toolbar no-print">
	{#if data.running}
		<nav class="views" aria-label={t.trips.plan}>
			<a href="?ansicht=heute" aria-current={data.view === 'today' ? 'page' : undefined}>{t.trips.days.today}</a>
			<a href="?ansicht=alle" aria-current={data.view === 'all' ? 'page' : undefined}>{t.trips.days.whole}</a>
		</nav>
	{/if}
	<label class="per-day"><input type="checkbox" bind:checked={pagePerDay} />{t.trips.days.pagePerDay}</label>
	<button type="button" class="btn secondary small" onclick={() => window.print()}><Icon name="print" size={16} />{t.trips.days.print}</button>
</div>

{#if form?.error}<p class="msg error no-print" role="alert">{form.error}</p>{/if}

{#snippet itemForm(item: Partial<PlanItem> & { day: string })}
	<form method="POST" action="?/save" class="item-form" use:enhance={saving.submit({ reset: !item.id })}>
		{#if item.id}<input type="hidden" name="id" value={item.id} />{/if}
		<div class="row">
			<label class="field grow">{t.trips.days.fields.title}<input name="title" required maxlength="120" value={item.title ?? ''} placeholder={t.trips.days.fields.titleHint} /></label>
			<label class="field">
				{t.trips.days.fields.kind}
				<select name="kind">
					{#each data.kinds as kind (kind)}
						<option value={kind} selected={(item.kind ?? 'tutti') === kind}>{t.trips.days.kinds[kind]}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="row">
			<label class="field">
				{t.trips.days.fields.day}
				<select name="day">
					{#each data.days as option, i (option.day)}
						<option value={option.day} selected={option.day === item.day}>{t.trips.days.day(i + 1)} · {day(option.day)}</option>
					{/each}
				</select>
			</label>
			<label class="field">{t.trips.days.fields.start}<input type="time" name="start" step="300" value={item.start ?? ''} /></label>
			<label class="field">{t.trips.days.fields.end}<input type="time" name="end" step="300" value={item.end ?? ''} /></label>
		</div>
		<div class="row">
			<label class="field">{t.trips.days.fields.place}<input name="place" maxlength="200" value={item.place ?? ''} /></label>
			<label class="field">{t.trips.days.fields.audience}<input name="audience" maxlength="120" value={item.audience ?? ''} placeholder={t.trips.days.fields.audienceHint} /></label>
		</div>
		<label class="field">{t.trips.days.fields.note}<textarea name="note" rows="2" maxlength="2000">{item.note ?? ''}</textarea></label>
		<label class="check"><input type="checkbox" name="notify" checked={data.running} />{t.trips.days.fields.notify}</label>
		<div><button class="btn small" disabled={saving.busy}>{t.trips.days.save}</button></div>
	</form>
{/snippet}

{#snippet entry(entry: PlanEntry)}
	{#if entry.item}
		{@const item = entry.item}
		<li class="entry kind-{item.kind}">
			<span class="time">{range(item.start, item.end)}</span>
			<span class="what">
				<span class="title">{item.title}</span>
				<span class="details">
					<span class="tag">{t.trips.days.kinds[item.kind]}</span>
					{#if item.place}<span><Icon name="pin" size={12} />{item.place}</span>{/if}
					{#if item.audience}<span>{t.trips.days.forWhom}: {item.audience}</span>{/if}
				</span>
				{#if item.note}<span class="note">{item.note}</span>{/if}
				{#if data.organises}
					<details class="edit no-print">
						<summary>{t.trips.days.edit}</summary>
						{@render itemForm(item)}
						<form method="POST" action="?/remove" use:enhance={saving.submit()}>
							<input type="hidden" name="id" value={item.id} />
							<label class="check"><input type="checkbox" name="notify" checked={data.running} />{t.trips.days.fields.notify}</label>
							<button class="btn ghost small remove" disabled={saving.busy}><Icon name="trash" size={14} />{t.trips.days.remove}</button>
						</form>
					</details>
				{/if}
			</span>
		</li>
	{:else}
		{@const event = entry.event}
		<li class="entry event kind-{event.type}">
			<span class="time">{range(event.start, event.end)}</span>
			<span class="what">
				<a class="title" href="/kalender/{event.id}">{event.title}</a>
				<span class="details">
					<span class="tag"><Icon name="calendar" size={12} />{t.trips.days.calendar}</span>
					{#if event.location}<span><Icon name="pin" size={12} />{event.location}</span>{/if}
					{#if event.type === 'probe' || event.type === 'generalprobe'}
						<a class="no-print" href="/kalender/{event.id}/probenplan">{t.trips.days.rehearsalPlan}</a>
					{/if}
				</span>
			</span>
		</li>
	{/if}
{/snippet}

{#if data.view === 'today' && data.current}
	<!-- During the trip, on the phone: what's on now, what's next, and the rest of today. -->
	<section class="now-next">
		<div class="ui-card now">
			<p class="over">{t.trips.days.now} · {data.time}</p>
			{#if data.current.now.length}
				<ul class="entries">{#each data.current.now as current, i (i)}{@render entry(current)}{/each}</ul>
			{:else}
				<p class="muted">{t.trips.days.nothingNow}</p>
			{/if}
		</div>
		<div class="ui-card next">
			<p class="over">{t.trips.days.next}</p>
			{#if data.current.next}
				<ul class="entries">{@render entry(data.current.next)}</ul>
			{:else}
				<p class="muted">{t.trips.days.done}</p>
			{/if}
		</div>
	</section>
	{#if todayPlan}
		<section class="day ui-card">
			<h2>{t.trips.days.today} · {day(todayPlan.day)}{#if todayPlan.places.length}<span class="places">{todayPlan.places.join(', ')}</span>{/if}</h2>
			{#if todayPlan.entries.length}
				<ul class="entries">{#each todayPlan.entries as one, i (i)}{@render entry(one)}{/each}</ul>
			{:else}
				<p class="muted">{t.trips.days.empty}</p>
			{/if}
		</section>
	{/if}
{:else}
	<div class="days" class:page-per-day={pagePerDay}>
		{#each data.days as plan, i (plan.day)}
			<section class="day ui-card">
				<h2>
					<span class="number">{t.trips.days.day(i + 1)}</span>
					{day(plan.day)}
					{#if plan.places.length}<span class="places">{plan.places.join(', ')}</span>{/if}
				</h2>
				{#if plan.entries.length}
					<ul class="entries">{#each plan.entries as one, j (j)}{@render entry(one)}{/each}</ul>
				{:else}
					<p class="muted">{t.trips.days.empty}</p>
				{/if}
				{#if data.organises}
					<details class="add no-print">
						<summary><Icon name="plus" size={16} />{t.trips.days.add}</summary>
						{@render itemForm({ day: plan.day })}
					</details>
				{/if}
			</section>
		{/each}
	</div>
{/if}

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
		margin-bottom: var(--space-4);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.views {
		display: inline-flex;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.views a {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-weight: 600;
	}

	.views a[aria-current='page'] {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm, none);
	}

	.per-day {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.now-next {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.now,
	.next {
		padding: var(--space-4);
	}

	.now {
		border-color: var(--accent);
	}

	.over {
		margin-bottom: var(--space-2);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.days {
		display: grid;
		gap: var(--space-4);
	}

	.day {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.day h2 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		font-size: var(--text-lg);
	}

	.number {
		color: var(--accent);
	}

	.places {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.entries {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.entry {
		display: grid;
		grid-template-columns: 7.5em 1fr;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--hairline);
	}

	.entry:first-child {
		border-top: 0;
	}

	.time {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.what {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.title {
		font-weight: 650;
	}

	a.title {
		color: var(--accent);
	}

	.details {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.details span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.tag {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.kind-konzert .tag,
	.event.kind-konzert .title {
		color: var(--accent);
	}

	.note {
		color: var(--text-muted);
		font-size: var(--text-sm);
		white-space: pre-line;
	}

	.muted {
		color: var(--text-muted);
	}

	.edit summary,
	.add summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.item-form {
		display: grid;
		gap: var(--space-3);
		margin: var(--space-3) 0;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.row .field {
		flex: 1 1 140px;
	}

	.row .grow {
		flex: 3 1 220px;
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}

	.remove {
		color: var(--danger);
	}

	/* On a phone the time sits above the item. */
	@media (max-width: 520px) {
		.entry {
			grid-template-columns: 1fr;
			gap: 2px;
		}
	}

	/* Printed: A4, black on white; a page per day unless that's turned off. */
	@media print {
		.day {
			border: 0;
			box-shadow: none;
			break-inside: avoid;
		}

		.page-per-day .day + .day {
			break-before: page;
		}

		.entry {
			grid-template-columns: 7.5em 1fr;
		}
	}
</style>

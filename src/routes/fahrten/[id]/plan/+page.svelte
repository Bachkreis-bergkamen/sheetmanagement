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
	// The day's block, like every list of dates: weekday, day and month stacked.
	const dateParts = (iso: string) => {
		const date = new Date(`${iso}T00:00:00Z`);
		const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(config.locale, { ...options, timeZone: 'UTC' }).format(date);
		return { weekday: part({ weekday: 'short' }), day: part({ day: 'numeric' }).replace('.', ''), month: part({ month: 'short' }) };
	};
	// Rehearsals in the accent's tint, the concert in the accent, the rest quiet.
	const tone = (kind: string) => (kind === 'konzert' ? 'concert' : ['tutti', 'register', 'soundcheck', 'probe', 'generalprobe'].includes(kind) ? 'music' : 'plain');
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

{#snippet dayHead(iso: string, label: string, places: string[])}
	{@const date = dateParts(iso)}
	<header class="day-head">
		<span class="date" aria-hidden="true"><span class="small">{date.weekday}</span><span class="big">{date.day}</span><span class="small">{date.month}</span></span>
		<h2>
			<span>{label}<span class="sr-only">, {day(iso)}</span></span>
			{#if places.length}<span class="places"><Icon name="pin" size={14} />{places.join(', ')}</span>{/if}
		</h2>
	</header>
{/snippet}

{#snippet entry(entry: PlanEntry)}
	{#if entry.item}
		{@const item = entry.item}
		<li class="entry {tone(item.kind)}">
			<span class="time">{range(item.start, item.end)}</span>
			<span class="dot" aria-hidden="true"></span>
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
						<summary><Icon name="edit" size={14} />{t.trips.days.edit}</summary>
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
		<li class="entry event {tone(event.type)}">
			<span class="time">{range(event.start, event.end)}</span>
			<span class="dot" aria-hidden="true"></span>
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
			{@render dayHead(todayPlan.day, t.trips.days.today, todayPlan.places)}
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
				{@render dayHead(plan.day, t.trips.days.day(i + 1), plan.places)}
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
		min-height: 32px;
		margin-bottom: var(--space-2);
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
		margin-bottom: var(--space-5);
	}

	/* Today or all days: a segmented control like elsewhere in the app. */
	.views {
		display: inline-flex;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.views a {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		padding: 0 var(--space-4);
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.views a[aria-current='page'] {
		background: var(--surface-lifted);
		color: var(--text);
		box-shadow: var(--shadow);
	}

	.per-day {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.per-day input {
		accent-color: var(--accent);
	}

	/* During the trip: now and next side by side, now in the accent's tint. */
	.now-next {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.now,
	.next {
		padding: var(--space-4) var(--space-5);
	}

	.now {
		border-color: color-mix(in oklab, var(--accent) 40%, transparent);
		background: color-mix(in oklab, var(--accent) 6%, var(--surface));
	}

	.over {
		margin-bottom: var(--space-2);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.now-next .entry {
		grid-template-columns: 6.5em 1fr;
	}

	.now-next .dot {
		display: none;
	}

	.days {
		display: grid;
		gap: var(--space-4);
	}

	.day {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-5);
	}

	/* The day: its date block, then which day of the trip and where. */
	.day-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-1);
	}

	.date {
		display: grid;
		justify-items: center;
		flex: none;
		width: 52px;
		padding: var(--space-1) 0;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
		line-height: 1.1;
	}

	.date .small {
		font-size: var(--text-2xs);
		font-weight: 650;
		text-transform: uppercase;
	}

	.date .big {
		font-size: var(--text-xl);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.day-head h2 {
		display: grid;
		gap: 2px;
		font-size: var(--text-lg);
	}

	.places {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	/* The day's items down a line: the time, a dot on the line, what happens. */
	.entries {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.entry {
		--tone: var(--text-muted);
		display: grid;
		grid-template-columns: 6.5em 16px 1fr;
		gap: 0 var(--space-3);
	}

	.entry.music,
	.entry.concert {
		--tone: var(--accent);
	}

	.time,
	.what {
		padding: var(--space-2) 0 var(--space-3);
	}

	.time {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		line-height: 1.6;
		text-align: right;
	}

	/* The line runs through every item; it starts at the first dot and ends at the last. */
	.dot {
		position: relative;
		background: linear-gradient(var(--border), var(--border)) center / 2px 100% no-repeat;
	}

	.entry:first-child .dot {
		background-position: center calc(var(--space-2) + 0.7em);
	}

	.entry:last-child .dot {
		background-size: 2px calc(var(--space-2) + 0.7em);
		background-position: center top;
	}

	.entry:only-child .dot {
		background: none;
	}

	.dot::before {
		content: '';
		position: absolute;
		top: calc(var(--space-2) + 0.7em);
		left: 50%;
		width: 10px;
		height: 10px;
		border: 2px solid var(--tone);
		border-radius: 50%;
		background: var(--surface);
		transform: translate(-50%, -50%);
	}

	.entry.concert .dot::before {
		width: 14px;
		height: 14px;
		background: var(--tone);
	}

	.what {
		display: grid;
		align-content: start;
		gap: 4px;
		min-width: 0;
	}

	.title {
		font-weight: 650;
	}

	a.title {
		color: var(--text);
	}

	a.title:hover {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.details {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.details span,
	.details a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.details a {
		color: var(--accent);
		font-weight: 600;
	}

	.tag {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-2xs);
		font-weight: 650;
	}

	.music .tag {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.concert .tag {
		background: var(--accent);
		color: var(--accent-contrast);
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
		min-height: 32px;
		list-style: none;
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.edit summary::-webkit-details-marker,
	.add summary::-webkit-details-marker {
		display: none;
	}

	.edit summary {
		color: var(--text-muted);
	}

	.edit summary:hover,
	.edit[open] summary {
		color: var(--accent);
	}

	/* Adding to a day: a quiet dashed row at its foot. */
	.add {
		border: 1px dashed var(--border);
		border-radius: var(--radius-m);
		transition: border-color var(--fast) var(--ease);
	}

	.add:hover {
		border-color: var(--accent);
	}

	.add summary {
		justify-content: center;
		width: 100%;
		min-height: var(--tap);
		color: var(--accent);
	}

	.add[open] {
		padding: 0 var(--space-4);
		border-style: solid;
		border-color: var(--hairline);
		background: var(--bg);
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

	.check input {
		accent-color: var(--accent);
	}

	.remove {
		color: var(--danger);
	}

	/* On a phone the time sits above the item, both beside the line. */
	@media (max-width: 520px) {
		.day {
			padding: var(--space-4);
		}

		.entry {
			grid-template-columns: 16px 1fr;
			grid-template-areas: 'dot time' 'dot what';
		}

		.time {
			grid-area: time;
			padding-bottom: 0;
			text-align: left;
		}

		.dot {
			grid-area: dot;
		}

		.what {
			grid-area: what;
			padding-top: 2px;
		}

		.now-next .entry {
			grid-template-columns: 1fr;
			grid-template-areas: 'time' 'what';
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
	}
</style>

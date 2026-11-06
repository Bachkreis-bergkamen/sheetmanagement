<script lang="ts">
	import { page } from '$app/state';
	import { config } from '#lib/config/index.ts';
	import { dateFormat } from '#lib/events/format.ts';
	import { t } from '#lib/i18n/index.ts';
	import { pollDatesByMonth, type PollDate } from '#lib/polls/polls.ts';
	import type { ShownEvent } from '#lib/events/schedule.ts';
	import AddEventForm from '#lib/components/AddEventForm.svelte';
	import CalendarView from '#lib/components/CalendarView.svelte';
	import ConcertRow from '#lib/components/ConcertRow.svelte';
	import Nothing from '#lib/components/Nothing.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import EventRow from '#lib/components/EventRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import FilterPanel from '#lib/components/FilterPanel.svelte';
	import { applyFilters, type FilterGroup } from '#lib/filters.ts';
	import Segmented from '#lib/components/Segmented.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();

	/** Several at once, as in the archive: any within a group, all across groups. */
	let chosen = $state<string[]>([]);
	// "Probe eintragen" on a concert's page lands here with the form open and the concert chosen.
	let adding = $state(page.url.searchParams.has('neu'));

	// svelte-ignore state_referenced_locally
	let view = $state(data.view);
	/** Remembered in a cookie, so the next visit starts in the same view without a jump. */
	function show(next: 'list' | 'calendar') {
		view = next;
		document.cookie = `konzerte-ansicht=${next === 'calendar' ? 'kalender' : 'liste'}; path=/kalender; max-age=31536000; samesite=lax`;
	}

	export const snapshot = {
		capture: () => chosen,
		restore: (value: string[]) => (chosen = Array.isArray(value) ? value : [])
	};

	const isRehearsal = (event: ShownEvent) => event.type === 'probe' || event.type === 'generalprobe';
	const answerOf = (event: ShownEvent) => data.answers?.[event.id] ?? 'open';
	const filterGroups = $derived(
		[
			{
				key: 'kind',
				label: t.concerts.filters.kind,
				options: [
					{ value: 'art:konzerte', label: t.concerts.filters.concerts, test: (event: ShownEvent) => event.type === 'konzert' },
					{ value: 'art:proben', label: t.concerts.filters.rehearsals, test: isRehearsal }
				]
			},
			// Only for someone who answers dates: what they still owe, and what they said.
			...(data.answers
				? [
						{
							key: 'answer',
							label: t.concerts.filters.answer,
							options: (['open', 'yes', 'maybe', 'no'] as const).map((answer) => ({
								value: `antwort:${answer}`,
								label: t.signups.status[answer],
								test: (event: ShownEvent) => answerOf(event) === answer
							}))
						}
					]
				: [])
		] satisfies FilterGroup<ShownEvent>[]
	);
	const calendarEvents = $derived(applyFilters(data.events, filterGroups, chosen));
	const shown = $derived(applyFilters(data.upcoming, filterGroups, chosen));
	/** Concerts only, or rehearsals only: what goes with them (polls, past concerts) follows. */
	const onlyConcerts = $derived(chosen.includes('art:konzerte') && !chosen.includes('art:proben'));
	const onlyRehearsals = $derived(chosen.includes('art:proben') && !chosen.includes('art:konzerte'));

	/** The very next date stands out in the list. */
	const next = $derived(shown[0]?.id);

	// Open polls' proposed days sit in the calendar too, dashed: not booked yet.
	const pollMonths = $derived(pollDatesByMonth(data.polls, data.today));
	const pollDays = $derived.by(() => {
		const days: Record<string, { id: string; title: string }[]> = {};
		for (const entries of pollMonths.values()) for (const { poll, days: list } of entries) for (const day of list) (days[day] ??= []).push(poll);
		return days;
	});
	const pollById = $derived(new Map(data.polls.map((poll) => [poll.id, poll])));
	/** Polls still waiting for your answer: one quiet line above the dates. */
	const waiting = $derived(data.polls.filter((poll) => !poll.answered));

	const monthLabel = (key: string) => dateFormat(config.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
	const shortDay = (day: string) => dateFormat(config.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

	const months = $derived.by(() => {
		const result = new Map<string, { key: string; label: string; events: ShownEvent[]; polls: PollDate[] }>();
		for (const event of shown) {
			if (!result.has(event.date.monthKey)) result.set(event.date.monthKey, { key: event.date.monthKey, label: event.date.monthLabel, events: [], polls: [] });
			result.get(event.date.monthKey)!.events.push(event);
		}
		// Polls are about dates still to agree on; they're left out when only concerts are shown.
		if (!onlyConcerts) {
			for (const [key, polls] of pollMonths) {
				if (!result.has(key)) result.set(key, { key, label: monthLabel(key), events: [], polls: [] });
				result.get(key)!.polls = polls;
			}
		}
		return [...result.values()].sort((a, b) => a.key.localeCompare(b.key));
	});

	const pastYears = $derived.by(() => {
		const result: { label: string; concerts: typeof data.past }[] = [];
		for (const concert of data.past) {
			const label = concert.label?.year ?? t.concert.dateUnknown;
			if (result.at(-1)?.label !== label) result.push({ label, concerts: [] });
			result.at(-1)!.concerts.push(concert);
		}
		return result;
	});

	const views = [
		{ value: 'list' as const, label: t.concerts.list, icon: 'menu' as const },
		{ value: 'calendar' as const, label: t.concerts.calendar, icon: 'calendar' as const }
	];
</script>

<Title title={t.concerts.title} />
<PageHeader title={t.concerts.title} lead={t.concerts.lead} />

{#if data.error === 'not-configured'}
	<EmptyState icon="calendar" text={t.concerts.empty} />
{:else if data.error}
	<div class="notice">
		<p>{t.concerts.failed}</p>
		<a href="/status">{t.pieces.checkStatus}</a>
	</div>
{/if}

{#if waiting.length}
	<a class="waiting" href={waiting.length === 1 ? `/termine/${encodeURIComponent(waiting[0].id)}` : '/termine'}>
		<Icon name="poll" size={18} />
		<span>{t.calendar.polls.waiting(waiting.length, waiting[0].title)}</span>
		<Icon name="chevron" size={16} />
	</a>
{/if}

{#if !data.error}
	<!-- One row: what to show on the left, how to show it on the right. -->
	<div class="toolbar">
		<FilterPanel bind:value={chosen} items={view === 'calendar' ? data.events : data.upcoming} groups={filterGroups} label={t.pieces.filter} />
		<div class="toolbar-end">
			{#if data.adding}
				<button class="btn small" class:secondary={adding} aria-expanded={adding} aria-controls="termin" onclick={() => (adding = !adding)}>
					<Icon name="plus" size={16} />{t.calendar.add.short}
				</button>
			{/if}
			<Segmented options={views} value={view} label={t.concerts.view} iconOnly onchange={show} />
		</div>
	</div>

	{#if data.adding}
		<div class="add-event" id="termin">
			<AddEventForm
				calendar={data.adding.calendar}
				archive={data.adding.archive}
				writable={data.adding.writable}
				orchestras={data.adding.orchestras}
				concerts={data.adding.concerts}
				today={data.today}
				last={data.adding.last}
				bind:open={adding}
				result={form}
				preset={{ type: page.url.searchParams.get('neu') ?? undefined, concert: page.url.searchParams.get('konzert') ?? undefined }}
			/>
		</div>
	{/if}

	{#if view === 'calendar'}
		<CalendarView events={calendarEvents} today={data.today} concertTitles={data.concertTitles} pollDays={onlyConcerts ? {} : pollDays} />
	{:else if months.length === 0}
		<Nothing text={t.concerts.noUpcoming} glyphs={['timpani', 'violin', 'voice']} />
	{:else}
		{#each months as month (month.key)}
			<h2 class="ui-label month">{month.label}</h2>
			<ul class="ui-list">
				{#each month.events as event (event.id)}
					<li class:next={event.id === next}>
						<EventRow
							{event}
							concertTitle={event.concertId ? data.concertTitles[event.concertId] : undefined}
							badge={event.id === next ? t.concerts.next : undefined}
							answer={data.answers ? (data.answers[event.id] ?? null) : undefined}
						/>
					</li>
				{/each}
				{#each month.polls as { poll, days } (poll.id)}
					<li class="proposed">
						<a class="poll" href="/termine/{encodeURIComponent(poll.id)}">
							<span class="poll-icon"><Icon name="poll" size={18} /></span>
							<span class="poll-body">
								<strong>{poll.title}</strong>
								<span>{t.calendar.polls.candidate} · {days.map(shortDay).join(', ')}</span>
							</span>
							{#if pollById.get(poll.id) && !pollById.get(poll.id)?.answered}<span class="dot" title={t.polls.yourTurn}><span class="sr-only">{t.polls.yourTurn}</span></span>{/if}
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/each}
			</ul>
		{/each}
	{/if}
{/if}

{#if pastYears.length > 0 && !onlyRehearsals}
	<!-- Folded away: the page is about what's coming. -->
	<details class="past-block">
		<summary class="section past"><Icon name="history" size={20} />{t.concerts.past} <span class="past-count">{data.past.length}</span></summary>
		{#each pastYears as year (year.label)}
			<h3 class="ui-label month">{year.label}</h3>
			<ul class="ui-list">
				{#each year.concerts as concert (concert.id)}
					<li><ConcertRow {concert} /></li>
				{/each}
			</ul>
		{/each}
	</details>
{/if}

{#if data.subscribeUrl && !data.error}
	<div class="ui-actions subscribe">
		<!-- Signed in: the personal feed with own answers and the plan first (#122); the shared calendar stays. -->
		{#if page.data.user}<a href="/profil#kalender"><Icon name="calendar" size={16} />{t.concerts.ownCalendar}</a>{/if}
		<a href={data.subscribeUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16} />{t.concerts.subscribe}</a>
		{#if data.plans}<a href="/termine"><Icon name="poll" size={16} />{t.calendar.polls.new}</a>{/if}
	</div>
{/if}


<style>
	.waiting {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.waiting span {
		flex: 1;
	}

	.toolbar-end {
		display: flex;
		margin-left: auto;
		align-items: center;
		gap: var(--space-2);
	}

	.add-event:has(:global(.add)) {
		margin-bottom: var(--space-5);
	}

	.poll {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-height: 64px;
		padding: var(--space-3) var(--space-4);
		color: inherit;
		transition: background var(--fast) var(--ease);
	}

	.poll:hover {
		background: var(--surface-2);
	}

	.poll > :global(svg:last-child) {
		flex: none;
		color: var(--text-muted);
	}

	.poll-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 52px;
		height: 40px;
		border: 1.5px dashed color-mix(in oklab, var(--accent) 55%, transparent);
		border-radius: var(--radius-control);
		color: var(--accent);
	}

	.poll-body {
		display: grid;
		flex: 1;
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.poll-body strong {
		color: var(--text);
		font-size: var(--text-md);
		font-weight: 600;
	}

	/* Your answer is missing: a small dot, like an unread mark. */
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: var(--radius-pill);
		background: var(--accent);
	}

	/* One row on every screen: what to show, then adding and the view. */
	.toolbar {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	li.next {
		background: color-mix(in oklab, var(--accent) 6%, transparent);
	}

	.past-block summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.past-block summary :global(svg) {
		color: var(--text-muted);
	}

	.past-count {
		color: var(--text-muted);
		font-family: var(--font-sans, inherit);
		font-size: var(--text-md);
	}

	.subscribe {
		justify-content: center;
		margin-top: var(--space-6);
	}

	.section {
		margin: var(--space-5) 0 var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}

	.section.past {
		margin-top: var(--space-7);
	}

	.month {
		margin-top: var(--space-5);
	}

	.month:first-of-type {
		margin-top: 0;
	}

	.notice {
		display: grid;
		gap: var(--space-3);
		justify-items: center;
		padding: var(--space-5) var(--space-4);
		text-align: center;
		color: var(--text-muted);
	}

	.notice a {
		color: var(--accent);
		font-weight: 600;
	}

</style>

<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import type { ShownEvent } from '#lib/events/schedule.ts';
	import type { Answer } from '#lib/signups/signups.ts';
	import Icon from './Icon.svelte';

	let {
		event,
		concertTitle,
		showRelative = true,
		badge,
		answer
	}: {
		event: ShownEvent;
		concertTitle?: string;
		showRelative?: boolean;
		badge?: string;
		/** The member's answer for an upcoming date; null: not answered yet, undefined: no sign-ups. */
		answer?: Answer | null;
	} = $props();

	const ANSWER_ICONS = { yes: 'check', maybe: 'minus', no: 'x', open: 'bell' } as const;
	const answered = $derived(answer === undefined || event.past ? null : (answer ?? 'open'));
	// The title leads; the type and the concert are said again only when the title doesn't say them.
	const typeLabel = $derived(t.concerts.types[event.type]);
	const saysType = $derived(event.displayTitle.toLowerCase().includes(typeLabel.toLowerCase()));
	const saysConcert = $derived(!!concertTitle && event.displayTitle.toLowerCase().includes(concertTitle.toLowerCase()));
</script>

<a class="row {event.type}" class:past={event.past && showRelative} href="/kalender/{encodeURIComponent(event.id)}">
	<span class="date" aria-hidden="true">
		<span class="weekday">{event.date.weekday}</span>
		<span class="day">{event.date.day}</span>
		<span class="month">{event.date.month}</span>
	</span>
	<span class="body">
		<span class="title">
			{event.displayTitle}
			{#if badge}<span class="badge">{badge}</span>{/if}
		</span>
		<span class="meta">
			<span class="sr">{event.date.long}</span>
			{#if !saysType}<span class="type">{typeLabel}</span>{' · '}{/if}
			{#if showRelative && !event.past}<span class="relative">{t.concerts.relative(event.daysUntil)}</span>{' · '}{/if}
			{event.date.time || t.concerts.allDay}
			<!-- The venue's name; the full address is on the event's page. -->
			{#if event.location}{' · '}{event.location.split(',')[0].trim()}{/if}
			{#if concertTitle && event.type !== 'konzert' && !saysConcert}{' · '}{t.concerts.forConcert(concertTitle)}{/if}
		</span>
		{#if answered || event.tentative}
			<span class="pills">
				{#if answered}
					<span class="answer {answered}"><Icon name={ANSWER_ICONS[answered]} size={14} />{t.signups.status[answered]}</span>
				{/if}
				{#if event.tentative}<span class="tentative">{t.concerts.tentative}</span>{/if}
			</span>
		{/if}
	</span>
	<span class="chevron"><Icon name="chevron" size={16} /></span>
</a>

<style>
	.row {
		--tone: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-height: 72px;
		padding: var(--space-3) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	.row:hover {
		background: var(--surface-2);
	}

	/* A past rehearsal in a list of upcoming ones. */
	.row.past {
		opacity: 0.55;
	}

	.row.konzert {
		--tone: var(--accent);
	}

	.row.generalprobe {
		--tone: var(--warn);
	}

	.date {
		display: grid;
		justify-items: center;
		flex: none;
		width: 52px;
		padding: var(--space-1) 0;
		border-radius: var(--radius-control);
		background: color-mix(in oklab, var(--tone) 12%, transparent);
		color: var(--tone);
		line-height: 1.1;
	}

	.row.konzert .date {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.weekday,
	.month {
		font-size: var(--text-2xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.day {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.body {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.type {
		color: var(--tone);
		font-weight: 600;
	}

	.row:not(.konzert):not(.generalprobe) .type {
		color: var(--text-muted);
	}

	.relative {
		color: var(--text);
		font-weight: 500;
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: 2px;
	}

	.tentative {
		padding: 1px 8px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.badge {
		display: inline-block;
		margin-left: var(--space-1);
		padding: 0 7px;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.03em;
		vertical-align: 0.15em;
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.row.konzert .title {
		font-size: var(--text-lg);
	}

	.meta {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	/* Your answer, in its colour; a date still waiting for one stands out most. */
	.answer {
		--answer: var(--text-muted);
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 8px 1px 6px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--answer) 12%, transparent);
		color: var(--answer);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.answer.yes {
		--answer: var(--ok);
	}

	.answer.maybe {
		--answer: var(--warn);
	}

	.answer.no {
		--answer: var(--danger);
	}

	.answer.open {
		--answer: var(--accent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 45%, transparent);
	}

	.chevron {
		display: grid;
		flex: none;
		color: var(--text-muted);
		transition: transform 0.15s;
	}

	.row:hover .chevron {
		transform: translateX(2px);
		color: var(--accent);
	}
</style>

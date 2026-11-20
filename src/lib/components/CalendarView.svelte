<script lang="ts">
	import { page } from '$app/state';
	import { config } from '#lib/config/index.ts';
	import { addMonths, eventDayKey, monthGrid } from '#lib/events/calendar.ts';
	import { dateFormat } from '#lib/events/format.ts';
	import type { ShownEvent } from '#lib/events/schedule.ts';
	import * as t from '#lib/i18n/texts.ts';
	import EventRow from './EventRow.svelte';
	import Icon from './Icon.svelte';

	/**
	 * A month grid of rehearsals and concerts. On wide screens the days show the titles;
	 * on phones coloured dots, and the picked day's events are listed below the grid.
	 */
	let {
		events,
		today,
		concertTitles,
		pollDays = {}
	}: {
		events: ShownEvent[];
		today: string;
		concertTitles: Record<string, string>;
		/** Days that open date polls propose (#95), with the polls: a dashed ring, and listed below. */
		pollDays?: Record<string, { id: string; title: string }[]>;
	} = $props();

	const byDay = $derived.by(() => {
		const map = new Map<string, ShownEvent[]>();
		for (const event of events) {
			const key = eventDayKey(event.date);
			map.set(key, [...(map.get(key) ?? []), event]);
		}
		return map;
	});

	// svelte-ignore state_referenced_locally
	let month = $state(today.slice(0, 7));
	// svelte-ignore state_referenced_locally
	let selected = $state(today);
	const weeks = $derived(monthGrid(month));
	const label = $derived(dateFormat(config.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)));
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) => dateFormat(config.locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))))
	);
	const selectedEvents = $derived(byDay.get(selected) ?? []);
	const selectedPolls = $derived(pollDays[selected] ?? []);
	const selectedLabel = $derived(
		dateFormat(config.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${selected}T00:00:00Z`))
	);

	/** A concert day is a stage; otherwise the Generalprobe, then a rehearsal, gets the sticker. */
	const RANK = { konzert: 0, generalprobe: 1, probe: 2, sonstiges: 3 } as const;
	const mainType = (events: ShownEvent[]) =>
		events.reduce<ShownEvent['type'] | null>((best, e) => (best === null || RANK[e.type] < RANK[best] ? e.type : best), null);
	/**
	 * Stuck on by hand: each sticker somewhere else in the free part of the day, at its own
	 * angle and size, cut a little lopsided. Derived from the date, so a day looks the same
	 * on every visit. --px and --py run from 0 to 1; the CSS maps them to the free area.
	 */
	function placement(key: string) {
		let hash = 2166136261;
		for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
		// Mix the bits, so neighbouring dates don't land on similar values.
		hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
		hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
		hash ^= hash >>> 16;
		// A second stream of bits for the shape, so it doesn't follow the position.
		let more = Math.imul(hash ^ 0x9e3779b9, 2654435761);
		more ^= more >>> 15;
		const unit = (source: number, bits: number) => ((source >>> bits) & 0xff) / 255;
		const pick = (bits: number, range: number) => unit(hash, bits) * 2 * range - range;
		// Lopsided: each corner of the circle a little rounder or flatter.
		const corner = (bits: number) => Math.round(42 + unit(more, bits) * 16);
		return {
			'--tilt': `${pick(0, 25).toFixed(1)}deg`,
			'--px': unit(hash, 8).toFixed(2),
			'--py': unit(hash, 16).toFixed(2),
			'--size': (0.86 + unit(more, 0) * 0.3).toFixed(2),
			'--radius': `${corner(4)}% ${corner(8)}% ${corner(12)}% ${corner(16)}% / ${corner(20)}% ${corner(24)}% ${corner(2)}% ${corner(6)}%`,
			edge: `url(#paper-edge-${(hash >>> 24) % 3})`
		};
	}
	const stickerStyle = (key: string) => {
		const { edge, ...vars } = placement(key);
		return `${Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(';')};--edge:${edge}`;
	};

	function go(step: number) {
		month = addMonths(month, step);
		// The first day with an event, else the 1st, so the list below isn't from another month.
		const first = monthGrid(month)
			.flat()
			.find((day) => day.inMonth && byDay.has(day.key));
		selected = first?.key ?? (today.startsWith(month) ? today : `${month}-01`);
	}
</script>

<div class="calendar">
	<!-- Rough, paper-like edges for the stickers: three cuts, so neighbours differ. Only the
	     paper backing is filtered; the logo on it stays sharp. -->
	<svg class="filters" width="0" height="0" aria-hidden="true" focusable="false">
		{#each [{ seed: 3, frequency: 0.09 }, { seed: 11, frequency: 0.13 }, { seed: 27, frequency: 0.17 }] as cut, i (cut.seed)}
			<filter id="paper-edge-{i}" x="-25%" y="-25%" width="150%" height="150%">
				<feTurbulence type="fractalNoise" baseFrequency={cut.frequency} numOctaves="3" seed={cut.seed} result="noise" />
				<feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
			</filter>
		{/each}
	</svg>
	<div class="head">
		<button class="nav" onclick={() => go(-1)} aria-label={t.concerts.previousMonth}><Icon name="back" size={18} /></button>
		<h3 aria-live="polite">{label}</h3>
		<button class="nav next" onclick={() => go(1)} aria-label={t.concerts.nextMonth}><Icon name="back" size={18} /></button>
		{#if !today.startsWith(month)}
			<button class="to-today" onclick={() => ((month = today.slice(0, 7)), (selected = today))}>{t.concerts.today}</button>
		{/if}
	</div>

	<div class="grid" role="grid" aria-label={label}>
		<div class="row weekdays" role="row">
			{#each weekdays as weekday (weekday)}<span role="columnheader">{weekday}</span>{/each}
		</div>
		{#each weeks as week (week[0].key)}
			<div class="row" role="row">
				{#each week as day (day.key)}
					{@const dayEvents = byDay.get(day.key) ?? []}
					{@const main = mainType(dayEvents)}
					{@const dayPolls = pollDays[day.key] ?? []}
					<div
						class="day"
						class:stage={main === 'konzert'}
						class:tentative-day={dayEvents.length > 0 && dayEvents.every((e) => e.tentative)}
						class:other={!day.inMonth}
						class:today={day.key === today}
						class:selected={day.key === selected}
						class:past={day.key < today}
						class:poll-day={dayPolls.length > 0}
						role="gridcell"
					>
						<button class="number" onclick={() => (selected = day.key)} aria-pressed={day.key === selected} aria-label="{day.day}. {[...dayEvents.map((e) => e.displayTitle), ...dayPolls.map((poll) => `${t.calendar.polls.candidate}: ${poll.title}`)].join(', ')}">
							{day.day}
						</button>
						{#if main === 'konzert'}
							<!-- Velvet curtains and a pelmet; they part a little on hover and when picked. -->
							<span class="curtains" aria-hidden="true">
								<span class="curtain left"></span>
								<span class="curtain right"></span>
								<span class="pelmet"></span>
							</span>
						{/if}
						{#if main && main !== 'sonstiges'}
							<span class="sticker {main}" style={stickerStyle(day.key)} aria-hidden="true">
								<span class="paper"></span>
								<img src={page.data.logo ?? '/logo.svg'} alt="" width="40" height="40" loading="lazy" />
							</span>
						{/if}
						{#if dayEvents.length || dayPolls.length}
							<ul class="chips">
								{#each dayEvents.slice(0, 3) as event (event.id)}
									<li>
										<a class="chip {event.type}" class:tentative={event.tentative} href="/kalender/{encodeURIComponent(event.id)}" title={event.displayTitle}>
											{event.date.time ? `${event.date.time.split(' ')[0]} ` : ''}{event.displayTitle}
										</a>
									</li>
								{/each}
								{#if dayEvents.length > 3}<li class="more">+{dayEvents.length - 3}</li>{/if}
								{#each dayPolls.slice(0, 1) as poll (poll.id)}
									<li><a class="chip poll" href="/termine/{encodeURIComponent(poll.id)}" title={poll.title}>? {poll.title}</a></li>
								{/each}
							</ul>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<div class="legend" aria-hidden="true">
		<span><span class="swatch stage-swatch"><span class="curtain left"></span><span class="curtain right"></span></span>{t.concerts.types.konzert}</span>
		<span>
			<span class="sticker generalprobe mini" style={stickerStyle('legend-gp')}><span class="paper"></span><img src={page.data.logo ?? '/logo.svg'} alt="" width="20" height="20" /></span>
			{t.concerts.types.generalprobe}
		</span>
		<span>
			<span class="sticker probe mini" style={stickerStyle('legend-probe')}><span class="paper"></span><img src={page.data.logo ?? '/logo.svg'} alt="" width="20" height="20" /></span>
			{t.concerts.types.probe}
		</span>
		{#if Object.keys(pollDays).length}<span><span class="swatch poll-swatch"></span>{t.calendar.polls.candidate}</span>{/if}
	</div>

	<div class="selected">
		<h4>{selectedLabel}</h4>
		{#if selectedEvents.length || selectedPolls.length}
			<ul class="list">
				{#each selectedEvents as event (event.id)}
					<li><EventRow {event} concertTitle={event.concertId ? concertTitles[event.concertId] : undefined} /></li>
				{/each}
				{#each selectedPolls as poll (poll.id)}
					<li>
						<a class="poll-row" href="/termine/{encodeURIComponent(poll.id)}">
							<span class="poll-icon"><Icon name="poll" size={18} /></span>
							<span class="poll-body"><span class="poll-over">{t.calendar.polls.candidate}</span><strong>{poll.title}</strong></span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="none">{t.concerts.noEventsThatDay}</p>
		{/if}
	</div>
</div>

<style>
	.calendar {
		--konzert: var(--accent);
		--generalprobe: var(--warn);
		--probe: color-mix(in oklab, var(--ok) 80%, var(--text));
		--sonstiges: var(--text-muted);
		/* Theatre velvet, deep enough to carry the gold of the logo. */
		--velvet: #8c1c2b;
		--velvet-dark: #5e0f1b;
		--velvet-light: #b23345;
		--fringe: #d4a937;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .calendar {
			--velvet: #6e1522;
			--velvet-dark: #3f0a13;
			--velvet-light: #8f2535;
		}
	}

	:global(:root[data-theme='dark']) .calendar {
		--velvet: #6e1522;
		--velvet-dark: #3f0a13;
		--velvet-light: #8f2535;
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.head h3 {
		min-width: 10em;
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		text-align: center;
	}

	.nav,
	.to-today {
		display: grid;
		place-items: center;
		height: 36px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.nav {
		width: 36px;
	}

	.nav.next :global(svg) {
		transform: rotate(180deg);
	}

	.to-today {
		margin-left: auto;
		padding: 0 var(--space-3);
	}

	.grid {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.row {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}

	.row + .row {
		border-top: 1px solid var(--border);
	}

	.weekdays span {
		padding: var(--space-2) 0;
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
		text-align: center;
		text-transform: uppercase;
	}

	.day {
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr;
		align-content: start;
		gap: 2px;
		min-height: 104px;
		padding: 4px;
		min-width: 0;
	}

	.day + .day {
		border-left: 1px solid var(--border);
	}

	.day.other {
		background: color-mix(in oklab, var(--surface-2) 50%, transparent);
	}

	.day.other .number,
	.day.past .number {
		color: var(--text-muted);
	}

	.day.selected {
		background: var(--accent-soft);
	}

	.day.past > .sticker,
	.day.past > .curtains,
	.day.other > .sticker,
	.day.other > .curtains {
		opacity: 0.55;
		filter: saturate(0.6);
	}

	.number {
		position: relative;
		z-index: 2;
		justify-self: start;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.day.today .number {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.filters {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	/* --- Stickers: the orchestra logo on a roughly cut paper circle, stuck on by hand. --- */
	.sticker {
		--paper: #fbf7ec;
		--paper-shade: #ece4cf;
		position: absolute;
		/* Somewhere right of the date number and above the titles. */
		/* People don't stick within the lines: some hang over the edge into the next day. */
		left: calc(46% + var(--px, 0.5) * 50%);
		top: calc(16px + var(--py, 0.5) * 40px);
		z-index: 1;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		padding: 5px;
		transform: translate(-50%, -50%) rotate(var(--tilt, -6deg)) scale(var(--size, 1));
		transition: transform 0.2s ease;
	}

	/* The paper backing, cut a little unevenly, with a soft shadow where it lifts. */
	.paper {
		position: absolute;
		inset: 0;
		border-radius: var(--radius, 50%);
		background:
			radial-gradient(circle at 30% 25%, var(--paper) 55%, var(--paper-shade) 100%);
		filter: var(--edge, none) drop-shadow(0 1px 1px rgb(0 0 0 / 0.2)) drop-shadow(0 3px 3px rgb(0 0 0 / 0.18));
	}

	.sticker img {
		position: relative;
		width: 100%;
		height: 100%;
		border-radius: 50%;
	}

	/* A faint sheen on the printed logo. */
	.sticker::after {
		content: '';
		position: absolute;
		inset: 5px;
		border-radius: 50%;
		background: linear-gradient(135deg, rgb(255 255 255 / 0.35), transparent 45%);
		pointer-events: none;
	}

	/* The Generalprobe sticker is printed on gold paper. */
	.sticker.generalprobe {
		--paper: #f0d27a;
		--paper-shade: #c99b2c;
	}

	.day:hover > .sticker {
		transform: translate(-50%, calc(-50% - 1px)) rotate(calc(var(--tilt, -6deg) * 0.7)) scale(calc(var(--size, 1) * 1.06));
	}

	/* Not confirmed yet: pencilled in rather than stuck on. */
	.tentative-day > .sticker {
		opacity: 0.55;
		filter: grayscale(0.7);
	}

	/* --- Concert days are a stage: curtains, a pelmet, and the logo in the spotlight. --- */
	.stage {
		overflow: hidden;
		background: radial-gradient(ellipse at 50% 70%, color-mix(in oklab, var(--fringe) 22%, transparent), transparent 70%);
	}

	/* On stage, but not quite in the middle: whoever stuck it there was in a hurry. */
	.stage > .sticker {
		left: calc(38% + var(--px, 0.5) * 24%);
		top: calc(40% + var(--py, 0.5) * 20%);
		width: 48px;
		height: 48px;
		padding: 6px;
		--paper: #f6dc8c;
		--paper-shade: #c99b2c;
	}

	/* In the spotlight. */
	.stage > .sticker .paper {
		filter: var(--edge, none) drop-shadow(0 0 8px color-mix(in oklab, var(--fringe) 70%, transparent))
			drop-shadow(0 3px 3px rgb(0 0 0 / 0.3));
	}

	.curtains {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.curtain {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 24%;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--velvet-dark) 55%, transparent), transparent 30%),
			repeating-linear-gradient(90deg, var(--velvet-dark) 0 2px, var(--velvet) 2px 6px, var(--velvet-light) 6px 8px, var(--velvet) 8px 11px);
		transition: width 0.35s ease;
	}

	/* Tied back: narrow at the tie, wider below, like a drawn theatre curtain. */
	.curtain.left {
		left: 0;
		border-bottom-right-radius: 70% 40%;
		box-shadow: inset -2px 0 3px rgb(0 0 0 / 0.25);
	}

	.curtain.right {
		right: 0;
		border-bottom-left-radius: 70% 40%;
		box-shadow: inset 2px 0 3px rgb(0 0 0 / 0.25);
	}

	/* The gold tie-backs. */
	.curtain::after {
		content: '';
		position: absolute;
		top: 58%;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--fringe);
		box-shadow: 0 1px 1px rgb(0 0 0 / 0.3);
	}

	.curtain.left::after {
		right: 1px;
	}

	.curtain.right::after {
		left: 1px;
	}

	/* The pelmet: a scalloped velvet band with a gold fringe. */
	.pelmet {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 9px;
		background:
			radial-gradient(circle at 50% 0, var(--velvet) 5px, transparent 5.5px) 0 4px / 12px 8px repeat-x,
			linear-gradient(var(--velvet-dark), var(--velvet)) 0 0 / 100% 5px no-repeat;
		border-bottom: 1px solid transparent;
	}

	.pelmet::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 4px;
		height: 2px;
		background: repeating-linear-gradient(90deg, var(--fringe) 0 2px, transparent 2px 4px);
	}

	.stage:hover .curtain,
	.stage.selected .curtain {
		width: 16%;
	}

	.stage .number {
		margin-top: 6px;
		margin-left: 20%;
		background: color-mix(in oklab, var(--surface) 85%, transparent);
	}

	.stage.today .number {
		background: var(--accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.curtain,
		.sticker {
			transition: none;
		}
	}

	/* --- Titles under the stickers (wide screens only). --- */
	.chips {
		position: relative;
		z-index: 2;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-self: end;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chip {
		display: block;
		overflow: hidden;
		padding: 1px 4px;
		border-radius: var(--radius-xs);
		/* The type shows as a tint with a hairline in its colour, not a stripe. */
		background: color-mix(in oklab, var(--surface) 84%, var(--tone));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--tone) 35%, transparent);
		color: var(--text);
		font-size: var(--text-2xs);
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip.tentative {
		border-left-style: dashed;
	}

	.chip:hover {
		background: color-mix(in oklab, var(--surface) 70%, var(--tone));
	}

	.konzert {
		--tone: var(--konzert);
	}

	.generalprobe {
		--tone: var(--generalprobe);
	}

	.probe {
		--tone: var(--probe);
	}

	.sonstiges {
		--tone: var(--sonstiges);
	}

	/* A date a poll proposes: not booked yet, so only a dashed ring around the day. */
	.poll-day .number {
		outline: 1.5px dashed var(--accent);
		outline-offset: 1px;
	}

	.chip.poll {
		--tone: var(--accent);
		border-left-style: dashed;
		background: none;
		color: var(--text-muted);
	}

	.swatch.poll-swatch {
		width: 18px;
		height: 18px;
		border: 1.5px dashed var(--accent);
		border-radius: var(--radius-pill);
		background: none;
	}

	.poll-row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		color: inherit;
	}

	.poll-row:hover {
		background: var(--surface-2);
	}

	.poll-row > :global(svg) {
		color: var(--text-muted);
	}

	.poll-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 52px;
		height: 44px;
		border: 1.5px dashed color-mix(in oklab, var(--accent) 60%, transparent);
		border-radius: var(--radius-control);
		color: var(--accent);
	}

	.poll-body {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.poll-over {
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.more {
		color: var(--text-muted);
		font-size: var(--text-2xs);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-5);
		margin: var(--space-3) 0 var(--space-4) var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.legend > span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.sticker.mini {
		position: relative;
		left: auto;
		top: auto;
		width: 24px;
		height: 24px;
		padding: 2px;
		transform: rotate(var(--tilt, -6deg));
	}

	.swatch {
		position: relative;
		display: inline-block;
		width: 26px;
		height: 20px;
		overflow: hidden;
		border-radius: var(--radius-xs);
		background: color-mix(in oklab, var(--fringe) 25%, var(--surface));
	}

	.swatch .curtain {
		width: 38%;
	}

	.swatch .curtain::after {
		display: none;
	}

	.selected h4 {
		margin: 0 0 var(--space-2) var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
		overflow: hidden;
	}

	.list li + li {
		border-top: 1px solid var(--border);
	}

	.none {
		margin: 0 0 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	/* Phones: no titles; the stickers and stages are enough, the list below shows the day. */
	@media (max-width: 640px) {
		.day {
			min-height: 58px;
			justify-items: center;
			padding: 3px 0;
		}

		.number {
			justify-self: center;
			width: 22px;
			height: 22px;
			font-size: var(--text-2xs);
		}

		.chips {
			display: none;
		}

		/* Below the number, wandering left and right. */
		.day > .sticker {
			left: calc(28% + var(--px, 0.5) * 44%);
			top: calc(60% + var(--py, 0.5) * 16%);
			width: 28px;
			height: 28px;
			padding: 3px;
		}

		.stage > .sticker {
			left: calc(38% + var(--px, 0.5) * 24%);
			top: calc(62% + var(--py, 0.5) * 10%);
			width: 28px;
			height: 28px;
		}

		.stage .number {
			margin: 4px 0 0;
		}

		.curtain {
			width: 22%;
		}

		.curtain::after {
			width: 5px;
			height: 5px;
		}
	}
</style>

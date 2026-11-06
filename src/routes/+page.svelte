<script lang="ts">
	import SeasonMark from '#lib/components/SeasonMark.svelte';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import InstallHint from '#lib/components/InstallHint.svelte';
	import SignupAnswers from '#lib/components/SignupAnswers.svelte';
	import Title from '#lib/components/Title.svelte';
	import { navGroups } from '#lib/nav.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import type { ShownEvent } from '#lib/events/schedule.ts';
	import { splitTrailingEmoji } from '#lib/events/format.ts';
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import { tour } from '#lib/tour/state.svelte.ts';

	let { data } = $props();

	/** A few pieces as chips; the whole list is one click away on the event's page. */
	const CHIPS = 4;
	/** "Städtisches Gymnasium Bergkamen, Hubert-Biernat-Straße 1, …" → the venue's name. */
	const venue = (location: string) => location.split(',')[0].trim();
	const eventUrl = (event: ShownEvent) => `/kalender/${encodeURIComponent(event.id)}`;
	/** "Samstag, 31. Oktober 2026" → "Samstag, 31. Oktober": the year is this one or the next. */
	const dateHeading = (event: ShownEvent) => event.date.long.replace(/,?\s*\d{4}$/, '');
	/** "Samstag, 31. Oktober 2026" → "Samstag", for the question over the answers. */
	const dayName = (event: ShownEvent) => event.date.long.split(',')[0];

	/** Answered dates show one short line (#214); "ändern" brings the buttons back for that date. */
	const changing = new SvelteSet<string>();

	const firstName = $derived(data.user?.name.split(' ')[0] ?? '');

	/**
	 * The next rehearsal and the next concert, whichever comes first on top. The first one is
	 * read at the top of the page and acted on in the dock above the tab bar; the other follows.
	 */
	const upNext = $derived(
		[
			data.nextRehearsal && {
				kind: 'probe' as const,
				event: data.nextRehearsal,
				// "für Herbstkonzert" only when the title doesn't already say it.
				note:
					data.rehearsalFor && !data.nextRehearsal.displayTitle.toLowerCase().includes(data.rehearsalFor.toLowerCase())
						? t.concerts.forConcert(data.rehearsalFor)
						: undefined,
				piecesLabel: t.rehearsalPlan.title,
				pieces: data.rehearsing,
				partsUrl: data.rehearsalParts,
				lastNote: data.lastNote
			},
			data.nextConcert && {
				kind: 'konzert' as const,
				event: data.nextConcert,
				note: undefined,
				piecesLabel: `${t.home.program} · ${t.home.pieces(data.program.length)}`,
				pieces: data.program,
				partsUrl: data.program.length ? `/meine-noten?konzert=${encodeURIComponent(data.nextConcert.id)}` : undefined,
				lastNote: null
			}
		]
			.filter((card) => !!card)
			.sort((a, b) => a.event.daysUntil - b.event.daysUntil)
	);
	const first = $derived(upNext[0]);
	const later = $derived(upNext.slice(1));
	const answerOf = (event: ShownEvent) => data.answers?.[event.id];
	const ANSWER_ICONS = { yes: 'check', maybe: 'minus', no: 'x', open: 'bell' } as const;
	/** "Meine Noten · Geige": the button says whose parts it opens. */
	const partsLabel = $derived(data.user?.instrument ? `${t.nav.myParts} · ${instrumentLabel(data.user.instrument)}` : t.nav.myParts);
	/** The dock holds what a member does with the next date: answer it and open their parts. */
	const hasDock = $derived(!!first && (!!data.answers || !!first.partsUrl));

	// On phones the dock is fixed above the tab bar; toasts and the update notice rise above it
	// instead of covering the answers.
	let dockHeight = $state(0);
	// Once the next date has scrolled away, so does the dock: its answers belong to that date,
	// not to whatever is on screen now.
	let nextCard = $state<HTMLElement>();
	let cardInView = $state(true);
	// The tour's card sits where the dock is: while it's on screen, the dock steps aside.
	const dockShown = $derived(cardInView && !tour.showing);
	$effect(() => {
		if (!nextCard) return;
		const observer = new IntersectionObserver(([entry]) => (cardInView = entry.isIntersecting));
		observer.observe(nextCard);
		return () => observer.disconnect();
	});
	$effect(() => {
		const root = document.documentElement;
		root.style.setProperty('--dock-height', `${dockShown ? dockHeight : 0}px`);
		return () => root.style.removeProperty('--dock-height');
	});

	// Every page by group, so the start page doubles as a map of the app. A workspace is one
	// entry, its pages named underneath; the tabs on its pages lead on from there.
	const groups = $derived(
		navGroups({ auth: data.auth, rights: data.rights, features: data.features, polls: data.polls }).map((group) =>
			group.workspace && group.items.length > 1
				? {
						...group,
						items: [{ ...group.items[0], label: group.label, description: group.items.map((item) => item.label).join(' · ') }]
					}
				: { ...group, items: group.items.map((item) => ({ ...item, description: t.home.describe[item.href] })) }
		)
	);
	// The workspaces share one heading, so the map stays short.
	const work = $derived(groups.filter((group) => group.workspace));
	const sections = $derived([
		...groups.filter((group) => !group.workspace),
		...(work.length ? [{ key: 'arbeit', label: t.home.work, items: work.flatMap((group) => group.items) }] : [])
	]);
	const todo = $derived(
		data.todo
			? [
					{ href: '/meldungen', count: data.todo.reports, text: t.home.todo.reports },
					{ href: '/wuensche', count: data.todo.wishes, text: t.home.todo.wishes },
					{ href: '/admin', count: data.todo.requests, text: t.home.todo.requests },
					{ href: '/leihmaterial', count: data.todo.loans, text: t.home.todo.loans },
					{ href: data.todo.attendanceUrl ?? '/kalender', count: data.todo.attendance, text: t.home.todo.attendance },
					{ href: data.todo.pollsUrl ?? '/termine', count: data.todo.polls, text: t.home.todo.polls },
					{ href: '/fehlende-stimmen?meine', count: data.todo.scans, text: t.home.todo.scans }
				].filter((item) => item.count > 0)
			: []
	);
	const todoCount = $derived(todo.reduce((sum, item) => sum + item.count, 0));
</script>

<Title />

<!-- In the bold look, like the orchestra's stories: dark, the logo large and dim behind the greeting (#163). -->
<header class="hero" class:story={data.brand.look === 'bold'}>
	{#if data.brand.look === 'bold'}
		<img class="watermark" src={data.logo} alt="" />
		<!-- The season moving behind the greeting (#202): snow falling, a bat flying past the pumpkins. -->
		<SeasonMark variant="scene" />
	{/if}
	<h1>{firstName ? t.home.hello(firstName) : t.home.title(data.orchestraName)}</h1>
	<!-- One useful line instead of a greeting alone (#221): what the rehearsals lead up to. -->
	{#if data.nextConcert}
		<p class="countdown-line">{t.home.countdown(data.nextConcert.displayTitle, t.concerts.relative(data.nextConcert.daysUntil))}</p>
	{/if}
</header>

{#snippet answers(event: ShownEvent, open: string)}
	{@const answer = answerOf(event)}
	{#if answer && !changing.has(event.id)}
		<p class="answered">
			<span class="answer-mark {answer}"><Icon name={ANSWER_ICONS[answer]} size={14} />{t.signups.status[answer]}</span>
			<button class="link" onclick={() => changing.add(event.id)} aria-label="{t.signups.change}: {t.signups.question} {event.displayTitle}">{t.signups.change}</button>
		</p>
	{:else}
		<div class="rsvp">
			<span class="question">{answer ? t.signups.yourAnswer : open}</span>
			<SignupAnswers action="/kalender/{encodeURIComponent(event.id)}?/answer" {answer} label="{t.signups.question} {event.displayTitle}" toastErrors />
		</div>
	{/if}
{/snippet}

{#snippet pieces(card: (typeof upNext)[number])}
	{#if card.pieces.length}
		<div class="pieces">
			<span class="pieces-label">{card.piecesLabel}</span>
			<ul class="chips">
				{#each card.pieces.slice(0, CHIPS) as item, i (i)}
					<li>
						{#if item.pieceId}
							<a class="chip" href="/stuecke/{encodeURIComponent(item.pieceId)}">{item.title}</a>
						{:else}
							<span class="chip">{item.title}</span>
						{/if}
					</li>
				{/each}
				{#if card.pieces.length > CHIPS}
					<li><a class="chip more" href={eventUrl(card.event)}>{t.home.morePieces(card.pieces.length - CHIPS)}</a></li>
				{/if}
			</ul>
		</div>
	{/if}
	{#if card.lastNote}
		<!-- What the last rehearsal left to practise (#145), for those who missed it. -->
		<a class="last-note" href={card.lastNote.url}>
			<span class="pieces-label"><Icon name="note" size={14} />{t.rehearsalNotes.home(card.lastNote.date)}</span>
			{#if card.lastNote.practise}<span><strong>{t.rehearsalNotes.practise}:</strong> {card.lastNote.practise}</span>{/if}
			{#if card.lastNote.next}<span><strong>{t.rehearsalNotes.next}:</strong> {card.lastNote.next}</span>{/if}
		</a>
	{/if}
{/snippet}

<div class="home">
	<!-- The next date comes first for everyone, organisers too; their open work follows (#220). -->
	<section class="next-date" aria-label={t.home.upNext}>
		{#if first}
			{@const [titleStart, titleEnd] = splitTrailingEmoji(first.event.displayTitle)}
			<article class="ui-card next {first.kind}" bind:this={nextCard}>
				<a class="event" href={eventUrl(first.event)} data-tour="next">
					<h2 class="when">{dateHeading(first.event)}</h2>
					<span class="what">
						<strong>{titleStart}{#if titleEnd}<span class="keep">{titleEnd}</span>{/if}</strong>
						<span class="countdown">{t.concerts.relative(first.event.daysUntil)}</span>
					</span>
					<span class="where">
						{first.event.date.time || t.concerts.allDay}{#if first.event.location}{' · '}<span title={first.event.location}>{venue(first.event.location)}</span>{/if}{first.note ? ` · ${first.note}` : ''}
					</span>
					<span class="chevron"><Icon name="chevron" size={18} /></span>
				</a>
				{@render pieces(first)}
				{#if hasDock}
					<!-- Read at the top, act at the bottom: on phones this sits above the tab bar. -->
					<!-- Answered, the whole dock wears the answer's colour; "ändern" brings the buttons back. -->
					{@const settled = changing.has(first.event.id) ? undefined : answerOf(first.event)}
					<div class="dock {settled ?? ''}" class:settled={!!settled} class:away={!dockShown} bind:clientHeight={dockHeight}>
						{#if data.answers}{@render answers(first.event, t.home.areYouIn(dayName(first.event)))}{/if}
						{#if first.partsUrl}
							<a class="btn parts" href={first.partsUrl}><Icon name="parts" size={18} />{partsLabel}</a>
						{/if}
					</div>
				{/if}
			</article>
		{:else}
			<div class="ui-card empty">
				<span class="empty-icon"><Icon name="calendar" size={22} /></span>
				<p>{data.calendar === 'ok' ? t.home.noNextConcert : t.home.nextConcertEmpty}</p>
				<a class="btn ghost" href="/kalender">{t.home.allDates}</a>
			</div>
		{/if}
	</section>

	<!-- Below the next date, not above it: on phones, until the app is on the home screen or the member said no (#279). -->
	<InstallHint name={data.orchestraShortName} logo={data.logo} />

	{#if later.length || todo.length}
		<div class="side">
			{#if later.length}
				<section aria-labelledby="later-title">
					<h2 class="section-title" id="later-title">{t.home.later}</h2>
					{#each later as card (card.kind)}
						{@const [titleStart, titleEnd] = splitTrailingEmoji(card.event.displayTitle)}
						<article class="ui-card later-card {card.kind}">
							<a class="event" href={eventUrl(card.event)}>
								<span class="date" aria-hidden="true">
									<span class="weekday">{card.event.date.weekday}</span>
									<span class="day">{card.event.date.day}</span>
									<span class="month">{card.event.date.month}</span>
								</span>
								<span class="event-body">
									<strong>{titleStart}{#if titleEnd}<span class="keep">{titleEnd}</span>{/if}</strong>
									<span>{dateHeading(card.event)} · {t.concerts.relative(card.event.daysUntil)}</span>
									<span class="venue">{card.event.date.time || t.concerts.allDay}{#if card.event.location}{' · '}{venue(card.event.location)}{/if}</span>
								</span>
								<span class="chevron"><Icon name="chevron" size={16} /></span>
							</a>
							{@render pieces(card)}
							{#if data.answers}
								<!-- One line, not a second set of buttons: only the next date is answered here. -->
								{@const answer = answerOf(card.event) ?? 'open'}
								<a class="answer-line" href={eventUrl(card.event)}>
									<span class="answer-mark {answer}"><Icon name={ANSWER_ICONS[answer]} size={14} />{t.signups.status[answer]}</span>
									<span class="answer-action">{answer === 'open' ? t.home.answerNow : t.signups.change}</span>
								</a>
							{/if}
						</article>
					{/each}
				</section>
			{/if}

			{#if todo.length}
				<section class="todo" aria-label={t.home.todo.title}>
					<details>
						<summary>
							<strong>{todoCount}</strong>
							<span>{t.home.todo.summary(todoCount)}</span>
							<span class="chevron"><Icon name="chevron" size={16} /></span>
						</summary>
						<ul>
							{#each todo as item (item.href)}
								<li><a href={item.href}><strong>{item.count}</strong> {item.text(item.count)}<Icon name="chevron" size={16} /></a></li>
							{/each}
						</ul>
					</details>
				</section>
			{/if}
		</div>
	{/if}
</div>

<section class="areas" aria-labelledby="areas-title">
	<h2 class="section-title" id="areas-title">{t.home.quickLinks}</h2>
	<div class="groups">
		{#each sections as group (group.key)}
			<!-- On phones the tab bar already has the primary pages: only the others are listed (#222). -->
			<section class:in-tabbar={group.items.every((item) => item.primary)}>
				<h3 class="ui-label">{group.label}</h3>
				<ul class="ui-list">
					{#each group.items as item (item.href)}
						<li class:in-tabbar={item.primary}>
							<a href={item.href} class="row">
								<span class="row-icon"><Icon name={item.icon} size={18} /></span>
								<span class="row-body">
									<strong>{item.label}</strong>
									{#if item.description}<span>{item.description}</span>{/if}
								</span>
								<span class="chevron"><Icon name="chevron" size={16} /></span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</section>

<style>
	.hero {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-5);
	}

	/* Always dark, in both schemes; the accent's dark shade stays readable on it (#141). */
	.story {
		position: relative;
		overflow: hidden;
		padding: var(--space-6) var(--space-5);
		border-radius: var(--radius-l);
		background: var(--brand-ink);
		color: #f2eee4;
		/* On the dark page the band would melt into the background without an edge. */
		box-shadow: inset 0 0 0 1px var(--hairline);
	}

	.story h1 {
		position: relative;
		color: var(--accent-dark, var(--brand));
		font-size: var(--text-headline);
		line-height: 1;
	}

	.watermark {
		position: absolute;
		top: 50%;
		right: -12%;
		width: min(80%, 440px);
		height: auto;
		aspect-ratio: 1;
		object-fit: contain;
		translate: 0 -50%;
		opacity: 0.2;
		pointer-events: none;
	}

	.countdown-line {
		position: relative;
		color: var(--text-muted);
		font-weight: 600;
	}

	.story .countdown-line {
		color: inherit;
	}

	/* The next date on the left, what follows and open work beside it. */
	.home {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 4fr);
		gap: var(--space-5);
		align-items: start;
		margin-bottom: var(--space-7);
	}

	.home:not(:has(.side)) {
		grid-template-columns: minmax(0, 1fr);
		max-width: 640px;
	}

	.next {
		display: grid;
		gap: var(--space-4);
	}

	.event {
		position: relative;
		display: grid;
		gap: 2px;
		padding-right: var(--space-6);
	}

	/* The date is the heading: it's what a member reads first and remembers. */
	.when {
		font-family: var(--font-display);
		font-size: var(--text-date);
		font-weight: 700;
		line-height: 1.05;
		letter-spacing: 0;
		text-wrap: balance;
	}

	.what {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
		margin-top: var(--space-1);
		font-size: var(--text-lg);
	}

	.what strong {
		font-weight: 600;
	}

	.countdown {
		color: var(--accent);
		font-size: var(--text-md);
		font-weight: 650;
	}

	.where {
		color: var(--text-muted);
	}

	/* Part of the title, not one of the lines under it. */
	.keep {
		white-space: nowrap;
	}

	.event > .chevron {
		position: absolute;
		top: 50%;
		right: 0;
		translate: 0 -50%;
	}

	.chevron {
		display: grid;
		flex: none;
		color: var(--text-muted);
		transition:
			transform var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.event:hover .chevron,
	.row:hover .chevron {
		transform: translateX(2px);
		color: var(--accent);
	}

	.event:hover strong {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	/* The concert is the goal: its date carries the accent. */
	.next.konzert .when {
		color: var(--accent);
	}

	.dock {
		display: grid;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
		transition: background var(--fast) var(--ease);
	}

	/* Answered: the band says it in the answer's colour, so it reads without reading. */
	.dock.settled {
		--tone: var(--ok);
		padding: var(--space-3) var(--space-4) var(--space-4);
		border-top: 0;
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--tone) 13%, var(--surface));
	}

	.dock.maybe {
		--tone: var(--warn);
	}

	.dock.no {
		--tone: var(--danger);
	}

	.dock.settled .answered {
		justify-content: space-between;
	}

	.dock.settled .answer-mark {
		gap: var(--space-2);
		padding: 0;
		background: none;
		font-size: var(--text-base);
	}

	.dock.settled .answered .link {
		color: var(--text);
	}

	.parts {
		width: 100%;
		height: 48px;
		font-size: var(--text-md);
	}

	.rsvp {
		display: grid;
		gap: var(--space-2);
	}

	.question {
		font-weight: 600;
	}

	/* Answered: one quiet line in the answer's colour, the buttons one tap away. */
	.answered {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}

	.answer-mark {
		--tone: var(--ok);
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 4px 12px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--tone) 14%, transparent);
		color: color-mix(in oklab, var(--tone) 80%, var(--text));
		font-weight: 600;
	}

	.answer-mark.maybe {
		--tone: var(--warn);
	}

	.answer-mark.no {
		--tone: var(--danger);
	}

	.answered .link {
		min-height: var(--tap);
		padding: 0 var(--space-1);
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.answered .link:hover {
		color: var(--text);
	}

	.pieces {
		display: grid;
		gap: var(--space-2);
	}

	.pieces-label {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		min-height: 32px;
		padding: 0 12px;
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--text-sm);
		text-overflow: ellipsis;
		white-space: nowrap;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	a.chip:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.chip.more {
		background: none;
		color: var(--text-muted);
	}

	/* A pencilled note from the last rehearsal: a soft tint, no stripe. */
	.last-note {
		display: grid;
		gap: 4px;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
		font-size: var(--text-md);
		overflow-wrap: anywhere;
		white-space: pre-line;
		transition: background var(--fast) var(--ease);
	}

	.last-note:hover {
		background: color-mix(in oklab, var(--accent) 16%, transparent);
	}

	.last-note .pieces-label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		white-space: normal;
	}

	.side {
		display: grid;
		gap: var(--space-5);
	}

	/* The condensed face is for the greeting and the date only (DESIGN.md, Two Voices). */
	.section-title {
		margin-bottom: var(--space-3);
		font-size: var(--text-lg);
		font-weight: 650;
	}

	/* A later date's answer as one line; answering happens on its page. */
	.answer-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		min-height: var(--tap);
	}

	.answer-mark.open {
		--tone: var(--warn);
	}

	.answer-action {
		color: var(--accent);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.answer-line:hover .answer-action {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.later-card {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.later-card + .later-card {
		margin-top: var(--space-3);
	}

	.later-card .event {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-right: 0;
	}

	.later-card .event > .chevron {
		position: static;
		translate: none;
	}

	.date {
		display: grid;
		justify-items: center;
		flex: none;
		width: 56px;
		padding: var(--space-2) 0;
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text);
		line-height: 1.1;
	}

	.konzert .date {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.weekday,
	.month {
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.day {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.event-body {
		display: grid;
		flex: 1;
		min-width: 0;
		line-height: 1.35;
	}

	.event-body strong {
		font-weight: 600;
	}

	.event-body span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.event-body .keep {
		color: inherit;
		font-size: inherit;
	}

	.venue {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Open work as one row that opens to the list, so it never pushes the next date down. */
	.todo details {
		overflow: hidden;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.todo summary {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--tap);
		padding: 0 var(--space-4);
		cursor: pointer;
		font-weight: 600;
		list-style: none;
		transition: background var(--fast) var(--ease);
	}

	.todo summary::-webkit-details-marker {
		display: none;
	}

	.todo summary:hover {
		background: var(--surface-2);
	}

	.todo summary .chevron {
		margin-left: auto;
		rotate: 90deg;
		transition: rotate var(--fast) var(--ease);
	}

	.todo details[open] summary .chevron {
		rotate: -90deg;
	}

	.todo ul {
		display: grid;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--hairline);
		list-style: none;
	}

	.todo li + li {
		border-top: 1px solid var(--hairline);
	}

	.todo a {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--tap);
		padding: 0 var(--space-4);
		font-size: var(--text-md);
		transition: background var(--fast) var(--ease);
	}

	.todo a:hover {
		background: var(--surface-2);
	}

	.todo a :global(svg) {
		margin-left: auto;
		color: var(--text-muted);
	}

	.todo strong {
		display: grid;
		place-items: center;
		min-width: 24px;
		height: 24px;
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--warn) 16%, transparent);
		color: var(--warn);
		font-size: var(--text-xs);
	}

	.empty {
		display: grid;
		justify-items: start;
		gap: var(--space-3);
		color: var(--text-muted);
	}

	.empty-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: var(--space-5) var(--space-4);
		align-items: start;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 56px;
		padding: var(--space-2) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	.row:hover {
		background: var(--surface-2);
	}

	.row-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.row-body {
		display: grid;
		flex: 1;
		min-width: 0;
		line-height: 1.35;
	}

	.row-body strong {
		font-weight: 600;
	}

	.row-body span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	/* The tab bar or the top bar has these already (#222). */
	.groups .in-tabbar {
		display: none;
	}

	.groups li.in-tabbar + li:not(.in-tabbar) {
		border-top: none;
	}

	@media (max-width: 860px) {
		.home {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* Phones: the greeting stays short (#221), the dock sits in thumb reach above the tab bar. */
	@media (max-width: 720px) {
		.hero {
			margin-bottom: var(--space-4);
		}

		.story {
			padding: var(--space-4) var(--space-5);
		}

		.story h1 {
			font-size: var(--text-4xl);
		}

		.watermark {
			width: min(50%, 200px);
		}

		/* On a phone the season's drawing shares the logo's corner: the logo steps back for it. */
		.story:has(:global(.scene)) .watermark {
			opacity: 0.1;
		}

		.next {
			padding: var(--space-5) var(--space-4);
		}

		.dock {
			position: fixed;
			inset: auto 0 calc(var(--tabbar-height) + env(safe-area-inset-bottom)) 0;
			z-index: 9;
			gap: var(--space-2);
			padding: var(--space-3) var(--space-4);
			border-top: 1px solid var(--hairline);
			background: color-mix(in oklab, var(--bg) 94%, transparent);
			backdrop-filter: saturate(1.6) blur(20px);
			-webkit-backdrop-filter: saturate(1.6) blur(20px);
			animation: dock-in 0.32s var(--ease) backwards;
			transition:
				transform 0.24s var(--ease),
				opacity 0.24s var(--ease),
				background 0.24s var(--ease),
				visibility 0s;
		}

		/* Edge to edge above the tab bar: the whole band takes the answer's colour. */
		.dock.settled {
			padding: var(--space-3) var(--space-4);
			border-top: 1px solid color-mix(in oklab, var(--tone) 35%, var(--hairline));
			border-radius: 0;
			background: color-mix(in oklab, var(--tone) 15%, var(--bg));
		}

		.dock.away {
			opacity: 0;
			visibility: hidden;
			transform: translateY(calc(100% + var(--tabbar-height)));
			transition:
				transform 0.24s var(--ease),
				opacity 0.24s var(--ease),
				visibility 0s 0.24s;
		}

		.dock .question {
			font-size: var(--text-md);
		}

		.home {
			gap: var(--space-6);
			margin-bottom: var(--space-6);
		}

		/* A short list without descriptions. */
		.row {
			min-height: 52px;
		}

		.row-body span {
			display: none;
		}
	}

	/* The dock rises in once, as the page arrives. */
	@keyframes dock-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		@keyframes dock-in {
			from {
				opacity: 0;
			}
		}
	}
</style>

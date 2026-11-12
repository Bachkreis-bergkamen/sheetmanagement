<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import { readLocal, writeLocal } from '#lib/local-storage.ts';
	import { placeCard, shouldOffer, TOUR_STORAGE_KEY, tourSteps, type Box, type TourOutcome, type TourStep } from '#lib/tour/tour.ts';
	import { tour } from '#lib/tour/state.svelte.ts';
	import Icon, { type IconName } from './Icon.svelte';

	/**
	 * The tour for new members: offered once, then two short chapters, the essentials and
	 * setting the app up. Not modal: the page stays usable, so the instrument or the text size
	 * can be set right where the card points. Escape or "Tour beenden" skip it at any step.
	 */
	let {
		status,
		account,
		name,
		logo,
		bold
	}: {
		/** From the layout: offer it, seen already, or ask this browser. */
		status: 'offer' | 'seen' | 'local';
		/** Signed in: the setup chapter, and how it ended is kept in D1. */
		account: boolean;
		name: string;
		/** The welcome card is the start page's story card in small: the logo dim behind the greeting. */
		logo: string;
		bold: boolean;
	} = $props();

	/** Each step's picture, so the cards are told apart at a glance. */
	const ICONS: Record<TourStep['key'], IconName> = {
		home: 'home',
		parts: 'parts',
		calendar: 'calendar',
		pieces: 'music',
		more: 'menu',
		setupOffer: 'sliders',
		instruments: 'user',
		view: 'text',
		notifications: 'bell',
		install: 'download',
		done: 'check',
		doneOpen: 'check'
	};

	const steps = $derived(tourSteps({ account }));
	/** Optional steps whose target isn't on their page, e.g. notifications that aren't set up. */
	let missing = $state(new Set<string>());
	const shown = $derived(steps.filter((step) => !missing.has(step.key)));
	const basicsCount = $derived(steps.filter((step) => step.chapter === 'basics' && step.target).length);
	/** What setting up holds, as the break between the chapters lists it; unknown ones until seen. */
	const setupSteps = $derived(shown.filter((step) => step.chapter === 'setup' && step.key !== 'done'));

	let index = $state<number | null>(null);
	let ready = $state(false);
	let ended = $state(false);
	let stored = $state<string | null>(null);
	let mounted = $state(false);
	$effect(() => {
		// Without storage it's offered on each visit until finished on the server.
		stored = readLocal(TOUR_STORAGE_KEY) ?? null;
		mounted = true;
	});

	// Offered on the start page only: elsewhere the card would sit over what the member came for (#219).
	const offering = $derived(mounted && !ended && index === null && page.url.pathname === '/' && shouldOffer(status, stored));
	const step = $derived(index === null ? null : steps[index]);
	/** Counted per chapter: five short steps, then a few more if wanted, never "1 of 11". */
	const chapter = $derived(step ? shown.filter((each) => each.chapter === step.chapter && each.key !== 'setupOffer') : []);
	const position = $derived(step ? chapter.indexOf(step) : -1);
	const last = $derived(step ? shown.indexOf(step) === shown.length - 1 : false);
	const pause = $derived(step?.key === 'setupOffer');

	$effect(() => {
		tour.showing = !!(offering || (step && ready));
		return () => (tour.showing = false);
	});

	// "Tour noch einmal machen" on the profile.
	$effect(() => {
		if (tour.requested) untrack(() => go(0, 1));
	});

	let card = $state<HTMLElement>();
	let heading = $state<HTMLElement>();
	let targets: HTMLElement[] = [];
	let ring = $state<Box | null>(null);
	let spot = $state({ left: 0, top: 0 });
	/** Hidden until measured, so it doesn't flash in the corner. */
	let placed = $state(false);
	let run = 0;

	const visible = (element: HTMLElement) => element.getClientRects().length > 0;

	/**
	 * The visible matches of the first selector that has any: the header's link on wide screens,
	 * the tab bar's on phones; both rows of the look settings at once.
	 */
	function find(target: TourStep['target']): HTMLElement[] {
		for (const selector of target === undefined ? [] : [target].flat()) {
			const found = [...document.querySelectorAll<HTMLElement>(selector)].filter(visible);
			if (found.length) return found;
		}
		return [];
	}

	/** Waits a moment for the page to show the target; the new page may still be rendering. */
	async function appear(target: TourStep['target'], mine: number) {
		for (let tries = 0; tries < 30 && mine === run; tries++) {
			const found = find(target);
			if (found.length || !target) return found;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return [];
	}

	async function go(next: number, direction: 1 | -1) {
		const mine = ++run;
		const wanted = steps[next];
		if (!wanted) return next < 0 ? undefined : end('done');
		if (missing.has(wanted.key)) return go(next + direction, direction);
		ready = false;
		placed = false;
		index = next;
		// The focus goes to the card below, not to the top of the new page; the page starts at its top.
		if (wanted.path && page.url.pathname !== wanted.path) {
			await goto(wanted.path, { reset: false });
			scrollTo({ top: 0 });
		}
		if (mine !== run) return;
		const found = await appear(wanted.target, mine);
		if (mine !== run) return;
		// What the page doesn't have, the tour leaves out, also on the way back.
		const absent = steps.filter((other) => other.optional && other.path === wanted.path && !find(other.target).length).map((other) => other.key);
		if (absent.length) missing = new Set([...missing, ...absent]);
		if (wanted.optional && !found.length) return go(next + direction, direction);
		targets = found;
		reveal(found);
		ready = true;
		// Once it's placed: a hidden card can't take focus.
		await tick();
		await new Promise(requestAnimationFrame);
		await tick();
		if (mine === run) heading?.focus({ preventScroll: true });
	}

	/** Around everything the step points at. */
	function union(elements: HTMLElement[]): Box | null {
		if (!elements.length) return null;
		const boxes = elements.map((element) => element.getBoundingClientRect());
		const left = Math.min(...boxes.map((box) => box.left));
		const top = Math.min(...boxes.map((box) => box.top));
		return { left, top, width: Math.max(...boxes.map((box) => box.right)) - left, height: Math.max(...boxes.map((box) => box.bottom)) - top };
	}

	/** About as tall as a step's card, to leave room for it before it's measured. */
	const CARD_ROOM = 280;

	/**
	 * Scrolls the target into the free space between header and tab bar, with room for the card
	 * beside it, unless that's so already. Only the page's content scrolls: the header and the tab
	 * bar are always in view.
	 */
	function reveal(elements: HTMLElement[]) {
		const box = union(elements);
		if (!box || !elements[0].closest('main')) return;
		const view = freeSpace();
		const bottom = box.top + box.height;
		const inView = box.top >= view.top && bottom <= view.bottom;
		const cardFits = bottom + CARD_ROOM <= view.bottom || box.top - CARD_ROOM >= view.top;
		if (inView && cardFits) return;
		const room = view.bottom - view.top;
		// Near the top with the card below it if both fit; something tall from its top; else in the middle.
		const offset = box.height + CARD_ROOM + 24 <= room ? 12 : box.height > room * 0.6 ? 12 : (room - box.height) / 2;
		const top = scrollY + box.top - view.top - offset;
		scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	}

	function freeSpace() {
		const header = document.querySelector('.topbar')?.getBoundingClientRect();
		const bar = document.querySelector('.tabbar');
		const tabbar = bar && bar.getClientRects().length ? bar.getBoundingClientRect() : null;
		return { width: document.documentElement.clientWidth, top: header?.bottom ?? 0, bottom: tabbar?.top ?? innerHeight };
	}

	/** Follows the target while the page scrolls, resizes or changes. */
	$effect(() => {
		if (!offering && !(step && ready)) return;
		let frame = requestAnimationFrame(function follow() {
			measure();
			frame = requestAnimationFrame(follow);
		});
		return () => cancelAnimationFrame(frame);
	});

	function measure() {
		if (!card) return;
		if (step && targets.some((element) => !element.isConnected)) targets = find(step.target);
		const box = step ? union(targets) : null;
		const next = box ? { left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 } : null;
		if (JSON.stringify(next) !== JSON.stringify(ring)) ring = next;
		const { left, top } = placeCard(next, { width: card.offsetWidth, height: card.offsetHeight }, freeSpace(), 16);
		if (left !== spot.left || top !== spot.top) spot = { left, top };
		placed = true;
	}

	function end(outcome: TourOutcome) {
		run++;
		const wasRunning = index !== null;
		index = null;
		targets = [];
		ring = null;
		ended = true;
		record(outcome);
		if (wasRunning) document.getElementById('inhalt')?.focus({ preventScroll: true });
	}

	/** Kept with the member's other settings (D1, via the profile); in this browser for everyone else. */
	function record(outcome: TourOutcome) {
		if (account) {
			const body = new FormData();
			body.set('outcome', outcome);
			fetch('/profil?/tour', { method: 'POST', body, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } }).catch(() => {});
		}
		if (!account || status === 'local') {
			// Without storage it's offered again next time.
			if (writeLocal(TOUR_STORAGE_KEY, outcome)) stored = outcome;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			end('skipped');
		}
	}

	const first = $derived(name.trim().split(/\s+/)[0] ?? '');
	const texts = $derived(step && step.key !== 'setupOffer' ? t.tour.steps[step.key] : null);
</script>

{#if ring}
	<!-- Around what the card talks about, the rest of the page dimmed; clicks go through to it. -->
	<div class="ring no-print" aria-hidden="true" style:left="{ring.left}px" style:top="{ring.top}px" style:width="{ring.width}px" style:height="{ring.height}px" transition:fade={{ duration: 200 }}></div>
{/if}

{#if offering || (step && ready)}
	<div
		class="card no-print"
		class:welcome={!step}
		class:story={!step && bold}
		role="dialog"
		aria-modal="false"
		aria-labelledby="tour-title"
		aria-describedby="tour-text"
		tabindex="-1"
		bind:this={card}
		style:left="{spot.left}px"
		style:top="{spot.top}px"
		style:visibility={placed ? undefined : 'hidden'}
		{onkeydown}
		transition:fly={{ y: 12, duration: 220 }}
	>
		{#if step}
			<!-- The words change at once; the ring gliding to its next place is the step's motion. -->
				<div class="body">
					<div class="head">
						<span class="tile" class:ok={step.key === 'done' || step.key === 'doneOpen'} aria-hidden="true"><Icon name={ICONS[step.key]} size={20} /></span>
						<h2 id="tour-title" tabindex="-1" bind:this={heading}>{pause ? t.tour.setupOffer.title : texts?.title}</h2>
					</div>
					<p id="tour-text">{pause ? t.tour.setupOffer.body : texts?.body}</p>
					{#if pause}
						<ul class="preview">
							{#each setupSteps as each (each.key)}
								<li><Icon name={ICONS[each.key]} size={16} />{t.tour.steps[each.key as keyof typeof t.tour.steps].title}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{#if !pause && chapter.length > 1}
				<div class="progress">
					<span class="track" aria-hidden="true">
						{#each chapter as each, at (each.key)}<span class:on={at <= position}></span>{/each}
					</span>
					<span class="count">{t.tour.step(position + 1, chapter.length)}</span>
				</div>
			{/if}
			<div class="actions">
				{#if pause}
					<button class="link" onclick={() => end('done')}>{t.tour.setupOffer.later}</button>
					<span class="spacer"></span>
					<button class="btn small" onclick={() => go(index! + 1, 1)}>{t.tour.setupOffer.start}<Icon name="chevron" size={14} /></button>
				{:else}
					{#if !last}<button class="link" onclick={() => end('skipped')}>{t.tour.end}</button>{/if}
					<span class="spacer"></span>
					{#if position > 0}<button class="btn ghost small" onclick={() => go(index! - 1, -1)}>{t.tour.back}</button>{/if}
					{#if last}
						<button class="btn small" onclick={() => end('done')}><Icon name="check" size={14} />{t.tour.finish}</button>
					{:else}
						<button class="btn small" onclick={() => go(index! + 1, 1)}>{t.tour.next}<Icon name="chevron" size={14} /></button>
					{/if}
				{/if}
			</div>
		{:else}
			{#if bold}<img class="watermark" src={logo} alt="" />{/if}
			<h2 id="tour-title">{t.tour.welcome(first)}</h2>
			<p id="tour-text">{account ? t.tour.offer : t.tour.offerOpen}</p>
			<ul class="chapters">
				<li><span class="mark" aria-hidden="true"><Icon name="music" size={16} /></span><span><strong>{t.tour.chapters.basics}</strong>{t.tour.chapters.basicsHint(basicsCount)}</span></li>
				{#if account}
					<li><span class="mark" aria-hidden="true"><Icon name="sliders" size={16} /></span><span><strong>{t.tour.chapters.setup}</strong>{t.tour.chapters.setupHint}</span></li>
				{/if}
			</ul>
			<div class="actions">
				<button class="link" onclick={() => end('skipped')}>{t.tour.skip}</button>
				<span class="spacer"></span>
				<button class="btn start" onclick={() => go(0, 1)}>{t.tour.start}<Icon name="chevron" size={16} /></button>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* The step's target in the light, the page around it dimmed a little: it's where to look. */
	.ring {
		position: fixed;
		z-index: 15;
		border-radius: var(--radius-m);
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 6px var(--accent-soft),
			0 0 0 100vmax color-mix(in oklab, var(--scrim) 70%, transparent);
		pointer-events: none;
		transition:
			left 0.3s var(--ease),
			top 0.3s var(--ease),
			width 0.3s var(--ease),
			height 0.3s var(--ease);
	}

	.card {
		position: fixed;
		z-index: 16;
		display: grid;
		gap: var(--space-3);
		width: min(380px, calc(100vw - 2 * var(--space-4)));
		padding: var(--space-5);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
	}

	@media (prefers-reduced-motion: reduce) {
		.ring {
			transition: none;
		}
	}

	.body {
		display: grid;
		gap: var(--space-2);
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.tile {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.tile.ok {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		line-height: 1.25;
		text-wrap: balance;
	}

	.card:focus,
	h2:focus {
		outline: none;
	}

	p {
		margin: 0;
	}

	#tour-text {
		color: var(--text-muted);
		font-size: var(--text-md);
		line-height: 1.5;
	}

	/* What setting up holds, so "Einrichten" is a known minute, not an open end. */
	.preview {
		display: grid;
		gap: var(--space-1);
		margin: var(--space-1) 0 0;
		padding: var(--space-3);
		border-radius: var(--radius-m);
		background: var(--surface-2);
		list-style: none;
		font-size: var(--text-sm);
	}

	.preview li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.preview :global(svg) {
		color: var(--accent);
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.track {
		display: flex;
		flex: 1;
		gap: 4px;
	}

	.track span {
		flex: 1;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--border);
		transition: background 0.3s var(--ease);
	}

	.track span.on {
		background: var(--accent);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.spacer {
		flex: 1;
	}

	.link {
		min-height: 32px;
		padding: var(--space-1) 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.link:hover {
		color: var(--text);
	}

	/* The welcome: the greeting in the display face, what the tour holds, one clear start. */
	.welcome {
		overflow: hidden;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-5) var(--space-4);
	}

	.welcome h2 {
		position: relative;
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: 700;
		line-height: 1.05;
	}

	.welcome #tour-text {
		position: relative;
		max-width: 30ch;
	}

	.chapters {
		position: relative;
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chapters li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.chapters li > span:last-child {
		display: grid;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.chapters strong {
		color: var(--text);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.mark {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.welcome .actions {
		position: relative;
		margin-top: var(--space-1);
	}

	/* In the bold look the start page's story card in small: Poster Black, the greeting in the
	   brand colour, the logo large and dim behind it. In both schemes, like the card itself. */
	.story {
		border-color: color-mix(in oklab, var(--brand) 22%, transparent);
		background: var(--brand-ink);
		color: #f2eee4;
		color-scheme: dark;
	}

	.story h2 {
		color: var(--accent-dark, var(--brand));
	}

	.story #tour-text,
	.story .chapters li > span:last-child,
	.story .link {
		color: color-mix(in oklab, #f2eee4 78%, transparent);
	}

	.story .chapters strong,
	.story .link:hover {
		color: #f2eee4;
	}

	.story .mark {
		background: color-mix(in oklab, var(--brand) 18%, transparent);
		color: var(--accent-dark, var(--brand));
	}

	.story .start {
		background: var(--accent-dark, var(--brand));
		color: var(--brand-ink);
	}

	.story .link:focus-visible,
	.story .start:focus-visible {
		outline-color: var(--brand);
	}

	.watermark {
		position: absolute;
		top: -24px;
		right: -48px;
		width: 190px;
		height: 190px;
		opacity: 0.16;
		pointer-events: none;
	}
</style>

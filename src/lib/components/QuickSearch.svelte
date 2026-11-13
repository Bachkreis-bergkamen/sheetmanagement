<script lang="ts" module>
	interface Index {
		pieces: { id: string; title: string; composer?: string; search: string; instruments: string[]; songs?: string[]; notes: string[] }[];
		concerts: { id: string; title: string; when: string; dateKey: string; search: string }[];
		today: string;
	}

	/** Loaded once per page visit, when the search is first opened (or about to be). */
	let index: Promise<Index | null> | null = null;
	export function loadIndex() {
		index ??= fetch('/api/suche')
			.then((response) => (response.ok ? (response.json() as Promise<Index>) : null))
			.catch(() => null);
		// A failed load is tried again next time.
		index.then((loaded) => {
			if (!loaded) index = null;
		});
		return index;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '#lib/i18n/index.ts';
	import { readLocalJson, writeLocalJson } from '#lib/local-storage.ts';
	import { searchText } from '#lib/music/text.ts';
	import { findPiece } from '#lib/music/piece-search.ts';
	import type { NavGroup } from '#lib/nav.ts';
	import Icon, { type IconName } from './Icon.svelte';
	import Nothing from './Nothing.svelte';

	/**
	 * Jump anywhere with Ctrl+K (⌘K on a Mac): pages, pieces and concerts, searched while typing.
	 * Without a search it shows what comes up next and what was opened last on this device.
	 */
	let { groups, open = $bindable(false) }: { groups: NavGroup[]; open?: boolean } = $props();

	interface Hit {
		href: string;
		title: string;
		sub?: string;
		icon: IconName;
		/** The way on to a whole list, not a single thing: not kept under "Zuletzt geöffnet". */
		more?: boolean;
	}

	const RECENT = 'quick-search-recent';
	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let query = $state('');
	let active = $state(0);
	let data = $state<Index | null>(null);
	let loading = $state(false);
	let recent = $state<Hit[]>([]);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			query = '';
			active = 0;
			const kept = readLocalJson(RECENT);
			recent = Array.isArray(kept) ? kept : [];
			dialog.showModal();
			input?.focus();
			loading = !data;
			loadIndex().then((loaded) => {
				data = loaded;
				loading = false;
			});
		} else if (!open && dialog.open) dialog.close();
	});

	const pages = $derived(
		groups.flatMap((group) => group.items.map((item): Hit => ({ href: item.href, title: item.label, sub: group.label, icon: item.icon })))
	);

	const sections = $derived.by(() => {
		const words = searchText(query).split(/\s+/).filter(Boolean);
		const matches = (text: string) => words.every((word) => text.includes(word));
		// Titles that start with the search come first: "egm" → Egmont before "Musik zu Egmont".
		const first = (title: string) => (searchText(title).startsWith(words[0] ?? '') ? 0 : 1);
		const byStart = <T extends { title: string }>(list: T[]) => [...list].sort((a, b) => first(a.title) - first(b.title));

		if (!words.length) {
			const month = data?.today.slice(0, 7) ?? '';
			const upcoming = (data?.concerts ?? [])
				.filter((concert) => concert.dateKey >= month)
				.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
				.slice(0, 3)
				.map((concert): Hit => ({ href: concertHref(concert.id), title: concert.title, sub: concert.when, icon: 'calendar' }));
			return [
				{ label: t.quickSearch.recent, hits: recent },
				{ label: t.quickSearch.upcoming, hits: upcoming },
				{ label: t.quickSearch.pages, hits: pages }
			].filter((section) => section.hits.length);
		}
		// The archive's own matching: by title, composer, a part or a note, with the reason shown.
		const pieces = byStart(
			(data?.pieces ?? []).flatMap((piece) => {
				// An index cached from before parts and notes were in it (up to 5 minutes) still searches titles.
				const by = findPiece({ search: piece.search, instruments: piece.instruments ?? [], songs: piece.songs ?? [], notes: piece.notes ?? [] }, words);
				if (!by) return [];
				const why = by.instruments.length
					? t.pieces.foundParts(by.instruments.join(', '))
					: by.song
						? t.pieces.foundSong(by.song)
						: by.note
							? t.pieces.foundNote(by.note)
							: undefined;
				return [{ ...piece, why }];
			})
		);
		// More than fit here, or found by a part or a note: the archive's list shows them all, with filters.
		const archive: Hit[] = pieces.length
			? [{ href: `/stuecke?suche=${encodeURIComponent(query.trim())}`, title: t.quickSearch.inArchive(pieces.length), icon: 'list', more: true }]
			: [];
		return [
			{
				label: t.quickSearch.pages,
				hits: byStart(pages.filter((page) => matches(searchText(page.title, page.sub))))
			},
			{
				label: t.quickSearch.pieces,
				hits: [
					...pieces
						.slice(0, 6)
						.map((piece): Hit => ({ href: `/stuecke/${encodeURIComponent(piece.id)}`, title: piece.title, sub: piece.why ?? piece.composer, icon: 'music' })),
					...archive
				]
			},
			{
				label: t.quickSearch.concerts,
				hits: byStart((data?.concerts ?? []).filter((concert) => matches(concert.search)))
					.slice(0, 6)
					.map((concert): Hit => ({ href: concertHref(concert.id), title: concert.title, sub: concert.when, icon: 'calendar' }))
			}
		].filter((section) => section.hits.length);
	});

	const hits = $derived(sections.flatMap((section) => section.hits));
	const concertHref = (id: string) => `/kalender/${encodeURIComponent(id)}`;

	// A new search starts at the top.
	$effect(() => {
		void query;
		active = 0;
	});

	function choose(hit: Hit | undefined) {
		if (!hit) return;
		// Pieces and concerts are remembered for next time; pages are always listed anyway.
		if (!hit.more && !pages.some((page) => page.href === hit.href)) {
			const next = [hit, ...recent.filter((other) => other.href !== hit.href)].slice(0, 4);
			writeLocalJson(RECENT, next);
		}
		open = false;
		goto(hit.href);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + hits.length) % Math.max(hits.length, 1);
			document.getElementById(`quick-hit-${active}`)?.scrollIntoView({ block: 'nearest' });
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(hits[active]);
		}
	}

	// Ctrl+K / ⌘K from anywhere, also inside a text field.
	function shortcut(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			open = !open;
		}
	}
</script>

<svelte:window onkeydown={shortcut} />

<dialog
	bind:this={dialog}
	class="quick"
	aria-label={t.quickSearch.label}
	onclose={() => (open = false)}
	onclick={(event) => {
		// A click on the dimmed backdrop (the dialog element itself) closes it.
		if (event.target === dialog) open = false;
	}}
>
	<div class="box">
		<label class="field">
			<Icon name="search" size={20} />
			<input
				bind:this={input}
				bind:value={query}
				type="search"
				role="combobox"
				aria-expanded="true"
				aria-controls="quick-hits"
				aria-activedescendant={hits.length ? `quick-hit-${active}` : undefined}
				aria-autocomplete="list"
				aria-label={t.quickSearch.label}
				placeholder={t.quickSearch.placeholder}
				autocomplete="off"
				spellcheck="false"
				onkeydown={keydown}
			/>
			<kbd>Esc</kbd>
		</label>

		<div class="results" id="quick-hits" role="listbox" aria-label={t.quickSearch.label}>
			{#each sections as section (section.label)}
				<div class="group" role="group" aria-label={section.label}>
					<p class="heading" aria-hidden="true">{section.label}</p>
					{#each section.hits as hit (hit.href)}
						{@const i = hits.indexOf(hit)}
						<!-- The keyboard stays in the search field (arrows and Enter), so options only take clicks. -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							id="quick-hit-{i}"
							class="hit"
							class:active={i === active}
							role="option"
							aria-selected={i === active}
							tabindex="-1"
							onclick={() => choose(hit)}
							onpointermove={() => (active = i)}
						>
							<span class="icon"><Icon name={hit.icon} size={18} /></span>
							<span class="text">
								<span class="title" class:more={hit.more}>{hit.title}</span>
								{#if hit.sub}<span class="sub">{hit.sub}</span>{/if}
							</span>
							<span class="enter" aria-hidden="true"><Icon name="arrow" size={14} /></span>
						</div>
					{/each}
				</div>
			{:else}
				{#if loading}<p class="empty">{t.quickSearch.loading}</p>{:else}<Nothing text={t.quickSearch.none(query.trim())} />{/if}
			{/each}
			{#if loading && query.trim() && hits.length}<p class="empty">{t.quickSearch.loading}</p>{/if}
		</div>

		<p class="keys" aria-hidden="true">{t.quickSearch.keys}</p>
	</div>
</dialog>

<style>
	.quick {
		width: min(640px, calc(100vw - 2 * var(--space-4)));
		max-width: none;
		max-height: min(560px, calc(100dvh - 2 * var(--space-6)));
		margin: min(12vh, 120px) auto auto;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
		color: var(--text);
	}

	.quick[open] {
		animation: rise 0.18s var(--ease);
	}

	.quick::backdrop {
		background: var(--scrim);
		backdrop-filter: blur(3px);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}

	.box {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		max-height: inherit;
	}

	.field {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--hairline);
		color: var(--text-muted);
	}

	.field input {
		flex: 1;
		min-width: 0;
		padding: var(--space-2) 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-lg);
	}

	kbd {
		padding: 2px 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius-xs);
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.results {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--space-2);
	}

	.heading {
		margin: var(--space-2) var(--space-3) var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.hit {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		cursor: pointer;
	}

	.hit.active {
		background: var(--accent-soft);
	}

	.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text-muted);
	}

	.hit.active .icon {
		background: var(--surface);
		color: var(--accent);
	}

	.text {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.title,
	.sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title {
		font-weight: 600;
	}

	/* The way on to the archive's whole list, in the accent like a link. */
	.title.more {
		color: var(--accent);
	}

	.sub {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.enter {
		display: grid;
		color: var(--accent);
		opacity: 0;
		transition: opacity var(--fast) var(--ease);
	}

	.hit.active .enter {
		opacity: 1;
	}

	.empty {
		margin: var(--space-5) var(--space-4);
		color: var(--text-muted);
		text-align: center;
	}

	.keys {
		margin: 0;
		padding: var(--space-2) var(--space-4);
		border-top: 1px solid var(--hairline);
		color: var(--text-muted);
		font-size: var(--text-2xs);
	}

	/* On a phone it fills the top of the screen, above the keyboard. */
	@media (max-width: 640px) {
		.quick {
			width: 100%;
			max-height: 100dvh;
			margin: 0;
			border-width: 0 0 1px;
			border-radius: 0 0 var(--radius-l) var(--radius-l);
		}

		.keys,
		kbd {
			display: none;
		}
	}
</style>

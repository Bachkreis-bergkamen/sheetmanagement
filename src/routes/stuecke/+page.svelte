<script lang="ts">
	import { listHas } from '#lib/repertoire/lists.ts';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import { searchText } from '#lib/music/text.ts';
	import { findPiece, type FoundBy } from '#lib/music/piece-search.ts';
	import AddToArchive from '#lib/components/AddToArchive.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Nothing from '#lib/components/Nothing.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();

	const NEEDS_WORK = '__needs-work';
	const NO_MUSIC = '__no-music';
	const RECORDING = '__recording';
	let query = $state('');
	let filter = $state('');
	let input: HTMLInputElement | undefined = $state();

	// Keep search and filter when coming back from a piece.
	export const snapshot = {
		capture: () => ({ query, filter }),
		restore: (value: { query: string; filter: string }) => ({ query, filter } = value)
	};

	const recordings = $derived(data.pieces.filter((piece) => piece.recording).length);

	// Programmes first ("A-Orchester", "Ehemaligenorchester"), then categories like "Weihnachtsstücke".
	const filters = $derived([
		{ value: '', label: t.pieces.all },
		...data.programs.map((program) => ({ value: `program:${program}`, label: program })),
		...data.categories.map((category) => ({ value: `category:${category}`, label: category })),
		{ value: NEEDS_WORK, label: t.pieces.needsWork },
		...(data.pieces.some((piece) => piece.status === 'none') ? [{ value: NO_MUSIC, label: t.pieces.noMusic }] : []),
		...(recordings ? [{ value: RECORDING, label: t.pieces.withRecording(recordings) }] : [])
	]);

	// "/stuecke?komponist=Bach", linked from a piece page: all works by one composer.
	const composer = $derived(page.url.searchParams.get('komponist')?.trim() || null);
	const activeCategory = $derived(filter.startsWith('category:') ? filter.slice('category:'.length) : null);

	const matches = $derived.by(() => {
		const words = searchText(query).split(/\s+/).filter(Boolean);
		const found = new Map<string, FoundBy>();
		const result = data.pieces.filter((piece) => {
			// Also the works this composer wrote with others ("Mozart, Haydn").
			if (composer && !listHas(piece.composer, composer)) return false;
			if (filter === NEEDS_WORK && (piece.status === 'ok' || piece.status === 'none')) return false;
			if (filter === NO_MUSIC && piece.status !== 'none') return false;
			if (filter === RECORDING && !piece.recording) return false;
			if (filter.startsWith('program:') && !piece.programs.includes(filter.slice('program:'.length))) return false;
			if (filter.startsWith('category:') && piece.category !== filter.slice('category:'.length)) return false;
			const by = findPiece(piece, words);
			if (by && (by.instruments.length || by.note)) found.set(piece.id, by);
			return !!by;
		});
		return { result, found };
	});
	const visible = $derived(matches.result);
	// Why a piece was found, when only by a part or a note ("Bariton", "Goldfinger").
	const foundBy = $derived(matches.found);

	const letterOf = (title: string) => {
		const first = searchText(title.charAt(0)).toUpperCase();
		return /[A-Z]/.test(first) ? first : '#';
	};

	const groups = $derived.by(() => {
		const result: { letter: string; pieces: typeof visible }[] = [];
		for (const piece of visible) {
			const letter = letterOf(piece.title);
			if (result.at(-1)?.letter !== letter) result.push({ letter, pieces: [] });
			result.at(-1)!.pieces.push(piece);
		}
		return result;
	});

	onMount(() => {
		// "/" jumps to the search field, like on many sites.
		const onKey = (event: KeyboardEvent) => {
			if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
				event.preventDefault();
				input?.focus();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<Title title={t.pieces.title} />
<PageHeader title={t.pieces.title} lead={t.pieces.lead} />

{#if data.error === 'not-configured'}
	<EmptyState icon="music" text={t.pieces.empty} />
{:else if data.error}
	<div class="notice">
		<p>{t.pieces.failed}</p>
		<a href="/status">{t.pieces.checkStatus}</a>
	</div>
{:else}
	<div class="tools">
		<label class="search">
			<Icon name="search" size={18} />
			<input
				bind:this={input}
				bind:value={query}
				type="search"
				placeholder={t.pieces.search}
				aria-label={t.pieces.search}
				autocomplete="off"
				spellcheck="false"
			/>
			{#if query}
				<button class="clear" onclick={() => (query = '')} aria-label={t.pieces.clearSearch}>
					<Icon name="x" size={16} />
				</button>
			{/if}
		</label>

		{#if composer}
			<a class="composer" href="/stuecke" aria-label={t.pieces.clearComposer} title={t.pieces.clearComposer}>
				{t.pieces.byComposer(composer)}
				<Icon name="x" size={14} />
			</a>
		{/if}

		<div class="chips" role="radiogroup" aria-label={t.pieces.filter}>
			{#each filters as option (option.value)}
				<button
					class="chip"
					class:active={filter === option.value}
					role="radio"
					aria-checked={filter === option.value}
					onclick={() => (filter = option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</div>

	{#if activeCategory && data.categoryFiles[activeCategory]?.length}
		<div class="category-files">
			<span class="label">{t.pieces.categoryFiles}</span>
			{#each data.categoryFiles[activeCategory] as file (file.id)}
				<a href={file.url} target="_blank" rel="noopener noreferrer"><Icon name="file" size={16} />{file.name}</a>
			{/each}
		</div>
	{/if}

	<p class="count" aria-live="polite">
		{t.pieces.count(visible.length)}
		{#if filter === NEEDS_WORK}· <a class="gaps-link" href="/fehlende-stimmen">{t.gaps.link} →</a>{/if}
	</p>

	{#if visible.length === 0}
		<Nothing text={t.pieces.noResults} glyphs={['violin', 'clarinet', 'trumpet']}>
			{#if query || filter}<button class="btn secondary" onclick={() => ((query = ''), (filter = ''))}>{t.pieces.clearSearch}</button>{/if}
		</Nothing>
	{:else}
		{#each groups as group (group.letter)}
			<section class="group">
				<h2 class="letter">{group.letter}</h2>
				<ul class="ui-list">
					{#each group.pieces as piece (piece.id)}
						<li>
							<a class="row" href="/stuecke/{piece.id}">
								<span class="main">
									<span class="title">
										{piece.title}
										{#if piece.recording}<span class="listen" title={t.piece.recording}><Icon name="headphones" size={14} /></span>{/if}
									</span>
									{#if piece.composer || piece.catalogue || piece.category || piece.programs.length}
										<span class="meta">
											{[piece.composer, piece.catalogue].filter(Boolean).join(' · ')}
											{#each piece.programs as program (program)}<span class="tag program">{program}</span>{/each}
											{#if piece.category}<span class="tag">{piece.category}</span>{/if}
										</span>
									{/if}
									{#if foundBy.get(piece.id)}
										{@const by = foundBy.get(piece.id)!}
										<span class="found">
											{#if by.instruments.length}<span>{t.pieces.foundParts(by.instruments.join(', '))}</span>{/if}
											{#if by.note}<span class="note">{t.pieces.foundNote(by.note)}</span>{/if}
										</span>
									{/if}
								</span>
								<span class="side">
									{#if piece.status !== 'ok'}
										<span class="status {piece.status}">{t.pieces.status[piece.status]}</span>
									{/if}
									{#if piece.status !== 'none'}<span class="parts">{t.pieces.parts(piece.partCount)}</span>{/if}
									<span class="chevron"><Icon name="chevron" size={16} /></span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
{/if}

{#if data.canAdd}
	<AddToArchive result={form} />
{/if}

<style>
	.listen {
		display: inline-flex;
		vertical-align: -2px;
		margin-left: var(--space-1);
		color: var(--accent);
	}

	.gaps-link {
		color: var(--accent);
		font-weight: 600;
	}

	.tools {
		position: sticky;
		top: var(--header-height);
		z-index: 5;
		display: grid;
		gap: var(--space-3);
		margin: 0 calc(-1 * var(--space-4));
		padding: var(--space-3) var(--space-4);
		background: color-mix(in oklab, var(--bg) 85%, transparent);
		backdrop-filter: saturate(1.6) blur(20px);
		-webkit-backdrop-filter: saturate(1.6) blur(20px);
		border-bottom: 1px solid transparent;
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		height: 46px;
		padding: 0 var(--space-2) 0 var(--space-4);
		border: 1px solid transparent;
		border-radius: var(--radius-m);
		background: var(--surface-2);
		color: var(--text-muted);
		transition:
			border-color var(--fast) var(--ease),
			background var(--fast) var(--ease),
			box-shadow var(--fast) var(--ease);
	}

	.search:focus-within {
		border-color: var(--accent);
		background: var(--surface);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}

	.search input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-base);
	}

	.search input::-webkit-search-cancel-button {
		display: none;
	}

	.clear {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		cursor: pointer;
	}

	.chips {
		display: flex;
		gap: var(--space-2);
		overflow-x: auto;
		scrollbar-width: none;
		margin: 0 calc(-1 * var(--space-4));
		padding: 0 var(--space-4);
	}

	.chips::-webkit-scrollbar {
		display: none;
	}

	.chip {
		flex: none;
		min-height: 34px;
		padding: 0 14px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.chip:hover {
		color: var(--text);
	}

	.chip.active {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.composer {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-2);
		padding: 6px 12px 6px 14px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.composer:hover {
		background: color-mix(in oklab, var(--accent) 22%, transparent);
	}

	.category-files {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		font-size: var(--text-md);
	}

	.category-files .label {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.category-files a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-weight: 600;
	}

	.count {
		margin: var(--space-3) 0 var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.group {
		margin-top: var(--space-5);
	}

	.letter {
		margin: 0 0 var(--space-2) var(--space-1);
		color: var(--accent);
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 60px;
		padding: var(--space-3) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	.row:hover {
		background: var(--surface-2);
	}

	.main {
		display: grid;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.found {
		display: grid;
		gap: 2px;
		color: var(--accent);
		font-size: var(--text-sm);
	}

	.found .note {
		color: var(--text-muted);
		font-style: italic;
	}

	.tag {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
		white-space: nowrap;
	}

	/* Pieces in a current programme stand out, softly. */
	.tag.program {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.side {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.status {
		padding: 1px var(--space-2);
		white-space: nowrap;
		border-radius: var(--radius-pill);
		font-size: var(--text-2xs);
		font-weight: 600;
		color: var(--warn);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
	}

	.status.none {
		color: var(--text-muted);
		background: var(--surface-2);
	}

	.status.missing {
		color: var(--danger);
		background: color-mix(in oklab, var(--danger) 12%, transparent);
	}

	.chevron {
		display: grid;
		transition: transform 0.15s;
	}

	.row:hover .chevron {
		transform: translateX(2px);
		color: var(--accent);
	}

	.none,
	.notice {
		padding: var(--space-6) var(--space-4);
		text-align: center;
		color: var(--text-muted);
	}

	.notice {
		display: grid;
		gap: var(--space-3);
		justify-items: center;
	}

	.notice a {
		color: var(--accent);
		font-weight: 600;
	}

	@media (max-width: 560px) {
		.parts {
			display: none;
		}

		.side {
			gap: var(--space-2);
		}
	}
</style>

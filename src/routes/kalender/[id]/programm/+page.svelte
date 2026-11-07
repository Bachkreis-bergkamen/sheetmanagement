<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { guardUnsaved } from '#lib/unsaved.svelte.ts';
	import { flip } from 'svelte/animate';
	import { t } from '#lib/i18n/index.ts';
	import { searchText } from '#lib/music/text.ts';
	import { isJoint, programLabel } from '#lib/repertoire/orchestras.ts';
	import { formatDuration, parseDuration, programLength, roundMinutes } from '#lib/repertoire/duration.ts';
	import { similarPieces } from '#lib/repertoire/archive-edit.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();

	interface Entry {
		key: number;
		piece: string;
		title: string;
		subtitle?: string;
		notes: string;
		duration?: number;
		/** A guest piece's own details, kept on its programme row. */
		composer?: string;
		arranger?: string;
		publisher?: string;
		durationText?: string;
	}

	let nextKey = 0;
	// The editor's working copy; the page data is only the starting point.
	// svelte-ignore state_referenced_locally
	let entries = $state<Entry[]>(data.state === 'ready' ? data.entries.map((entry) => ({ ...entry, key: nextKey++ })) : []);
	let query = $state('');
	const saving = new FormState();
	const sharing = new FormState();
	let dragged = $state<number | null>(null);

	const matches = $derived.by(() => {
		if (data.state !== 'ready') return [];
		const words = searchText(query).split(/\s+/).filter(Boolean);
		if (!words.length) return [];
		return data.pieces.filter((piece) => words.every((word) => piece.search.includes(word))).slice(0, 8);
	});

	function add(piece: { name: string; title: string; subtitle?: string; duration?: number }) {
		entries.push({ key: nextKey++, piece: piece.name, title: piece.title, subtitle: piece.subtitle, duration: piece.duration, notes: '' });
		query = '';
	}

	// The programme's length while it's put together (#117).
	const length = $derived(programLength(entries.map((entry) => entry.duration)));

	function move(from: number, to: number) {
		if (to < 0 || to >= entries.length || from === to) return;
		const [entry] = entries.splice(from, 1);
		entries.splice(to, 0, entry);
	}

	const payload = $derived(
		JSON.stringify(
			entries.map(({ piece, notes, composer, arranger, publisher, durationText }) => ({ piece, notes, composer, arranger, publisher, duration: durationText }))
		)
	);

	// A piece the guests bring: not in our archive, typed in with what the GEMA list needs.
	let guestPiece = $state<{ title: string; composer: string; arranger: string; publisher: string; duration: string } | null>(null);
	function addGuestPiece() {
		if (!guestPiece?.title.trim()) return;
		const { title, composer, arranger, publisher, duration } = guestPiece;
		const clean = (text: string) => text.trim() || undefined;
		entries.push({
			key: nextKey++,
			piece: title.trim(),
			title: title.trim(),
			subtitle: clean(composer),
			duration: parseDuration(duration),
			notes: '',
			composer: clean(composer),
			arranger: clean(arranger),
			publisher: clean(publisher),
			durationText: clean(duration)
		});
		guestPiece = null;
	}
	// svelte-ignore state_referenced_locally
	const saved = payload;
	guardUnsaved(() => payload !== saved && !saving.busy && !sharing.busy);

	// Suggestions taken into the programme; on saving, their wishes become "geplant".
	let takenWishes = $state<string[]>([]);
	type Suggestion = Extract<typeof data, { state: 'ready' }>['suggestions']['wished'][number];
	const inProgram = $derived(new Set(entries.map((entry) => entry.piece)));
	const open = (list: Suggestion[]) => list.filter((s) => !s.name || !inProgram.has(s.name));
	function take(suggestion: Suggestion) {
		if (!suggestion.name) return;
		add({ name: suggestion.name, title: suggestion.title, subtitle: suggestion.subtitle, duration: suggestion.duration });
		takenWishes.push(...suggestion.wishIds);
	}
	const year = (key?: string) => key?.slice(0, 4);

	// A piece that isn't in the archive yet, typed into the search (#192).
	type Pickable = { name: string; title: string; composer?: string; subtitle?: string; duration?: number };
	let creating = $state<{ title: string; composer: string; catalogue: string } | null>(null);
	let serverSimilar = $state<Pickable[]>([]);
	const creatingPiece = new FormState();
	const similar = $derived<Pickable[]>(
		creating && data.state === 'ready' ? similarPieces(creating, data.pieces).filter((piece) => !inProgram.has(piece.name)) : []
	);
	const shownSimilar = $derived(similar.length ? similar : serverSimilar);
	const composers = $derived(
		data.state === 'ready' ? [...new Set(data.pieces.flatMap((piece) => piece.composer || []))].sort((a, b) => a.localeCompare(b)) : []
	);
	function startCreating() {
		creating = { title: query.trim(), composer: '', catalogue: '' };
		serverSimilar = [];
		query = '';
	}
	function takeSimilar(piece: Pickable) {
		add(piece);
		creating = null;
	}
</script>

<Title title={t.editor.edit} />

<Crumbs
	items={[
		{ href: '/kalender', label: t.concerts.title },
		{ href: `/kalender/${encodeURIComponent(data.concert.id)}`, label: data.concert.title }
	]}
/>

<header class="head">
	<h1>{t.editor.title(data.concert.title)}</h1>
	<p>{t.editor.lead}</p>
</header>

{#if data.state !== 'ready'}
	<p class="notice">{t.editor.notInSheet}</p>
{:else}
	{#if form?.message}<p class="message" role="alert">{form.message}</p>{/if}

	{#if data.orchestras.length}
		<!-- One programme per orchestra; a full load, so the list starts from that orchestra's. -->
		<nav class="tabs" aria-label={t.editor.orchestras}>
			{#each data.orchestras as orchestra (orchestra)}
				<a
					class="tab"
					class:active={orchestra === data.orchestra}
					aria-current={orchestra === data.orchestra ? 'page' : undefined}
					href="?orchester={encodeURIComponent(orchestra)}"
					data-sveltekit-reload
				>
					{#if isJoint(orchestra)}<Icon name="link" size={14} />{/if}{data.labels[orchestra] ?? programLabel(orchestra)}
				</a>
			{/each}
		</nav>
		{#if isJoint(data.orchestra)}<p class="joint-hint">{t.editor.jointHint(data.scopeNames)}</p>{/if}
	{/if}

	{#if data.sharedFrom}
		<p class="shared">
			<Icon name="link" size={16} />
			<span>
				{t.editor.sharedFrom(data.sharedFrom.title)}
				<a href="/kalender/{encodeURIComponent(data.sharedFrom.id)}/programm">{t.editor.editSource}</a>.
				{t.editor.ownProgram}
			</span>
		</p>
	{:else if data.sharedWith.length}
		<p class="shared">
			<Icon name="link" size={16} />
			<span>{t.editor.sharedWith(data.sharedWith.map((other) => t.common.quote(other.title)).join(', '))}</span>
		</p>
	{/if}

	<div class="search">
		<label class="field">
			<Icon name="search" size={18} />
			<input
				bind:value={query}
				type="search"
				placeholder={t.editor.search}
				aria-label={t.editor.search}
				autocomplete="off"
				spellcheck="false"
				onkeydown={(event) => {
					if (event.key === 'Enter' && matches[0]) {
						event.preventDefault();
						add(matches[0]);
					}
				}}
			/>
		</label>
		{#if query}
			<ul class="results">
				{#each matches as piece (piece.name)}
					<li>
						<button type="button" onclick={() => add(piece)}>
							<Icon name="plus" size={16} />
							<span>
								<strong>{piece.title}</strong>
								{#if piece.subtitle}<span class="muted">{piece.subtitle}</span>{/if}
							</span>
						</button>
					</li>
				{:else}
					<li class="none">{t.editor.noResults}</li>
				{/each}
				{#if data.canAddPieces && query.trim()}
					<li class="create">
						<button type="button" onclick={startCreating}>
							<Icon name="plus" size={16} />
							<span><strong>{t.editor.newPiece(query.trim())}</strong></span>
						</button>
					</li>
				{/if}
			</ul>
		{/if}
	</div>

	{#if creating}
		<form
			class="new-piece"
			method="POST"
			action="?orchester={encodeURIComponent(data.orchestra)}&/newPiece"
			use:enhance={creatingPiece.submit({
				onSuccess: (result) => {
					const outcome = result?.newPiece as { piece?: Pickable; similar?: Pickable[] } | undefined;
					if (outcome?.piece) takeSimilar(outcome.piece);
					else serverSimilar = outcome?.similar ?? [];
				}
			})}
		>
			<h2>{t.editor.newPieceTitle}</h2>
			<p class="muted">{t.editor.newPieceLead}</p>
			{#if form?.newPiece && 'error' in form.newPiece}<p class="message" role="alert">{form.newPiece.error}</p>{/if}
			<label class="input">
				{t.archive.pieceTitle}
				<input name="title" required maxlength="200" bind:value={creating.title} autocomplete="off" />
			</label>
			<label class="input">
				{t.archive.composer}
				<input name="composer" maxlength="200" bind:value={creating.composer} list="known-composers" autocomplete="off" />
			</label>
			<datalist id="known-composers">
				{#each composers as composer (composer)}<option value={composer}></option>{/each}
			</datalist>
			<label class="input">
				{t.archive.catalogue}
				<input name="catalogue" maxlength="200" bind:value={creating.catalogue} autocomplete="off" />
			</label>
			{#if shownSimilar.length}
				<div class="similar" role="status">
					<h3>{t.editor.similarTitle}</h3>
					<ul>
						{#each shownSimilar as piece (piece.name)}
							<li>
								<span class="body">
									<strong>{piece.title}</strong>
									{#if piece.subtitle}<span class="muted">{piece.subtitle}</span>{/if}
								</span>
								<button type="button" class="take" onclick={() => takeSimilar(piece)}>
									<Icon name="plus" size={16} /><span>{t.editor.similarTake}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
				<input type="hidden" name="anyway" value="1" />
			{/if}
			<div class="new-actions">
				<button class="button" class:secondary={shownSimilar.length > 0} disabled={creatingPiece.busy}>
					<Icon name="plus" size={16} />{shownSimilar.length ? t.editor.newPieceAnyway : t.editor.newPieceSave}
				</button>
				<button type="button" class="cancel link" onclick={() => (creating = null)}>{t.reports.cancel}</button>
			</div>
		</form>
	{/if}

	{#if data.guests}
		{#if guestPiece}
			<form
				class="new-piece"
				onsubmit={(event) => {
					event.preventDefault();
					addGuestPiece();
				}}
			>
				<h2>{t.partners.guestPiece}</h2>
				<p class="muted">{t.partners.guestPieceLead}</p>
				<label class="input">
					{t.partners.guestTitle}
					<input required maxlength="300" bind:value={guestPiece.title} autocomplete="off" />
				</label>
				<label class="input">
					{t.partners.guestComposer}
					<input maxlength="300" bind:value={guestPiece.composer} autocomplete="off" />
				</label>
				<label class="input">
					{t.partners.guestArranger}
					<input maxlength="300" bind:value={guestPiece.arranger} autocomplete="off" />
				</label>
				<label class="input">
					{t.partners.guestPublisher}
					<input maxlength="300" bind:value={guestPiece.publisher} autocomplete="off" />
				</label>
				<label class="input">
					{t.partners.guestDuration}
					<input maxlength="20" bind:value={guestPiece.duration} inputmode="numeric" autocomplete="off" />
				</label>
				<div class="new-actions">
					<button class="button"><Icon name="plus" size={16} />{t.partners.guestAdd}</button>
					<button type="button" class="cancel link" onclick={() => (guestPiece = null)}>{t.reports.cancel}</button>
				</div>
			</form>
		{:else}
			<button type="button" class="guest-add" onclick={() => (guestPiece = { title: query.trim(), composer: '', arranger: '', publisher: '', duration: '' })}>
				<Icon name="plus" size={16} />{t.partners.guestPiece}
			</button>
		{/if}
	{/if}

	{#if data.suggestions.wished.length || data.suggestions.longAgo.length}
		<details class="suggestions" open={data.suggestions.wished.length > 0}>
			<summary>
				<Icon name="bulb" size={16} />{t.editor.suggestions}
				{#if data.suggestions.wished.length}<span class="count">{data.suggestions.wished.length}</span>{/if}
			</summary>
			{#if data.suggestions.genres.length}
				<p class="muted small">{t.editor.genres(data.suggestions.genres.join(', '))}</p>
			{/if}
			{#snippet list(items: Suggestion[])}
				<ul class="suggestion-list">
					{#each open(items) as suggestion (suggestion.pieceId ?? suggestion.title)}
						<li>
							<span class="body">
								<strong>{suggestion.title}</strong>
								<span class="hints">
									{#if suggestion.votes}<span class="tag accent">{t.wishes.votes(suggestion.votes)}</span>{/if}
									{#if suggestion.forThisConcert}<span class="tag accent">{t.editor.forThisConcert}</span>{/if}
									{#if suggestion.lastPlayed}<span class="tag">{t.editor.lastPlayed(year(suggestion.lastPlayed) ?? '')}</span>{/if}
									{#if suggestion.genre}<span class="tag" class:new={suggestion.newGenre}>{suggestion.genre}{suggestion.newGenre ? ` · ${t.editor.newGenre}` : ''}</span>{/if}
									{#if suggestion.status && suggestion.status !== 'ok'}<span class="tag warn">{t.pieces.status[suggestion.status]}</span>{/if}
									{#if !suggestion.name}<span class="tag">{t.editor.notInArchive}</span>{/if}
								</span>
							</span>
							{#if suggestion.name}
								<button type="button" class="take" onclick={() => take(suggestion)} title={t.editor.take}>
									<Icon name="plus" size={16} /><span>{t.editor.take}</span>
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/snippet}
			{#if open(data.suggestions.wished).length}
				<h3>{t.editor.wished}</h3>
				{@render list(data.suggestions.wished)}
			{/if}
			{#if open(data.suggestions.longAgo).length}
				<h3>{t.editor.longAgo}</h3>
				{@render list(data.suggestions.longAgo)}
			{/if}
		</details>
	{/if}

	{#if entries.length}
		<ol class="entries">
			{#each entries as entry, i (entry.key)}
				<li
					animate:flip={{ duration: 180 }}
					class:dragging={dragged === i}
					ondragover={(event) => {
						event.preventDefault();
						if (dragged !== null && dragged !== i) {
							move(dragged, i);
							dragged = i;
						}
					}}
					ondrop={(event) => event.preventDefault()}
				>
					<span
						class="handle"
						draggable="true"
						role="button"
						tabindex="-1"
						aria-hidden="true"
						ondragstart={(event) => {
							dragged = i;
							event.dataTransfer?.setData('text/plain', String(i));
						}}
						ondragend={() => (dragged = null)}
					>
						<Icon name="grip" size={18} />
					</span>
					<span class="number">{i + 1}</span>
					<span class="body">
						<strong>{entry.title}{#if entry.composer}<span class="tag">{t.partners.guestTag}</span>{/if}</strong>
						{#if entry.subtitle || entry.duration}
							<span class="muted">{[entry.subtitle, entry.duration && formatDuration(entry.duration)].filter(Boolean).join(' · ')}</span>
						{/if}
						<input
							class="note"
							bind:value={entry.notes}
							placeholder={t.editor.notePlaceholder}
							aria-label="{t.editor.noteLabel}: {entry.title}"
							maxlength="300"
						/>
					</span>
					<span class="actions">
						<button type="button" onclick={() => move(i, i - 1)} disabled={i === 0} title={t.editor.up} aria-label={t.editor.up}>
							<Icon name="up" size={18} />
						</button>
						<button
							type="button"
							onclick={() => move(i, i + 1)}
							disabled={i === entries.length - 1}
							title={t.editor.down}
							aria-label={t.editor.down}
						>
							<Icon name="down" size={18} />
						</button>
						<button type="button" class="remove" onclick={() => entries.splice(i, 1)} title={t.editor.remove} aria-label={t.editor.remove}>
							<Icon name="trash" size={16} />
						</button>
					</span>
				</li>
			{/each}
		</ol>
		<p class="length" aria-live="polite">
			<Icon name="clock" size={16} />
			{length.known ? t.duration.total(roundMinutes(length.seconds), length.missing) : t.duration.unknown}
		</p>
	{:else}
		<p class="notice">{t.editor.empty}</p>
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={saving.submit()}
	>
		<input type="hidden" name="entries" value={payload} />
		<input type="hidden" name="version" value={data.version} />
		<input type="hidden" name="orchestra" value={data.orchestra} />
		<input type="hidden" name="wishes" value={takenWishes.join(',')} />
		<button class="button" disabled={saving.busy}><Icon name="check" size={16} />{t.editor.save}</button>
		<a class="cancel" href="/kalender/{encodeURIComponent(data.concert.id)}">{t.editor.cancel}</a>
	</form>

	{#if data.shareOptions.length && !data.sharedWith.length}
		<details class="share" open={!entries.length && !data.sharedFrom}>
			<summary><Icon name="link" size={16} />{t.editor.share}</summary>
			<p class="muted small">{t.editor.shareLead}</p>
			<form method="POST" action="?/share" use:enhance={sharing.submit()}>
				<input type="hidden" name="version" value={data.version} />
				<input type="hidden" name="orchestra" value={data.orchestra} />
				<label class="select">
					<span class="muted">{t.editor.shareSource}</span>
					<select name="source" required>
						{#each data.shareOptions as option (option.name)}
							<option value={option.name} selected={option.name === data.sharedFrom?.title}>
								{option.title}{option.label ? ` · ${option.label}` : ''} · {t.editor.shareCount(option.count)}
							</option>
						{/each}
					</select>
				</label>
				<button class="button secondary" disabled={sharing.busy}><Icon name="link" size={16} />{t.editor.shareButton}</button>
			</form>
			{#if data.entries.length && !data.sharedFrom}<p class="muted small">{t.editor.shareReplaces}</p>{/if}
		</details>
	{/if}
{/if}

<style>

	.head {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.head p,
	.muted {
		color: var(--text-muted);
	}

	.muted {
		font-size: var(--text-sm);
	}

	.search {
		position: relative;
		margin-bottom: var(--space-4);
	}

	.field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		height: 48px;
		padding: 0 var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
	}

	.field:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}

	.field input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text);
		font: inherit;
	}

	.results {
		position: absolute;
		z-index: 5;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		margin: 0;
		padding: var(--space-1);
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.results button {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.results button:hover,
	.results button:focus-visible {
		background: var(--surface-2);
	}

	.results button span {
		display: grid;
	}

	.none {
		padding: var(--space-3);
		color: var(--text-muted);
	}

	.length {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: calc(-1 * var(--space-2)) var(--space-1) var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.entries {
		margin: 0 0 var(--space-4);
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.entries li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--surface);
	}

	.entries li + li {
		border-top: 1px solid var(--border);
	}

	.entries li.dragging {
		opacity: 0.5;
	}

	.handle {
		display: grid;
		color: var(--text-muted);
		cursor: grab;
	}

	.number {
		width: 1.5rem;
		color: var(--accent);
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 700;
		text-align: right;
	}

	.body {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.body strong {
		overflow-wrap: anywhere;
	}

	.note {
		max-width: 320px;
		height: 32px;
		margin-top: var(--space-1);
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-s);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
	}

	.actions {
		display: flex;
		flex: none;
	}

	.actions button {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.actions button:hover:not(:disabled) {
		background: var(--surface-2);
		color: var(--text);
	}

	.actions button:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.actions .remove:hover:not(:disabled) {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	form {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-5);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.button:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.cancel {
		color: var(--text-muted);
		font-weight: 500;
	}

	.notice,
	.message {
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		border-radius: var(--radius-m);
	}

	.notice {
		border: 1px dashed var(--border);
		color: var(--text-muted);
	}

	.message {
		background: color-mix(in oklab, var(--danger) 10%, transparent);
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.tab.active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.guest-add {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.body strong .tag {
		margin-left: var(--space-2);
		vertical-align: middle;
	}

	.joint-hint {
		margin: calc(-1 * var(--space-2)) 0 var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.shared {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
	}

	.shared :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--accent);
	}

	.shared a {
		color: var(--accent);
		font-weight: 600;
	}

	.share {
		margin-top: var(--space-6);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.share summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
		cursor: pointer;
	}

	.share form {
		flex-wrap: wrap;
		align-items: flex-end;
		margin-top: var(--space-3);
	}

	.select {
		display: grid;
		gap: var(--space-1);
		flex: 1 1 260px;
		min-width: 0;
	}

	.select select {
		width: 100%;
		height: 40px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}

	.button.secondary {
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--accent);
	}

	@media (max-width: 560px) {
		.handle {
			display: none;
		}
	}

	.suggestions {
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.suggestions summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
		cursor: pointer;
	}

	.suggestions .count {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
	}

	.suggestions h3 {
		margin: var(--space-3) 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.small {
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
	}

	.suggestion-list {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.suggestion-list li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
	}

	.suggestion-list li + li {
		border-top: 1px solid var(--border);
	}

	.suggestion-list .body {
		display: grid;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.hints {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.tag {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.tag.accent,
	.tag.new {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.tag.warn {
		color: var(--warn);
	}

	.take {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 32px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		color: var(--accent);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	@media (max-width: 480px) {
		.take span {
			display: none;
		}
	}

	.results .create {
		border-top: 1px solid var(--border);
		margin-top: var(--space-1);
		padding-top: var(--space-1);
	}

	.results .create button {
		color: var(--accent);
	}

	.new-piece {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		align-items: end;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--accent);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.new-piece h2,
	.new-piece > p,
	.similar,
	.new-actions {
		grid-column: 1 / -1;
	}

	.new-piece h2 {
		font-size: var(--text-base);
	}

	.new-piece .message {
		margin: 0;
	}

	.input {
		display: grid;
		gap: var(--space-1);
		font-size: max(var(--control-min), var(--text-sm));
		font-weight: 600;
	}

	.input input {
		height: 40px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-weight: 400;
	}

	.similar {
		padding: var(--space-3);
		border-radius: var(--radius-m);
		background: var(--accent-soft);
	}

	.similar h3 {
		margin-bottom: var(--space-2);
		font-size: var(--text-md);
	}

	.similar ul {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.similar li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.new-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}

	.cancel.link {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
</style>

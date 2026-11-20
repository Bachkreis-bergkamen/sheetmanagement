<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { guardUnsaved } from '#lib/unsaved.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { config } from '#lib/config/index.ts';
	import { eventDay } from '#lib/repertoire/dates.ts';
	import { cleanLink, youtubeId } from '#lib/links.ts';
	import { videoLength } from '#lib/video-length.ts';
	import { untrack } from 'svelte';
	import { listCompletions, splitList } from '#lib/repertoire/lists.ts';
	import { gapsFor, type DetailGap } from '#lib/repertoire/details.ts';
	import { composerLine, contentsComposers, SHOWN_COMPOSERS } from '#lib/repertoire/contents.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InstrumentationField from '#lib/components/InstrumentationField.svelte';
	import PieceSuggestions from '#lib/components/PieceSuggestions.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	// After a refused save, the form keeps what was typed.
	const values = $derived(form?.values ?? (data.state === 'ready' ? data.values : undefined));
	// The form's own copy, so a suggestion can be taken over before saving.
	let current = $state<Record<string, string>>({});
	/**
	 * Fields a suggestion filled, with where it came from and what stood there before: marked until
	 * someone confirms, undoes or types over it, so a found value isn't saved unseen.
	 */
	let marks = $state<Record<string, { source: string; before: string }>>({});
	$effect.pre(() => {
		current = { ...(values ?? {}) };
		// After a save the marks go; after a refused one they stay with what was typed.
		if (!form?.message) marks = {};
	});
	// A suggestion for a field under "Weitere Angaben" opens it, so the change shows.
	const apply = (field: string, value: string, source: string) => {
		marks[field] = { source, before: marks[field]?.before ?? current[field] ?? '' };
		current[field] = value;
		if (!mainNames.has(field)) moreOpen = true;
	};
	const undo = (field: string) => {
		current[field] = marks[field].before;
		delete marks[field];
	};
	const markCount = $derived(Object.keys(marks).length);
	// The Hörbeispiel's length, asked as soon as a YouTube link is in (#133): offered next to the
	// link, not filled in, since a recording is rarely the orchestra's own length.
	let video = $state<{ id: string; length: string } | null>(null);
	const recordingId = $derived(data.videoLength ? youtubeId(current.recording ?? '') : undefined);
	$effect(() => {
		const id = recordingId;
		if (!id) return;
		// The saved link of a piece that has its duration needs no asking.
		if (untrack(() => video?.id === id || (id === youtubeId(values?.recording ?? '') && !!(current.duration ?? '').trim()))) return;
		const timer = setTimeout(() => {
			videoLength(id)
				.then((length) => {
					if (length) video = { id, length };
				})
				.catch(() => {});
		}, 400);
		return () => clearTimeout(timer);
	});
	const offerLength = $derived(
		!!video && video.id === recordingId && (current.duration ?? '').trim() !== video.length && !(data.state === 'ready' && (data.missing as string[]).includes('duration'))
	);
	guardUnsaved(() => !saving.busy && !!values && Object.keys(current).some((key) => (current[key] ?? '') !== (values[key as keyof typeof values] ?? '')));
	/** Today in the orchestra's time zone, as the sheet writes dates: "2026-10-21". */
	const today = () => eventDay({ start: new Date().toISOString(), allDay: false }, config.timeZone);

	const columns = t.sheet.pieces.columns;
	const FIELDS = [
		{ name: 'title', wide: true, required: true },
		{ name: 'composer', list: 'composers', placeholder: t.pieceEditor.composerHint },
		{ name: 'composerFull', placeholder: t.pieceEditor.composerFullHint },
		{ name: 'catalogue' },
		{ name: 'arranger', list: 'arrangers', placeholder: t.pieceEditor.listHint },
		{ name: 'genre', list: 'genres', placeholder: t.pieceEditor.listHint },
		{ name: 'difficulty' },
		{ name: 'duration', placeholder: t.pieceEditor.durationHint },
		{ name: 'publisher', list: 'publishers', placeholder: t.pieceEditor.publisherHint },
		{ name: 'reviewedAt', placeholder: t.pieceEditor.reviewedHint },
		{ name: 'instrumentation', wide: true },
		// Text, not url: "keins" says there is none.
		{ name: 'recording', wide: true, inputmode: 'url', placeholder: t.pieceEditor.recordingHint }
	] as const;
	// Fields for columns the sheet doesn't have yet stay hidden until setup adds them.
	const fields = $derived(FIELDS.filter((field) => data.state !== 'ready' || !(data.missing as string[]).includes(field.name)));
	// A medley: with "Komponist" empty, the composers of its songs stand there, shortened.
	const hasContents = $derived(data.state === 'ready' && !(data.missing as string[]).includes('contents'));
	const fromContents = $derived(contentsComposers(current.contents));
	// A long list typed by hand that the songs already name: offered to leave to them.
	const canFollowContents = $derived(!!fromContents && splitList(current.composer).length > SHOWN_COMPOSERS);
	// A short form (#185): what most edits need up top, the rest under "Weitere Angaben". Working
	// through "Angaben ergänzen", the field that list is about comes up top too.
	const GAP_FIELDS: Record<DetailGap, string> = { composer: 'composer', genre: 'genre', recording: 'recording', catalogue: 'catalogue' };
	const mainNames = $derived(new Set(['title', 'composer', 'instrumentation', ...(data.list ? gapsFor(data.list.filter).map((gap) => GAP_FIELDS[gap]) : [])]));
	const mainFields = $derived(fields.filter((field) => mainNames.has(field.name)));
	const moreFields = $derived(fields.filter((field) => !mainNames.has(field.name)));
	/** How many of the fields below are filled, so a closed section still says there's something in it. */
	const moreFilled = $derived(
		[...moreFields.map((field) => field.name), ...(hasContents ? ['contents'] : []), 'notes'].filter((name) => (current[name] ?? '').trim()).length
	);
	let moreOpen = $state(false);
	// A refused save may be about a field down there.
	$effect.pre(() => {
		if (form?.message) moreOpen = true;
	});
	const missingNames = $derived(data.state === 'ready' ? data.missing.map((column) => columns[column]).join(', ') : '');
</script>

<Title title={t.pieceEditor.title(data.piece.title)} />

<Crumbs
	items={[
		{ href: '/stuecke', label: t.pieces.title },
		{ href: `/stuecke/${encodeURIComponent(data.piece.id)}`, label: data.piece.title }
	]}
/>
<h1>{t.pieceEditor.title(data.piece.title)}</h1>

{#if data.state === 'not-in-sheet' || !values}
	<p class="msg info">{t.pieceEditor.notInSheet}</p>
{:else}
	<p class="lead">{t.pieceEditor.lead}</p>
	{#if data.piece.folderName}<p class="folder"><Icon name="folder" size={14} />{data.piece.folderName}</p>{/if}
	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}

	{#if data.list}
		<p class="msg info">{t.details.working(t.details.filters[data.list.filter], data.list.open)}</p>
	{/if}

	<div class="layout">
	<form
		method="POST"
		use:enhance={saving.submit()}
	>
		<input type="hidden" name="version" value={data.version} />
		{#snippet input(field: (typeof FIELDS)[number])}
		{#if field.name === 'instrumentation'}
			<!-- The instrument picker, as on the profile; the sheet keeps it as text (#249). -->
			<div class="field wide" class:suggested={!!marks.instrumentation} oninput={() => delete marks.instrumentation} onchange={() => delete marks.instrumentation}>
				<InstrumentationField name="instrumentation" label={columns.instrumentation} bind:value={current.instrumentation} instruments={data.instruments} sheets={data.sheets} fromParts={data.fromParts} />
				{#if marks.instrumentation}{@render mark('instrumentation')}{/if}
			</div>
		{:else}
		<label class="field" class:wide={'wide' in field} class:suggested={!!marks[field.name]} oninput={() => delete marks[field.name]}>
			{columns[field.name]}
			<span class="input">
				<input
					name={field.name}
					type="text"
					inputmode={'inputmode' in field ? field.inputmode : undefined}
					bind:value={current[field.name]}
					list={'list' in field ? `${field.list}-list` : undefined}
					required={'required' in field}
					placeholder={field.name === 'composer' && fromContents ? t.pieceEditor.composerFromContents(composerLine(fromContents) ?? '') : 'placeholder' in field ? field.placeholder : undefined}
					maxlength="1000"
					autocomplete="off"
					onblur={field.name === 'recording' ? () => (current.recording = cleanLink(current.recording ?? '') ?? current.recording) : undefined}
				/>
				{#if field.name === 'composer' && canFollowContents}
					<button class="btn ghost small" type="button" title={t.pieceEditor.useContentsComposersHint} onclick={() => (current.composer = '')}>
						{t.pieceEditor.useContentsComposers}
					</button>
				{:else if field.name === 'reviewedAt'}
					<button class="btn ghost small" type="button" onclick={() => (current.reviewedAt = today())}>{t.pieceEditor.today}</button>
				{:else if field.name === 'recording'}
					<button class="btn ghost small" type="button" title={t.pieceEditor.noRecordingHint} onclick={() => (current.recording = t.sheetValues.noRecording)}>
						{t.pieceEditor.noRecording}
					</button>
				{/if}
			</span>
			{#if marks[field.name]}{@render mark(field.name)}{/if}
			{#if field.name === 'recording' && offerLength && video}
				<span class="note">
					{t.pieceEditor.videoLength(video.length)}
					<button class="btn ghost small" type="button" onclick={() => video && apply('duration', video.length, t.suggest.sources.youtube)}>{t.pieceEditor.useVideoLength}</button>
				</span>
			{/if}
		</label>
		{/if}
		{/snippet}
		{#snippet mark(name: string)}
			<span class="note mark">
				<Icon name="sparkle" size={14} />{t.pieceEditor.suggested(marks[name].source)}
				<button class="btn ghost small" type="button" onclick={() => delete marks[name]}>{t.pieceEditor.confirm}</button>
				<button class="btn ghost small" type="button" onclick={() => undo(name)}>{t.pieceEditor.undo}</button>
			</span>
		{/snippet}
		{#each mainFields as field (field.name)}{@render input(field)}{/each}
		<details class="more wide" bind:open={moreOpen}>
			<summary><Icon name="chevron" size={14} />{t.calendar.add.more}{#if moreFilled}<span class="filled">{t.pieceEditor.filled(moreFilled)}</span>{/if}</summary>
			<div class="more-fields">
				{#each moreFields as field (field.name)}{@render input(field)}{/each}
				{#if hasContents}
					<!-- Medleys and suites: one song per line, each found by the search. -->
					<label class="field wide">
						{columns.contents}
						<textarea name="contents" maxlength="4000" rows={Math.min(12, Math.max(3, (current.contents ?? '').split('\n').length + 1))} placeholder={t.pieceEditor.contentsHint} bind:value={current.contents}></textarea>
						<span class="ui-hint">{t.pieceEditor.contentsLead}</span>
					</label>
				{/if}
				<label class="field wide">
					{columns.notes}
					<textarea name="notes" maxlength="1000" bind:value={current.notes}></textarea>
				</label>			</div>
		</details>
		{#if missingNames}<p class="ui-hint wide">{t.pieceEditor.missingColumns(missingNames)}</p>{/if}
		{#if markCount}<p class="ui-hint wide unchecked"><Icon name="sparkle" size={14} />{t.pieceEditor.unchecked(markCount)}</p>{/if}
		<div class="actions">
			{#if data.list}
				<button class="btn" name="liste" value={data.list.filter} disabled={saving.busy}><Icon name="check" size={16} />{t.details.saveNext}</button>
				<a class="btn ghost" href="/stuecke/angaben?filter={data.list.filter}">{t.details.backToList}</a>
			{:else}
				<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.pieceEditor.save}</button>
				<a class="btn ghost" href="/stuecke/{encodeURIComponent(data.piece.id)}">{t.pieceEditor.cancel}</a>
			{/if}
		</div>
		<!-- Several names, separated by commas: picking one adds it after those already typed. -->
		{#each fields as field (field.name)}
			{#if 'list' in field && data.state === 'ready'}
				<datalist id="{field.list}-list">
					{#each listCompletions(current[field.name] ?? '', data[field.list]) as option (option)}<option value={option}></option>{/each}
				</datalist>
			{/if}
		{/each}
	</form>

	<PieceSuggestions
		values={current}
		{apply}
		files={data.files}
		canRead={data.canRead}
		videoLength={data.videoLength}
		genres={data.genres}
		knownComposers={data.composers}
		naming={config.naming}
		category={data.piece.category}
		fromParts={data.fromParts}
	/>
	</div>
{/if}

<style>
	/* "Weitere Angaben" (#185): the fields most edits don't need, the same grid as above once open. */
	.more summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--tap);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}

	.more summary::-webkit-details-marker {
		display: none;
	}

	.more summary :global(svg) {
		transition: transform var(--fast) var(--ease);
	}

	.more[open] summary :global(svg) {
		transform: rotate(90deg);
	}

	.filled {
		font-weight: 400;
	}

	.filled::before {
		content: '·';
		margin-inline: var(--space-1);
	}

	.more-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
		padding-top: var(--space-2);
	}


	h1 {
		margin-bottom: var(--space-2);
	}

	.lead {
		margin-bottom: var(--space-2);
		color: var(--text-muted);
	}

	.folder {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.msg {
		margin-bottom: var(--space-4);
	}

	form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.wide,
	.actions {
		grid-column: 1 / -1;
	}

	.layout {
		display: grid;
		gap: var(--space-4);
		align-items: start;
	}

	@media (min-width: 1000px) {
		.layout {
			grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
		}

		form {
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		}
	}

	.input {
		display: flex;
		gap: var(--space-2);
	}

	.input input {
		flex: 1;
		min-width: 0;
	}

	.input .btn {
		flex: none;
		align-self: center;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* A note under one field makes its row taller; the field beside it stays at the top. */
	.field {
		align-content: start;
	}

	/* A field a suggestion filled: outlined in the accent until confirmed, undone or typed over. */
	.suggested :global(input),
	.suggested :global(textarea) {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.mark {
		color: var(--accent);
	}

	.unchecked {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		color: var(--accent);
	}
</style>

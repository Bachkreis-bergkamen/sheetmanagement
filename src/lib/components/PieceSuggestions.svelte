<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { readScoreText } from '#lib/music/score-text.ts';
	import { instrumentationFromScore } from '#lib/music/instrumentation.ts';
	import { config } from '#lib/config/index.ts';
	import { composerAsUsual, searchWorks, suggestGenre, WikidataBusyError, workDetails, type WorkCandidate } from '#lib/music/wikidata.ts';
	import type { NamingRules } from '#lib/config/index.ts';
	import { formatDuration } from '#lib/repertoire/duration.ts';
	import { youtubeId } from '#lib/links.ts';
	import { joinList, LIST_COLUMNS, listHas, splitList } from '#lib/repertoire/lists.ts';
	import Icon from './Icon.svelte';
	import ScoreViewer from './ScoreViewer.svelte';

	/**
	 * Suggestions for a piece's details, each from a source someone asks for: the text on the
	 * score (read in the browser) or Wikidata. Nothing is saved until the form is.
	 */
	type Field = 'composer' | 'composerFull' | 'arranger' | 'catalogue' | 'genre' | 'recording' | 'duration' | 'instrumentation';
	let {
		values,
		apply,
		files,
		canRead,
		videoLength = false,
		genres,
		knownComposers,
		naming,
		category
	}: {
		/** The form's current values, to search with and to mark what's already filled in. */
		values: Record<string, string>;
		apply: (field: Field, value: string) => void;
		/** PDFs to read from: the score first. */
		files: { id: string; label: string }[];
		/** Reading needs a signed-in member: the PDF comes through the app. */
		canRead: boolean;
		/** The deployment can ask YouTube for a video's length. */
		videoLength?: boolean;
		genres: string[];
		knownComposers: string[];
		naming: Pick<NamingRules, 'cataloguePatterns' | 'knownComposers'>;
		category?: string;
	} = $props();

	interface Suggestion {
		field: Field;
		value: string;
		source: 'score' | 'wikidata' | 'archive' | 'youtube';
	}

	let suggestions = $state<Suggestion[]>([]);
	let busy = $state<'score' | 'ocr' | 'wikidata' | 'video' | null>(null);
	/** The file read last is a scan: its instruments can still be read by text recognition (#249). */
	let scanned = $state(false);
	let message = $state<string | null>(null);
	let candidates = $state<WorkCandidate[]>([]);
	let chosen = $state<string | null>(null);
	let wikidataUrl = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let file = $state(files[0]?.id ?? '');
	// The pages themselves, to type from when reading the text gives nothing.
	let viewing = $state(false);

	/** Adds suggestions, without repeating one already listed. */
	function add(list: Suggestion[]) {
		for (const item of list) {
			if (item.value && !suggestions.some((s) => s.field === item.field && s.value === item.value)) suggestions.push(item);
		}
	}

	// A genre the archive's own category already says, e.g. "Weihnachtsstücke" → Weihnachten.
	const fromArchive = $derived.by((): Suggestion[] => {
		const genre = suggestGenre({ category, title: values.title }, genres);
		return genre ? [{ field: 'genre', value: genre, source: 'archive' }] : [];
	});
	const shown = $derived([...fromArchive.filter((a) => !suggestions.some((s) => s.field === a.field && s.value === a.value)), ...suggestions]);

	async function fromScore() {
		busy = 'score';
		message = null;
		try {
			const { readScorePages } = await import('#lib/music/score-reader.ts');
			const { lines, labels } = await readScorePages(file);
			if (!lines.length) {
				message = t.suggest.scanOnly;
				scanned = true;
				viewing = true;
				return;
			}
			const found = readScoreText(lines, naming);
			const list: Suggestion[] = [];
			if (found.composer) {
				list.push({ field: 'composer', value: composerAsUsual(found.composer, knownComposers), source: 'score' });
				list.push({ field: 'composer', value: found.composer, source: 'score' });
				// The full name for the GEMA list (#146), when the score gives more than a surname.
				if (/\s/.test(found.composer.trim())) list.push({ field: 'composerFull', value: found.composer, source: 'score' });
			}
			if (found.arranger) list.push({ field: 'arranger', value: found.arranger, source: 'score' });
			if (found.catalogue) list.push({ field: 'catalogue', value: found.catalogue, source: 'score' });
			// The names at the left of the first system: the instruments the score is written for (#249).
			const instrumentation = instrumentationFromScore(labels, config);
			if (instrumentation) list.push({ field: 'instrumentation', value: instrumentation, source: 'score' });
			if (!list.length) {
				message = t.suggest.nothingInScore;
				viewing = true;
			}
			add(list);
		} catch (error) {
			message = (error as { reason?: string }).reason === 'download' ? t.suggest.downloadFailed : t.suggest.unreadable;
		} finally {
			busy = null;
		}
	}

	/** The Besetzung of a scan, by text recognition of the names left of the first system. */
	async function fromScan() {
		busy = 'ocr';
		message = null;
		try {
			const { createLabelReader } = await import('#lib/music/score-reader.ts');
			const reader = await createLabelReader();
			try {
				const instrumentation = instrumentationFromScore(await reader.labels(file), config);
				if (instrumentation) add([{ field: 'instrumentation', value: instrumentation, source: 'score' }]);
				else message = t.suggest.nothingInScan;
			} finally {
				await reader.close();
			}
		} catch {
			message = t.suggest.ocrFailed;
		} finally {
			busy = null;
		}
	}

	async function lookUp() {
		busy = 'wikidata';
		message = null;
		candidates = [];
		try {
			const title = values.title?.trim();
			if (!title) return;
			// One composer is enough to narrow the search.
			candidates = await searchWorks(title, splitList(values.composer)[0]);
			if (!candidates.length) message = t.suggest.nothingOnline;
			else await choose(candidates[0].id);
		} catch (error) {
			message = error instanceof WikidataBusyError ? t.suggest.busy : t.suggest.onlineFailed;
		} finally {
			busy = null;
		}
	}

	async function choose(id: string) {
		chosen = id;
		busy = 'wikidata';
		// Suggestions from another candidate go; the score's and the archive's stay.
		suggestions = suggestions.filter((s) => s.source !== 'wikidata');
		try {
			const work = await workDetails(id);
			wikidataUrl = work.url;
			const list: Suggestion[] = [];
			// A work by several composers: all of them as one list first, then each one.
			if (work.composers.length > 1)
				list.push({ field: 'composer', value: joinList(work.composers.map((composer) => composerAsUsual(composer, knownComposers))), source: 'wikidata' });
			for (const composer of work.composers) {
				list.push({ field: 'composer', value: composerAsUsual(composer, knownComposers), source: 'wikidata' });
				list.push({ field: 'composer', value: composer, source: 'wikidata' });
			}
			// Wikidata names composers in full: what the GEMA list wants (#146).
			if (work.composers.length) list.push({ field: 'composerFull', value: joinList(work.composers), source: 'wikidata' });
			if (work.catalogue) list.push({ field: 'catalogue', value: work.catalogue, source: 'wikidata' });
			// Only what Wikidata knows about the work itself; the archive's folder is its own suggestion.
			const genre = suggestGenre({ kinds: work.kinds, year: work.year }, genres);
			if (genre) list.push({ field: 'genre', value: genre, source: 'wikidata' });
			if (work.youtube) list.push({ field: 'recording', value: `https://www.youtube.com/watch?v=${work.youtube}`, source: 'wikidata' });
			// The original work's length; an arrangement may be shorter, so it's only a suggestion.
			if (work.duration) list.push({ field: 'duration', value: formatDuration(work.duration), source: 'wikidata' });
			add(list);
			if (!list.length) message = t.suggest.nothingInWork;
		} catch (error) {
			message = error instanceof WikidataBusyError ? t.suggest.busy : t.suggest.onlineFailed;
		} finally {
			busy = null;
		}
	}

	// The Hörbeispiel's length: a recording is rarely the orchestra's exact length, so a suggestion.
	const video = $derived(videoLength ? youtubeId(values.recording ?? '') : undefined);
	async function fromVideo() {
		if (!video) return;
		busy = 'video';
		message = null;
		try {
			const response = await fetch(`/api/youtube/${video}`);
			if (!response.ok) throw new Error(String(response.status));
			const { seconds } = (await response.json()) as { seconds: number | null };
			if (seconds) add([{ field: 'duration', value: formatDuration(seconds), source: 'youtube' }]);
			else message = t.suggest.videoNoLength;
		} catch {
			message = t.suggest.videoFailed;
		} finally {
			busy = null;
		}
	}

	// With an arranger, the search looks for that arrangement only: the composer would bring up the original work.
	const youtube = $derived.by(() => {
		const arranger = values.arranger?.trim();
		const query = [values.title, arranger ? `arr. ${arranger}` : values.composer].map((part) => part?.trim()).filter(Boolean).join(' ');
		return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
	});
	const isList = (field: Field) => (LIST_COLUMNS as readonly string[]).includes(field);
	// In a list field a name counts as entered once it's one of the list's names.
	const filled = (s: Suggestion) =>
		isList(s.field) ? splitList(s.value).every((name) => listHas(values[s.field], name)) : (values[s.field] ?? '').trim() === s.value;
	/** "Ergänzen": the suggestion after the names already there. */
	const canAdd = (s: Suggestion) => isList(s.field) && !!splitList(values[s.field]).length;
	const added = (s: Suggestion) => joinList(splitList(`${values[s.field]}, ${s.value}`));
	const columns = t.sheet.pieces.columns;
</script>

<section class="suggest" aria-labelledby="suggest-title">
	<h2 id="suggest-title"><Icon name="sparkle" size={16} />{t.suggest.title}</h2>
	<p class="muted">{t.suggest.lead}</p>

	<div class="sources">
		{#if files.length && canRead}
			<div class="source">
				{#if files.length > 1}
					<select bind:value={file} aria-label={t.suggest.fileLabel}>
						{#each files as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
					</select>
				{/if}
				<button class="btn ghost small" type="button" onclick={fromScore} disabled={!!busy}>
					<Icon name="file" size={16} />{busy === 'score' ? t.suggest.reading : t.suggest.fromScore}
				</button>
				{#if scanned}
					<button class="btn ghost small" type="button" onclick={fromScan} disabled={!!busy} title={t.suggest.ocrHint}>
						<Icon name="text" size={16} />{busy === 'ocr' ? t.suggest.ocrReading : t.suggest.ocr}
					</button>
				{/if}
				<button class="btn ghost small" type="button" onclick={() => (viewing = !viewing)} aria-pressed={viewing}>
					<Icon name="eye" size={16} />{viewing ? t.viewer.hide : t.viewer.show}
				</button>
			</div>
		{/if}
		<button class="btn ghost small" type="button" onclick={lookUp} disabled={!!busy || !values.title?.trim()}>
			<Icon name="search" size={16} />{busy === 'wikidata' ? t.suggest.searching : t.suggest.online}
		</button>
		{#if video}
			<button class="btn ghost small" type="button" onclick={fromVideo} disabled={!!busy}>
				<Icon name="clock" size={16} />{busy === 'video' ? t.suggest.videoLooking : t.suggest.videoLength}
			</button>
		{/if}
		<a class="btn ghost small" href={youtube} target="_blank" rel="noopener noreferrer">
			<Icon name="headphones" size={16} />{t.suggest.youtube}
		</a>
	</div>
	<p class="hint">{t.suggest.youtubeHint}</p>

	{#if message}<p class="msg info" role="status">{message}</p>{/if}

	{#if viewing && file && canRead}<ScoreViewer fileId={file} />{/if}

	{#if candidates.length > 1}
		<fieldset class="candidates">
			<legend>{t.suggest.whichWork}</legend>
			{#each candidates as candidate (candidate.id)}
				<label>
					<input type="radio" name="wikidata-work" checked={chosen === candidate.id} onchange={() => choose(candidate.id)} disabled={!!busy} />
					<span><strong>{candidate.label}</strong>{#if candidate.description}<span class="muted">{' · '}{candidate.description}</span>{/if}</span>
				</label>
			{/each}
		</fieldset>
	{/if}

	{#if shown.length}
		<ul class="list">
			{#each shown as suggestion (suggestion.field + suggestion.value)}
				<li>
					<span class="field">{columns[suggestion.field]}</span>
					<span class="value">{suggestion.value}</span>
					<span class="from">{t.suggest.sources[suggestion.source]}</span>
					{#if filled(suggestion)}
						<span class="done"><Icon name="check" size={14} />{t.suggest.applied}</span>
					{:else}
						<span class="takes">
							{#if canAdd(suggestion)}
								<button class="take" type="button" onclick={() => apply(suggestion.field, added(suggestion))}>{t.suggest.add}</button>
							{/if}
							<button class="take" type="button" onclick={() => apply(suggestion.field, suggestion.value)}>{t.suggest.apply}</button>
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if wikidataUrl}
		<a class="source-link" href={wikidataUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} />{t.suggest.openWikidata}</a>
	{/if}
</section>

<style>
	.suggest {
		min-width: 0;
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-base);
	}

	.muted,
	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		font-size: var(--text-xs);
	}

	.sources,
	.source {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.source select {
		max-width: 220px;
		height: 32px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
	}

	/* A fieldset is as wide as its longest line unless told otherwise; long descriptions should wrap. */
	.candidates {
		min-inline-size: 0;
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		font-size: var(--text-sm);
	}

	.candidates legend {
		padding: 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.candidates label {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		cursor: pointer;
	}

	.candidates input {
		accent-color: var(--accent);
	}

	.list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list li {
		display: grid;
		grid-template-columns: 7.5em 1fr auto auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
	}

	.list li + li {
		border-top: 1px solid var(--border);
	}

	.field {
		color: var(--text-muted);
		font-weight: 600;
	}

	.value {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.from {
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
	}

	.take {
		height: 28px;
		padding: 0 var(--space-3);
		border: 1px solid var(--accent);
		border-radius: var(--radius-pill);
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.takes {
		display: flex;
		gap: var(--space-1);
	}

	.done {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: var(--ok);
		font-size: var(--text-xs);
	}

	.source-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		justify-self: start;
		color: var(--accent);
		font-size: var(--text-xs);
	}

	@media (max-width: 520px) {
		.list li {
			grid-template-columns: 1fr auto;
		}

		.field {
			grid-column: 1 / -1;
		}

		.from {
			display: none;
		}
	}
</style>

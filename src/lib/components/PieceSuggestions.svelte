<script lang="ts">
	import { tick } from 'svelte';
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
	 * Suggestions for a piece's details: one button asks every source in turn (the text on the
	 * score, read in the browser; the parts' names; Wikidata; the Hörbeispiel's length) and fills
	 * in the fields still empty. The rest stays offered below, and the score is open underneath to
	 * type from. Nothing is saved until the form is.
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
		category,
		fromParts = ''
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
		/** The Besetzung the parts' names spell. */
		fromParts?: string;
	} = $props();

	interface Suggestion {
		field: Field;
		value: string;
		source: 'score' | 'parts' | 'wikidata' | 'archive' | 'youtube';
	}

	let suggestions = $state<Suggestion[]>([]);
	let busy = $state<'score' | 'ocr' | 'wikidata' | 'video' | null>(null);
	/** The file read last is a scan: its instruments can still be read by text recognition (#249). */
	let scanned = $state(false);
	/** What the sources said: nothing found, a scan, offline. Several after "Automatisch ausfüllen". */
	let messages = $state<string[]>([]);
	const say = (text: string) => {
		if (!messages.includes(text)) messages = [...messages, text];
	};
	let candidates = $state<WorkCandidate[]>([]);
	let chosen = $state<string | null>(null);
	let wikidataUrl = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let file = $state(files[0]?.id ?? '');
	// The pages themselves, open underneath, to type from what reading the text doesn't give.
	let viewing = $state(true);

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
	// The Besetzung the parts spell, for a piece whose score doesn't name its instruments.
	const fromPartsList = $derived<Suggestion[]>(fromParts ? [{ field: 'instrumentation', value: fromParts, source: 'parts' }] : []);
	const shown = $derived(
		[...suggestions, ...fromArchive, ...fromPartsList].filter((a, i, all) => all.findIndex((s) => s.field === a.field && s.value === a.value) === i)
	);

	/**
	 * "Automatisch ausfüllen": every source in turn, each filling the fields still empty before the
	 * next asks, so a composer read off the score narrows the search on Wikidata and a recording
	 * found there gives the length. What's already in the form is never replaced.
	 */
	let auto = $state<string | null>(null);
	let filledCount = $state<number | null>(null);
	/** Which source wins a field when several suggest one. */
	const PREFER: Partial<Record<Field, Suggestion['source'][]>> = {
		// The recording's length is the orchestra's piece; Wikidata's is the original work's.
		duration: ['youtube', 'wikidata'],
		// The score names the instruments as written; the parts only those that have a file.
		instrumentation: ['score', 'parts']
	};
	const rank = (s: Suggestion) => {
		const order = PREFER[s.field];
		const at = order ? order.indexOf(s.source) : 0;
		return at < 0 ? 99 : at;
	};
	async function fillEmpty() {
		let count = 0;
		for (const field of new Set(shown.map((s) => s.field))) {
			if ((values[field] ?? '').trim()) continue;
			const best = shown.filter((s) => s.field === field).sort((a, b) => rank(a) - rank(b))[0];
			if (!best) continue;
			apply(field, best.value);
			count++;
		}
		await tick();
		return count;
	}
	async function autoFill() {
		messages = [];
		filledCount = null;
		let count = 0;
		try {
			if (files.length && canRead) {
				auto = t.suggest.steps.score;
				await fromScore();
			}
			count += await fillEmpty();
			if (values.title?.trim()) {
				auto = t.suggest.steps.wikidata;
				await lookUp();
				count += await fillEmpty();
			}
			if (video) {
				auto = t.suggest.steps.video;
				await fromVideo();
				count += await fillEmpty();
			}
		} finally {
			auto = null;
			filledCount = count;
		}
	}

	async function fromScore() {
		busy = 'score';
		try {
			const { readScorePages } = await import('#lib/music/score-reader.ts');
			const { lines, labels } = await readScorePages(file);
			if (!lines.length) {
				say(t.suggest.scanOnly);
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
				say(t.suggest.nothingInScore);
				viewing = true;
			}
			add(list);
		} catch (error) {
			say((error as { reason?: string }).reason === 'download' ? t.suggest.downloadFailed : t.suggest.unreadable);
		} finally {
			busy = null;
		}
	}

	/** The Besetzung of a scan, by text recognition of the names left of the first system. */
	async function fromScan() {
		busy = 'ocr';
		try {
			const { createLabelReader } = await import('#lib/music/score-reader.ts');
			const reader = await createLabelReader();
			try {
				const instrumentation = instrumentationFromScore(await reader.labels(file), config);
				if (instrumentation) add([{ field: 'instrumentation', value: instrumentation, source: 'score' }]);
				else say(t.suggest.nothingInScan);
			} finally {
				await reader.close();
			}
		} catch {
			say(t.suggest.ocrFailed);
		} finally {
			busy = null;
		}
	}

	async function lookUp() {
		busy = 'wikidata';
		candidates = [];
		try {
			const title = values.title?.trim();
			if (!title) return;
			// One composer is enough to narrow the search.
			candidates = await searchWorks(title, splitList(values.composer)[0]);
			if (!candidates.length) say(t.suggest.nothingOnline);
			else await choose(candidates[0].id);
		} catch (error) {
			say(error instanceof WikidataBusyError ? t.suggest.busy : t.suggest.onlineFailed);
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
			if (!list.length) say(t.suggest.nothingInWork);
		} catch (error) {
			say(error instanceof WikidataBusyError ? t.suggest.busy : t.suggest.onlineFailed);
		} finally {
			busy = null;
		}
	}

	// The Hörbeispiel's length: a recording is rarely the orchestra's exact length, so a suggestion.
	const video = $derived(videoLength ? youtubeId(values.recording ?? '') : undefined);
	async function fromVideo() {
		if (!video) return;
		busy = 'video';
		try {
			const response = await fetch(`/api/youtube/${video}`);
			if (!response.ok) throw new Error(String(response.status));
			const { seconds } = (await response.json()) as { seconds: number | null };
			if (seconds) add([{ field: 'duration', value: formatDuration(seconds), source: 'youtube' }]);
			else say(t.suggest.videoNoLength);
		} catch {
			say(t.suggest.videoFailed);
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
		<button class="btn" type="button" onclick={autoFill} disabled={!!busy || !!auto}>
			<Icon name="sparkle" size={16} />{auto ? t.suggest.autoBusy(auto) : t.suggest.auto}
		</button>
		{#if scanned && canRead && file}
			<button class="btn ghost small" type="button" onclick={() => ((messages = []), fromScan())} disabled={!!busy || !!auto} title={t.suggest.ocrHint}>
				<Icon name="text" size={16} />{busy === 'ocr' ? t.suggest.ocrReading : t.suggest.ocr}
			</button>
		{/if}
		<a class="btn ghost small" href={youtube} target="_blank" rel="noopener noreferrer" title={t.suggest.youtubeHint}>
			<Icon name="headphones" size={16} />{t.suggest.youtube}
		</a>
	</div>
	<p class="hint">{t.suggest.autoLead}</p>

	{#if filledCount !== null}<p class="msg ok" role="status">{t.suggest.autoDone(filledCount)}</p>{/if}
	{#each messages as text (text)}<p class="msg info" role="status">{text}</p>{/each}

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

	<!-- The score underneath, open from the start: what reading doesn't find is typed off the page. -->
	{#if files.length && canRead}
		<div class="pages">
			{#if files.length > 1}
				<select bind:value={file} aria-label={t.suggest.fileLabel}>
					{#each files as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
				</select>
			{/if}
			<button class="btn ghost small" type="button" onclick={() => (viewing = !viewing)} aria-pressed={viewing}>
				<Icon name="eye" size={16} />{viewing ? t.viewer.hide : t.viewer.show}
			</button>
		</div>
		{#if viewing && file}<ScoreViewer fileId={file} />{/if}
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
	.pages {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.pages {
		margin-top: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}

	.pages select {
		max-width: 220px;
		height: 32px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: max(var(--control-min), var(--text-xs));
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

<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import { speakingSeconds, withSource } from '#lib/repertoire/facts.ts';
	import {
		searchWikipedia,
		webSearchUrl,
		wikiQuery,
		wikipediaArticle,
		WikipediaBusyError,
		type WikiArticle,
		type WikiCandidate
	} from '#lib/music/wikipedia.ts';
	import Icon from './Icon.svelte';

	/**
	 * "Wissenswertes" in the piece editor (#411): the text, how long reading it out takes, and
	 * a Wikipedia lookup whose introduction can be taken over with its source line. Taking over
	 * goes through the editor's `take`, so it's marked as a suggestion until someone looks at it.
	 */
	let {
		name,
		label,
		value = $bindable(''),
		title,
		composer,
		maxlength,
		take,
		children
	}: {
		name: string;
		label: string;
		value?: string;
		title: string;
		composer?: string;
		maxlength: number;
		take: (value: string, source: string) => void;
		children?: import('svelte').Snippet;
	} = $props();

	const speaking = $derived(speakingSeconds(value));
	let open = $state(false);
	let query = $state('');
	let busy = $state<'idle' | 'searching' | 'loading'>('idle');
	let problem = $state('');
	let candidates = $state<WikiCandidate[] | null>(null);
	let article = $state<WikiArticle | null>(null);

	const failure = (error: unknown) => (error instanceof WikipediaBusyError ? t.facts.busy : t.facts.failed);

	async function search() {
		busy = 'searching';
		problem = '';
		article = null;
		try {
			candidates = await searchWikipedia(query);
			if (!candidates.length) problem = t.facts.nothing;
		} catch (error) {
			candidates = null;
			problem = failure(error);
		} finally {
			busy = 'idle';
		}
	}

	async function show(candidate: WikiCandidate) {
		busy = 'loading';
		problem = '';
		try {
			article = (await wikipediaArticle(candidate.title, candidate.language)) ?? null;
			if (!article) problem = t.facts.noIntro;
		} catch (error) {
			problem = failure(error);
		} finally {
			busy = 'idle';
		}
	}

	function start() {
		open = !open;
		if (open && !candidates) {
			query = wikiQuery(title, composer);
			search();
		}
	}

	function takeOver() {
		if (!article) return;
		take(withSource(value, article.text, t.facts.source(article.title, article.url)), t.facts.sourceName);
		open = false;
		article = null;
	}
</script>

<div class="facts-field">
	<label class="field wide">
		{label}
		<textarea
			{name}
			{maxlength}
			rows={Math.min(14, Math.max(4, value.split('\n').length + 1))}
			placeholder={t.facts.placeholder}
			bind:value
		></textarea>
		<span class="ui-hint">{t.facts.hint}</span>
	</label>
	{@render children?.()}
	<div class="tools">
		<button class="btn ghost small" type="button" aria-expanded={open} onclick={start}><Icon name="book" size={14} />{t.facts.lookup}</button>
		<a class="btn ghost small" href={webSearchUrl(title, composer)} target="_blank" rel="noopener noreferrer nofollow"><Icon name="external" size={14} />{t.facts.webSearch}</a>
		{#if speaking}<span class="ui-hint speaking"><Icon name="clock" size={14} />{t.facts.speaking(speaking)}</span>{/if}
	</div>

	{#if open}
		<div class="lookup" aria-live="polite">
			<p class="ui-hint">{t.facts.lookupHint}</p>
			{#if article}
				<article class="preview">
					<h3>{article.title} <span class="ui-hint">({t.facts.inLanguage(article.language)})</span></h3>
					{#each article.text.split('\n\n') as paragraph, i (i)}<p>{paragraph}</p>{/each}
					<a class="ui-hint" href={article.url} target="_blank" rel="noopener noreferrer">{article.url}</a>
				</article>
				<div class="tools">
					<button class="btn small" type="button" title={t.facts.takeHint} onclick={takeOver}><Icon name="plus" size={14} />{t.facts.take}</button>
					<button class="btn ghost small" type="button" onclick={() => (article = null)}><Icon name="back" size={14} />{t.facts.back}</button>
				</div>
				<p class="ui-hint">{t.facts.takeHint}</p>
			{:else}
				<!-- Not a form of its own: it sits inside the editor's form; Enter searches. -->
				<div class="query">
					<input
						type="search"
						aria-label={t.facts.query}
						bind:value={query}
						autocomplete="off"
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								search();
							}
						}}
					/>
					<button class="btn ghost small" type="button" onclick={search} disabled={busy !== 'idle'}><Icon name="search" size={14} />{t.facts.search}</button>
				</div>
				{#if busy === 'searching'}<p class="ui-hint">{t.facts.searching}</p>{/if}
				{#if busy === 'loading'}<p class="ui-hint">{t.facts.loading}</p>{/if}
				{#if candidates?.length && busy !== 'searching'}
					<ul class="candidates">
						{#each candidates as candidate (candidate.language + candidate.title)}
							<li>
								<button type="button" onclick={() => show(candidate)} disabled={busy !== 'idle'}>
									<strong>{candidate.title}</strong>
									{#if candidate.snippet}<span class="ui-hint">{candidate.snippet} …</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
			{#if problem}<p class="msg info">{problem}</p>{/if}
			<button class="btn ghost small" type="button" onclick={() => (open = false)}><Icon name="x" size={14} />{t.facts.close}</button>
		</div>
	{/if}
</div>

<style>
	.facts-field {
		display: grid;
		gap: var(--space-2);
		grid-column: 1 / -1;
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.speaking {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.lookup {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.query {
		display: flex;
		gap: var(--space-2);
		width: 100%;
	}

	.query input {
		flex: 1;
		min-width: 0;
	}

	.candidates {
		display: grid;
		gap: var(--space-1);
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.candidates button {
		display: grid;
		gap: 2px;
		width: 100%;
		padding: var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-m);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.candidates button:hover,
	.candidates button:focus-visible {
		border-color: var(--border);
		background: var(--surface-2);
	}

	.preview {
		max-height: 18rem;
		overflow-y: auto;
	}

	.preview h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-base);
	}

	.preview p {
		margin: 0 0 var(--space-2);
		line-height: 1.5;
	}

	.preview a {
		overflow-wrap: anywhere;
	}
</style>

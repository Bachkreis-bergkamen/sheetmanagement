<script lang="ts">
	import { tick } from 'svelte';
	import { config } from '#lib/config/index.ts';
	import type { InstrumentFamily } from '#lib/config/types.ts';
	import { t } from '#lib/i18n/index.ts';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import { readInstrumentation, unreadEntries, voiceText, writeInstrumentation, type ScoredVoice } from '#lib/music/instrumentation.ts';
	import { PART_NUMBERS } from '#lib/music/my-parts.ts';
	import Icon from './Icon.svelte';
	import InstrumentGlyph from './InstrumentGlyph.svelte';
	import ScoreViewer from './ScoreViewer.svelte';

	/**
	 * A piece's Besetzung (#249): the chosen instruments as chips, and one panel to change them,
	 * every instrument by family, tapped on and off, its parts (I–IV) right beside it. Kept as the
	 * sheet's text ("Flöte 1 & 2; Oboe"), in the instruments' order like a score, sent as `name`.
	 * What it can't read stays as written. Follows `value` when it changes from outside: the
	 * Besetzung read from the score (Vorschläge → "Aus den Noten lesen"). With a score, the panel
	 * shows its first page beside the list, where the first system names every instrument.
	 */
	let {
		value = $bindable(''),
		name,
		label,
		instruments: all,
		score = null
	}: { value: string; name: string; label: string; instruments: string[]; score?: { id: string; label: string } | null } = $props();

	// Scores and reductions are files, not a voice of the Besetzung.
	const instruments = $derived(all.filter((n) => config.instruments.find((instrument) => instrument.name === n)?.family !== 'partitur'));

	const uid = $props.id();
	const ROMAN = ['', 'I', 'II', 'III', 'IV'];
	const order = $derived(new Map(instruments.map((n, i) => [n, i])));
	const sorted = (voices: ScoredVoice[]) => [...voices].sort((a, b) => (order.get(a.instrument) ?? 999) - (order.get(b.instrument) ?? 999));

	// svelte-ignore state_referenced_locally
	let voices = $state<ScoredVoice[]>(readInstrumentation(value, config));
	const unread = $derived(unreadEntries(value, config));
	const written = $derived(writeInstrumentation(sorted(voices), unread));

	// The voices write the text; a new text from outside (not their own) is read again.
	// svelte-ignore state_referenced_locally
	let last = written;
	$effect(() => {
		if (written !== last) {
			last = written;
			value = written;
		}
	});
	$effect(() => {
		if (value !== last && value !== written) {
			last = value;
			voices = readInstrumentation(value, config);
		}
	});

	const chosen = (n: string) => voices.find((voice) => voice.instrument === n);
	const toggle = (n: string) => (voices = chosen(n) ? voices.filter((voice) => voice.instrument !== n) : [...voices, { instrument: n, numbers: [] }]);
	function number(n: string, part: number) {
		const voice = chosen(n);
		if (!voice) return;
		voice.numbers = voice.numbers.includes(part) ? voice.numbers.filter((m) => m !== part) : [...voice.numbers, part].sort();
	}

	// ---------- The panel ----------

	let dialog = $state<HTMLDialogElement>();
	let search = $state<HTMLInputElement>();
	let query = $state('');
	/** The score is opened (and drawn at the panel's width) only while the panel is open. */
	let showing = $state(false);

	const info = $derived(new Map(config.instruments.map((instrument) => [instrument.name, instrument])));
	const familyLabel = (f: InstrumentFamily) => (f === 'partitur' ? t.piece.groups.featured : t.piece.groups[f]);
	const fold = (text: string) =>
		text
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{M}/gu, '');
	const words = (n: string) => [instrumentLabel(n), n, ...(info.get(n)?.aliases ?? []), ...(info.get(n)?.variants ?? [])].map(fold);

	/** By family, like a score; a search lists what matches, those starting with it first. */
	const sections = $derived.by(() => {
		const q = fold(query.trim());
		if (q) {
			const hits = instruments.filter((n) => words(n).some((word) => word.includes(q)));
			const starts = (n: string) => words(n).some((word) => word.startsWith(q));
			return [{ label: '', names: [...hits.filter(starts), ...hits.filter((n) => !starts(n))] }];
		}
		const families: { label: string; names: string[] }[] = [];
		for (const n of instruments) {
			const heading = familyLabel(info.get(n)?.family ?? 'sonstige');
			const section = families.find((s) => s.label === heading);
			if (section) section.names.push(n);
			else families.push({ label: heading, names: [n] });
		}
		return families;
	});

	async function open() {
		query = '';
		dialog?.showModal();
		showing = true;
		await tick();
		if (matchMedia('(pointer: fine)').matches) search?.focus();
	}
</script>

<div class="instrumentation" role="group" aria-labelledby="{uid}-label">
	<span class="caption" id="{uid}-label">{label}</span>
	<input type="hidden" {name} value={written} />

	<div class="chosen">
		{#each sorted(voices) as voice (voice.instrument)}
			<span class="chip">
				<InstrumentGlyph glyph={glyphOf(voice.instrument)} size={18} />
				{voiceText(voice)}
				<button type="button" class="drop" aria-label={t.instruments.removeNamed(voiceText(voice))} onclick={() => toggle(voice.instrument)}><Icon name="x" size={12} /></button>
			</span>
		{/each}
		<button type="button" class="btn small secondary" onclick={open}>
			<Icon name={voices.length ? 'edit' : 'plus'} size={14} />{voices.length ? t.instruments.change : t.instruments.choose}
		</button>
	</div>
	{#if unread.length}<p class="unread">{t.pieceEditor.unreadInstrumentation(unread.join('; '))}</p>{/if}
</div>

<dialog
	bind:this={dialog}
	class="panel"
	class:split={!!score}
	aria-labelledby="{uid}-title"
	onclose={() => (showing = false)}
	onclick={(event) => {
		if (event.target === dialog) dialog?.close();
	}}
>
	<header>
		<h2 id="{uid}-title">{label}</h2>
		<button type="button" class="close" aria-label={t.filters.close} onclick={() => dialog?.close()}><Icon name="x" size={18} /></button>
	</header>
	<div class="body">
	<div class="picker">
	<label class="search">
		<Icon name="search" size={16} />
		<input bind:this={search} bind:value={query} type="search" placeholder={t.instruments.search} aria-label={t.instruments.search} autocomplete="off" />
	</label>

	<div class="list">
		{#each sections as section (section.label)}
			<section>
				{#if section.label}<h3>{section.label}</h3>{/if}
				{#each section.names as n (n)}
					{@const voice = chosen(n)}
					<div class="item" class:on={!!voice}>
						<button type="button" class="pick" aria-pressed={!!voice} onclick={() => toggle(n)}>
							<span class="plate"><InstrumentGlyph glyph={glyphOf(n)} size={24} /></span>
							<span class="name">{instrumentLabel(n)}</span>
							<span class="tick" aria-hidden="true"><Icon name="check" size={14} /></span>
						</button>
						<!-- The parts, once it's in: none chosen means it has one part, or all of them. -->
						{#if voice}
							<span class="numbers" role="group" aria-label="{t.instruments.numbers}: {instrumentLabel(n)}" title={t.instruments.numbersHint}>
								{#each PART_NUMBERS as part (part)}
									<button type="button" class="number" aria-pressed={voice.numbers.includes(part)} onclick={() => number(n, part)}>{ROMAN[part]}</button>
								{/each}
							</span>
						{/if}
					</div>
				{/each}
			</section>
		{:else}
			<p class="none">{t.instruments.none(query.trim())}</p>
		{/each}
	</div>
	</div>
	{#if score && showing}
		<aside class="score" aria-label={t.instruments.score(score.label)}>
			<ScoreViewer fileId={score.id} hint={t.instruments.scoreHint} />
		</aside>
	{/if}
	</div>

	<footer>
		<span class="summary">{t.instruments.chosen(voices.length)}</span>
		<button type="button" class="btn" onclick={() => dialog?.close()}><Icon name="check" size={16} />{t.instruments.done}</button>
	</footer>
</dialog>

<style>
	.instrumentation {
		display: grid;
		gap: var(--space-2);
	}

	.caption {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.chosen {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 34px;
		padding: 0 4px 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.chip :global(svg) {
		color: var(--text-muted);
	}

	.drop {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.drop:hover {
		background: var(--surface-2);
		color: var(--danger);
	}

	.unread {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	/* ---------- The panel: a sheet on phones, a card in the middle on wide screens ---------- */

	.panel {
		position: fixed;
		inset: auto 0 0;
		display: none;
		width: 100%;
		max-width: none;
		height: min(86dvh, 720px);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-l) var(--radius-l) 0 0;
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-raised);
	}

	.panel[open] {
		display: grid;
		grid-template-rows: auto 1fr auto;
		animation: sheet-in 0.25s var(--ease);
	}

	.panel::backdrop {
		background: var(--scrim);
	}

	@media (min-width: 721px) {
		.panel {
			inset: 0;
			width: min(560px, calc(100vw - 2 * var(--space-6)));
			height: min(80dvh, 720px);
			margin: auto;
			border-radius: var(--radius-l);
		}
	}

	/* With the score: its first page beside the list on wide screens, above it on phones. */
	.body,
	.picker {
		display: grid;
		grid-template-rows: auto 1fr;
		min-height: 0;
	}

	.body {
		grid-template-rows: auto minmax(0, 1fr);
	}

	/* On phones the score comes first, above the list. */
	.score {
		order: -1;
		max-height: 38dvh;
		overflow: auto;
		margin: 0 var(--space-5) var(--space-3);
		overscroll-behavior: contain;
	}

	@media (min-width: 900px) {
		.panel.split {
			width: min(1240px, calc(100vw - 2 * var(--space-6)));
			height: min(90dvh, 960px);
		}

		/* Choosing on the left, the score's first page on the right. */
		.split .body {
			grid-template-columns: minmax(320px, 1fr) minmax(0, 1.4fr);
			grid-template-rows: minmax(0, 1fr);
		}

		.split .score {
			order: 0;
			max-height: none;
			margin: 0 var(--space-5) var(--space-4) 0;
			padding-left: var(--space-4);
			border-left: 1px solid var(--hairline);
		}

		/* The pane scrolls, not a box inside it. */
		.split .score :global(.box) {
			max-height: none;
		}
	}

	@keyframes sheet-in {
		from {
			translate: 0 24px;
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel[open] {
			animation: none;
		}
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.close {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-muted);
		cursor: pointer;
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 var(--space-5) var(--space-2);
		padding: 0 var(--space-3);
		height: 42px;
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.search:focus-within {
		outline: 2px solid var(--accent);
	}

	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: max(16px, var(--text-base));
	}

	.list {
		overflow-y: auto;
		padding: 0 var(--space-5) var(--space-4);
		overscroll-behavior: contain;
	}

	h3 {
		margin: var(--space-4) 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin: 0 calc(-1 * var(--space-2));
		padding: 2px var(--space-2);
		border-radius: var(--radius-control);
		transition: background var(--fast) var(--ease);
	}

	.item.on {
		background: var(--accent-soft);
	}

	.pick {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		min-height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.plate {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.item.on .plate {
		background: var(--surface);
		color: var(--accent);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-weight: 500;
	}

	.item.on .name {
		font-weight: 650;
	}

	.tick {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 1.5px solid var(--border);
		border-radius: var(--radius-xs);
		color: transparent;
	}

	.item.on .tick {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.numbers {
		display: inline-flex;
		gap: 4px;
	}

	.number {
		width: 36px;
		height: 32px;
		border: 1px solid var(--border);
		border-radius: var(--radius-s);
		background: var(--surface);
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 700;
		cursor: pointer;
	}

	.number[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.none {
		color: var(--text-muted);
	}

	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-5) calc(var(--space-4) + env(safe-area-inset-bottom));
		border-top: 1px solid var(--hairline);
	}

	.summary {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>

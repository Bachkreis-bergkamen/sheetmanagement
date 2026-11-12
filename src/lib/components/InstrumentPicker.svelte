<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import { foldIntoSets, PART_NUMBERS, setInstruments, setsFor } from '#lib/music/my-parts.ts';
	import Icon from './Icon.svelte';
	import InstrumentChooser from './InstrumentChooser.svelte';
	import InstrumentGlyph from './InstrumentGlyph.svelte';

	/**
	 * Several instruments, each with none, one or several part numbers ("Geige I & II, Viola").
	 * Sends "instrument" once per row and "number" as "<row>:<n>"; the server reads them with
	 * choicesFromForm. A percussionist (Schlagwerk, Percussion) picks what they play by sets
	 * (Trommeln, Stabspiele …), each adjustable one by one, sent as "plays" "<row>:<instrument>".
	 */
	let {
		choices = [],
		instruments,
		common,
		required = false
	}: {
		choices?: { instrument: string; numbers: number[]; plays?: string[] }[];
		instruments: string[];
		common: string[];
		required?: boolean;
	} = $props();

	const uid = $props.id();
	const ROMAN = ['', 'I', 'II', 'III', 'IV'];
	type Row = { instrument: string; numbers: number[]; plays: string[]; only: boolean; open: string | null };
	const newRow = (instrument = '', numbers: number[] = [], plays: string[] = []): Row => ({ instrument, numbers, plays, only: plays.length > 0, open: null });
	// The form's own copy: rows are added and removed here until it's saved.
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(choices.length ? foldIntoSets(choices, config).map((c) => newRow(c.instrument, [...c.numbers], [...(c.plays ?? [])])) : [newRow()]);

	// ---------- A percussionist's setup ----------

	// What the sets hold (Marimba, Pauke, Mallet Percussion) is picked under the percussion, not on its own.
	const inSets = setInstruments(config);
	const offered = $derived(instruments.filter((n) => !inSets.has(n)));

	/** A newcomer's start: the sets nearly every percussionist plays. */
	const STARTER = 3;
	const playable = (names: string[]) => names.filter((name) => instruments.includes(name));
	const have = (r: Row, set: string[]) => playable(set).filter((name) => r.plays.includes(name)).length;
	function only(r: Row, yes: boolean) {
		r.only = yes;
		if (yes && !r.plays.length) r.plays = setsFor(r.instrument, config).slice(0, STARTER).flatMap((set) => playable(set.instruments));
		if (!yes) r.open = null;
	}
	/** A set's card: all of it in, or out if it was all in. */
	function toggleSet(r: Row, set: string[]) {
		const names = playable(set);
		r.plays = have(r, set) === names.length ? r.plays.filter((name) => !names.includes(name)) : [...new Set([...r.plays, ...names])];
	}
	const toggleOne = (r: Row, name: string) => (r.plays = r.plays.includes(name) ? r.plays.filter((n) => n !== name) : [...r.plays, name]);
</script>

<div class="picker">
	{#each rows as row, i (i)}
		{@const sets = setsFor(row.instrument, config).filter((set) => playable(set.instruments).length)}
		<div class="row">
			<div class="field">
				<span id="{uid}-{i}" class:sr-only={i > 0}>{t.myParts.instrument}</span>
				<InstrumentChooser
					name="instrument"
					bind:value={row.instrument}
					instruments={offered}
					common={common.filter((n) => !inSets.has(n))}
					required={required && i === 0}
					label={t.myParts.instrument}
					labelledby="{uid}-{i}"
				/>
			</div>
			<fieldset class="numbers" title={t.instruments.numbersHint}>
				<legend>{i === 0 ? t.instruments.numbers : ''}</legend>
				{#each PART_NUMBERS as n (n)}
					<label class="number">
						<input
							type="checkbox"
							name="number"
							value="{i}:{n}"
							checked={row.numbers.includes(n)}
							onchange={(event) =>
								(row.numbers = event.currentTarget.checked ? [...row.numbers, n] : row.numbers.filter((m) => m !== n))}
						/>
						<span>{ROMAN[n]}</span>
					</label>
				{/each}
			</fieldset>
			{#if rows.length > 1}
				<button class="remove" type="button" title={t.instruments.remove} aria-label={t.instruments.remove} onclick={() => rows.splice(i, 1)}>
					<Icon name="trash" size={16} />
				</button>
			{/if}
			<!-- A percussionist: every part of the section, or only those of what they play. -->
			{#if sets.length}
				<fieldset class="setup">
					<legend class="sr-only">{instrumentLabel(row.instrument)}</legend>
					<div class="mode" role="radiogroup" aria-label={instrumentLabel(row.instrument)}>
						<button type="button" role="radio" aria-checked={!row.only} onclick={() => only(row, false)}>{t.instruments.setupAll(instrumentLabel(row.instrument))}</button>
						<button type="button" role="radio" aria-checked={row.only} onclick={() => only(row, true)}>{t.instruments.setupSome}</button>
					</div>
					{#if row.only}
						<p class="hint">{row.plays.length ? t.instruments.setupHint : t.instruments.setupNone}</p>
						<div class="sets">
							{#each sets as set (set.name)}
								{@const names = playable(set.instruments)}
								{@const n = have(row, set.instruments)}
								<div class="set" class:on={n > 0} class:part={n > 0 && n < names.length}>
									<button type="button" class="card" aria-pressed={n === 0 ? 'false' : n === names.length ? 'true' : 'mixed'} onclick={() => toggleSet(row, set.instruments)}>
										<InstrumentGlyph glyph={glyphOf(names[0])} size={26} />
										<span class="set-name">{set.name}</span>
										<span class="count">{n ? t.instruments.setupCount(n, names.length) : ''}</span>
									</button>
									{#if names.length > 1}
										<button
											type="button"
											class="adjust"
											aria-expanded={row.open === set.name}
											aria-controls="{uid}-{i}-{set.name}"
											onclick={() => (row.open = row.open === set.name ? null : set.name)}
										>
											{t.instruments.setupAdjust}<Icon name="chevron" size={12} />
										</button>
									{/if}
								</div>
							{/each}
						</div>
						{#if row.open}
							{@const open = sets.find((set) => set.name === row.open)}
							{#if open}
								<div class="singles" id="{uid}-{i}-{open.name}" role="group" aria-label={t.instruments.setupOf(open.name)}>
									{#each playable(open.instruments) as name (name)}
										<button type="button" class="single" aria-pressed={row.plays.includes(name)} onclick={() => toggleOne(row, name)}>
											<Icon name={row.plays.includes(name) ? 'check' : 'plus'} size={12} />{instrumentLabel(name)}
										</button>
									{/each}
								</div>
							{/if}
						{/if}
						{#each row.plays as name (name)}<input type="hidden" name="plays" value="{i}:{name}" />{/each}
					{/if}
				</fieldset>
			{/if}
		</div>
	{/each}
	<button class="add" type="button" onclick={() => rows.push(newRow())}>
		<Icon name="plus" size={16} />{t.instruments.add}
	</button>
</div>

<style>
	.picker {
		display: grid;
		gap: var(--space-2);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2) var(--space-3);
	}

	.row .field {
		flex: 1;
		min-width: 160px;
	}

	.numbers {
		display: grid;
		grid-auto-flow: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.numbers legend {
		padding: 0;
		margin-bottom: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.number {
		position: relative;
		display: inline-grid;
		cursor: pointer;
	}

	.number input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}

	.number span {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 700;
	}

	.number input:checked + span {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.number input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.remove,
	.add {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.remove {
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-control);
	}

	.remove:hover {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.add {
		justify-self: start;
		padding: var(--space-1) 0;
		color: var(--accent);
		font-weight: 600;
	}

	/* ---------- A percussionist's setup: under the row, across its width ---------- */

	.setup {
		display: grid;
		flex-basis: 100%;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-3);
		border: 0;
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}

	/* Two choices as one switch. */
	.mode {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		padding: 2px;
		border-radius: var(--radius-control);
		background: var(--bg);
	}

	.mode button {
		min-height: 36px;
		padding: 0 var(--space-2);
		border: 0;
		border-radius: calc(var(--radius-control) - 2px);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.mode button[aria-checked='true'] {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-raised);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.sets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: var(--space-2);
	}

	.set {
		display: grid;
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface);
		overflow: hidden;
		transition: border-color var(--fast) var(--ease);
	}

	.set.on {
		border-color: var(--accent);
	}

	.card {
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: var(--space-3) var(--space-2) var(--space-2);
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		cursor: pointer;
	}

	.set.on .card {
		background: var(--accent-soft);
		color: var(--accent);
	}

	/* Only some of it: lighter, so "all" and "some" read apart at a glance. */
	.set.part .card {
		background: color-mix(in oklab, var(--accent-soft) 45%, var(--surface));
	}

	.set-name {
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 650;
		line-height: 1.2;
		text-align: center;
	}

	.count {
		min-height: 1.2em;
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.adjust {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 30px;
		border: 0;
		border-top: 1px solid var(--hairline);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.adjust:hover,
	.adjust[aria-expanded='true'] {
		color: var(--accent);
	}

	.adjust :global(svg) {
		transition: rotate var(--fast) var(--ease);
	}

	.adjust[aria-expanded='true'] :global(svg) {
		rotate: 90deg;
	}

	.singles {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: var(--space-2);
		border-radius: var(--radius-control);
		background: var(--surface);
	}

	.single {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		padding: 0 12px 0 10px;
		border: 1px dashed var(--border);
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.single[aria-pressed='true'] {
		border-style: solid;
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>

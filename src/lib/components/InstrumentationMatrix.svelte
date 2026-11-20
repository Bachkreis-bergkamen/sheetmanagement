<script lang="ts">
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import type { Coverage } from '#lib/music/my-parts.ts';
	import * as t from '#lib/i18n/texts.ts';

	let {
		instruments,
		rows
	}: {
		instruments: { name: string; played: boolean }[];
		rows: { title: string; pieceId?: string; hasMusic: boolean; cells: Coverage[] }[];
	} = $props();

	const anyPlayed = $derived(instruments.some((instrument) => instrument.played));
	let onlyPlayed = $state(true);
	const columns = $derived(
		instruments.map((instrument, index) => ({ ...instrument, index })).filter((c) => !onlyPlayed || !anyPlayed || c.played)
	);
	// Gaps that matter: an instrument a member plays, in a piece with sheet music, without a usable part.
	const gaps = $derived(
		rows.reduce(
			(sum, row) =>
				sum + (row.hasMusic ? instruments.filter((c, i) => c.played && (row.cells[i] === 'problem' || row.cells[i] === 'none')).length : 0),
			0
		)
	);
	const SYMBOL: Record<Coverage, string> = { own: '●', shared: '◐', problem: '!', none: '–' };
</script>

<!-- Mostly for the people planning the programme, so it starts folded. -->
<details class="block">
	<summary class="head">
		<h2>{t.instrumentation.title}</h2>
		{#if anyPlayed && gaps}<strong class="gaps">{t.instrumentation.gaps(gaps)}</strong>{/if}
	</summary>
	<p class="lead">{t.instrumentation.lead}</p>
	{#if anyPlayed}
		<label class="toggle"><input type="checkbox" bind:checked={onlyPlayed} />{t.instrumentation.onlyPlayed}</label>
	{/if}

	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th class="piece" scope="col">{t.instrumentation.piece}</th>
					{#each columns as column (column.name)}
						<th scope="col" class="instrument" class:played={column.played}><span>{instrumentLabel(column.name)}</span></th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, r (r)}
					<tr>
						<th class="piece" scope="row">
							{#if row.pieceId}<a href="/stuecke/{encodeURIComponent(row.pieceId)}">{row.title}</a>{:else}{row.title}{/if}
							{#if !row.hasMusic}<span class="muted">{t.instrumentation.noMusic}</span>{/if}
						</th>
						{#each columns as column (column.name)}
							{@const cell = row.cells[column.index]}
							<td class={row.hasMusic ? cell : 'empty'} title="{instrumentLabel(column.name)}: {t.instrumentation.legend[cell]}">
								{#if row.hasMusic}<span aria-hidden="true">{SYMBOL[cell]}</span><span class="sr-only">{t.instrumentation.legend[cell]}</span>{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<ul class="legend">
		{#each ['own', 'shared', 'problem', 'none'] as const as kind (kind)}
			<li><span class="cell {kind}" aria-hidden="true">{SYMBOL[kind]}</span>{t.instrumentation.legend[kind]}</li>
		{/each}
	</ul>
</details>

<style>
	.block {
		margin: var(--space-6) 0;
	}

	summary.head {
		cursor: pointer;
		list-style: none;
	}

	summary.head::-webkit-details-marker {
		display: none;
	}

	summary.head h2::before {
		content: '▸ ';
		color: var(--text-muted);
	}

	details[open] summary.head h2::before {
		content: '▾ ';
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	h2 {
		margin-left: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.lead {
		margin: 0 0 var(--space-3) var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	.gaps {
		color: var(--warn);
	}

	.scroll {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	table {
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: var(--space-2);
		border-bottom: 1px solid var(--border);
	}

	tbody tr:last-child > * {
		border-bottom: 0;
	}

	.piece {
		position: sticky;
		left: 0;
		z-index: 1;
		min-width: 160px;
		max-width: 240px;
		background: var(--surface);
		text-align: left;
		font-weight: 600;
	}

	.piece a:hover {
		color: var(--accent);
	}

	.piece .muted {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 400;
	}

	.instrument {
		height: 120px;
		vertical-align: bottom;
		color: var(--text-muted);
		font-weight: 500;
		white-space: nowrap;
	}

	.instrument span {
		display: inline-block;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}

	.instrument.played {
		color: var(--text);
		font-weight: 700;
	}

	td,
	.cell {
		min-width: 32px;
		text-align: center;
		font-weight: 700;
	}

	.own {
		color: var(--ok);
	}

	.shared {
		color: var(--accent);
	}

	.problem {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.none {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: var(--space-2) 0 0 var(--space-1);
		padding: 0;
		list-style: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.cell {
		display: inline-grid;
		place-items: center;
		min-width: 22px;
		height: 22px;
		border-radius: var(--radius-xs);
	}
</style>

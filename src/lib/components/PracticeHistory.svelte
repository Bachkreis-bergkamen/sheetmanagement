<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import type { HistoryDay } from '#lib/practice/drills/progress.ts';

	/**
	 * The member's own last two weeks in the Übebereich (#300): a bar per day for the minutes,
	 * the daily goal as a line, and per day how much was right and how quick on hover or focus.
	 * Only the member sees it; it's read from the device. A table holds the same for screen readers.
	 */
	let { days, goal }: { days: HistoryDay[]; goal: number } = $props();
	const tx = t.drills.history;

	const HEIGHT = 56;
	/** The scale tops out at twice the goal, or the longest day if longer. */
	const top = $derived(Math.max(goal * 2, ...days.map((day) => day.minutes)));
	const percent = (share: number | null) => (share === null ? '–' : `${Math.round(share * 100)} %`);
	const number = (value: number | null) => (value === null ? '–' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value));
	const dateOf = (day: string, style: 'short' | 'weekday') =>
		new Date(`${day}T12:00:00`).toLocaleDateString(config.locale, style === 'short' ? { day: 'numeric', month: 'short' } : { weekday: 'narrow' });

	const practised = $derived(days.filter((day) => day.answers > 0));
	const overall = $derived.by(() => {
		const answers = practised.reduce((sum, day) => sum + day.answers, 0);
		return answers ? practised.reduce((sum, day) => sum + (day.right ?? 0) * day.answers, 0) / answers : null;
	});
	let hovered = $state<number | null>(null);
</script>

<figure class="history">
	<figcaption>
		<span class="ui-label">{tx.title}</span>
		<span class="sum">{tx.summary(practised.length, overall === null ? null : percent(overall))}</span>
	</figcaption>
	<div class="plot" aria-hidden="true" style:--goal={goal / top}>
		<span class="goal-line" title={tx.goal(goal)}></span>
		{#each days as day, i (day.day)}
			<button
				type="button"
				class="day"
				class:met={day.minutes >= goal}
				tabindex="-1"
				onmouseenter={() => (hovered = i)}
				onmouseleave={() => (hovered = null)}
				onfocus={() => (hovered = i)}
				onblur={() => (hovered = null)}
			>
				<span class="bar" style:height="{day.minutes ? Math.max(3, (day.minutes / top) * HEIGHT) : 0}px"></span>
				<span class="weekday">{dateOf(day.day, 'weekday')}</span>
			</button>
		{/each}
		{#if hovered !== null}
			{@const day = days[hovered]}
			<span class="tip" style:--at="{((hovered + 0.5) / days.length) * 100}%">
				{day.answers ? tx.tip(dateOf(day.day, 'short'), number(day.minutes), percent(day.right), number(day.pace)) : `${dateOf(day.day, 'short')}: ${tx.none}`}
			</span>
		{/if}
	</div>
	<!-- In a box of its own: a table's caption sits outside the table, so hiding the table leaves it showing. -->
	<div class="sr-only">
	<table>
		<caption>{tx.label}</caption>
		<thead>
			<tr><th scope="col">{tx.day}</th><th scope="col">{tx.minutes}</th><th scope="col">{tx.right}</th><th scope="col">{tx.pace}</th></tr>
		</thead>
		<tbody>
			{#each days as day (day.day)}
				<tr><th scope="row">{dateOf(day.day, 'short')}</th><td>{number(day.minutes)}</td><td>{percent(day.right)}</td><td>{day.pace === null ? '–' : `${number(day.pace)} s`}</td></tr>
			{/each}
		</tbody>
	</table>
	</div>
</figure>

<style>
	.history {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}

	.sum {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.plot {
		position: relative;
		display: grid;
		grid-template-columns: repeat(14, 1fr);
		gap: 2px;
		align-items: end;
	}

	/* The daily goal: a recessive dashed line across the bars. */
	.goal-line {
		position: absolute;
		inset-inline: 0;
		/* Above the weekday letters (1rem and the 4px gap), at the goal's height in the bars' 56px. */
		bottom: calc(1rem + 4px + 56px * var(--goal));
		border-top: 1px dashed var(--text-muted);
		opacity: 0.5;
		pointer-events: none;
	}

	.day {
		display: grid;
		justify-items: center;
		align-content: end;
		gap: 4px;
		height: calc(56px + 4px + 1rem);
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: default;
	}

	.bar {
		width: min(100%, 14px);
		border-radius: 4px 4px 0 0;
		background: color-mix(in oklab, var(--accent) 55%, var(--surface));
	}

	.day.met .bar {
		background: var(--accent);
	}

	.weekday {
		height: 1rem;
		color: var(--text-muted);
		font-size: var(--text-xs, 0.7rem);
		line-height: 1rem;
	}

	.tip {
		position: absolute;
		bottom: calc(100% + 4px);
		left: clamp(0px, calc(var(--at) - 8rem), calc(100% - 16rem));
		width: 16rem;
		max-width: 100%;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
		background: var(--surface);
		box-shadow: var(--shadow-sm, 0 2px 8px rgb(0 0 0 / 0.12));
		color: var(--text);
		font-size: var(--text-sm);
		pointer-events: none;
	}
</style>

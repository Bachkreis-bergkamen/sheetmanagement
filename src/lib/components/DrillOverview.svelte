<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { Overview } from '#lib/practice/drills/sharing.ts';

	/**
	 * One member's shared Übebereich summary (#300), as the leaders and the parents see it: days
	 * practised in each of the last four weeks, minutes, how much was right, and per drill.
	 */
	let { name, detail = '', overview }: { name: string; detail?: string; overview: Overview } = $props();
	const tx = t.drills.overview;
	const percent = (share: number | null) => (share === null ? '–' : `${Math.round(share * 100)} %`);
	const skillName = (skill: string) => (t.drills.kinds as Record<string, { title: string }>)[skill]?.title ?? tx.skills[skill] ?? skill;
	const dateOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<article class="ui-card overview">
	<header>
		<h3>{name}</h3>
		{#if detail}<span class="muted">{detail}</span>{/if}
	</header>
	{#if overview.days}
		<dl class="facts">
			<div><dt>{tx.days}</dt><dd>{overview.days}</dd></div>
			<div><dt>{tx.minutes}</dt><dd>{overview.minutes}</dd></div>
			<div><dt>{tx.right}</dt><dd>{percent(overview.right)}</dd></div>
			<div><dt>{tx.last}</dt><dd>{overview.last ? dateOf(overview.last) : '–'}</dd></div>
		</dl>
		<div class="weeks" role="img" aria-label={tx.weeksLabel(overview.weeks)}>
			{#each overview.weeks as days, i (i)}
				<span class="week">
					<span class="bar" style:height="{(days / 7) * 100}%"></span>
				</span>
			{/each}
		</div>
		<p class="weeks-caption muted">{tx.weeksCaption}</p>
		<ul class="skills">
			{#each overview.skills as skill (skill.skill)}
				<li><span>{skillName(skill.skill)}</span><span class="muted">{tx.skillLine(skill.answers, percent(skill.right), skill.minutes)}</span></li>
			{/each}
		</ul>
	{:else}
		<p class="muted">{tx.nothing}</p>
	{/if}
</article>

<style>
	.overview {
		display: grid;
		gap: var(--space-3);
		align-content: start;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-2);
	}

	h3 {
		margin: 0;
		font-size: var(--text-base);
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2);
		margin: 0;
	}

	.facts div {
		display: grid;
	}

	.facts dt {
		color: var(--text-muted);
		font-size: var(--text-xs, 0.75rem);
	}

	.facts dd {
		margin: 0;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.weeks {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2px;
		height: 36px;
		align-items: end;
	}

	.week {
		display: flex;
		align-items: end;
		height: 100%;
		border-bottom: 1px solid var(--hairline);
	}

	.bar {
		width: 100%;
		border-radius: 4px 4px 0 0;
		background: var(--accent);
	}

	.weeks-caption {
		margin-top: calc(-1 * var(--space-2));
		font-size: var(--text-xs, 0.75rem);
	}

	.skills {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}

	.skills li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-2);
	}
</style>

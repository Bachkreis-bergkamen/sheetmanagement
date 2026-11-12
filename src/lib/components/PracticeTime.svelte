<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { practiceMonth, practiceWeek, totalSeconds, treeStage, type PracticeDay, type TreeStage } from '#lib/practice/practice.ts';
	import Icon from './Icon.svelte';
	import PracticeTree from './PracticeTree.svelte';
	import Segmented from './Segmented.svelte';

	/** Practice time on /profil: the opt-in, the week and month overview, and the tree. Only ever the member's own. */
	let {
		on,
		days,
		today,
		markedParts = 0,
		message
	}: { on: boolean; days: PracticeDay[]; today: string; markedParts?: number; message?: string } = $props();

	const saving = new FormState();
	let view = $state<'week' | 'month'>('week');
	let offset = $state(0);

	const period = $derived(view === 'week' ? practiceWeek(days, today, offset) : practiceMonth(days, today, offset));
	const highest = $derived(Math.max(3600, ...period.days.map((day) => day.seconds)));
	const total = $derived(totalSeconds(days));
	const stage = $derived(treeStage(total));
	const nextStage = $derived(treeStage(stage.next));

	const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);
	const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(config.locale, { timeZone: 'UTC', ...options });
	const weekday = format({ weekday: 'short' });
	const longDay = format({ weekday: 'long', day: 'numeric', month: 'long' });
	const shortDay = format({ day: 'numeric', month: 'short' });
	const monthName = format({ month: 'long', year: 'numeric' });

	const title = $derived.by(() => {
		if (offset === 0) return view === 'week' ? t.practice.thisWeek : t.practice.thisMonth;
		if (view === 'month') return monthName.format(dayDate(period.start));
		return `${shortDay.format(dayDate(period.start))} – ${shortDay.format(dayDate(period.days[6].day))}`;
	});
	/** Under each bar: the weekday, or in a month every 7th day's number. */
	const label = (day: string, i: number) => (view === 'week' ? weekday.format(dayDate(day)) : i % 7 === 0 ? String(Number(day.slice(8))) : '');
	/** The bars' room in pixels, under the 140px of the chart less the labels; for the minutes inside. */
	const BAR_HEIGHT = 120;
	const stageName = (s: TreeStage) => (s.kind === 'tree' ? t.practice.tree.tree(s.age) : t.practice.tree[s.kind]);
</script>

<section class="ui-card practice" id="probenzeit">
	<h3><Icon name="clock" size={18} />{t.practice.title}</h3>
	<p class="muted">{t.practice.lead}</p>
	<p class="private"><Icon name="shield" size={14} />{t.practice.private}</p>

	{#if !on && !days.length}
		<p><strong>{t.practice.question}</strong></p>
		<p class="muted small">{t.practice.how}</p>
	{:else}
		<p>{on ? t.practice.on : t.practice.off}</p>
	{/if}

	<form method="POST" action="?/practice" use:enhance={saving.submit()}>
		<input type="hidden" name="on" value={on ? 'false' : 'true'} />
		<button class={on ? 'btn secondary' : 'btn'} disabled={saving.busy}>{on ? t.practice.turnOff : t.practice.turnOn}</button>
	</form>
	{#if message}<p class="msg error" role="alert">{message}</p>{/if}

	{#if on || days.length}
		<div class="grow">
			<div class="tree">
				<PracticeTree {stage} />
			</div>
			<div class="stage">
				<span class="ui-label">{t.practice.tree.title}</span>
				<strong>{stageName(stage)}</strong>
				<span class="muted">{t.practice.tree.all(t.practice.duration(total))}</span>
				<div class="progress" role="progressbar" aria-labelledby="practice-next" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stage.progress * 100)}>
					<span style:width="{stage.progress * 100}%"></span>
				</div>
				<span class="muted small" id="practice-next">{t.practice.tree.next(t.practice.duration(stage.next - total), stageName(nextStage))}</span>
			</div>
		</div>
		<p class="muted small">{t.practice.tree.hint}</p>

		<div class="overview">
			<div class="head">
				<Segmented
					label={t.practice.view}
					options={[
						{ value: 'week', label: t.practice.week },
						{ value: 'month', label: t.practice.month }
					]}
					bind:value={view}
					onchange={() => (offset = 0)}
				/>
				<div class="nav">
					<button type="button" class="icon" onclick={() => offset--} aria-label={t.practice.earlier}><Icon name="back" size={16} /></button>
					<strong>{title}</strong>
					<button type="button" class="icon" onclick={() => offset++} disabled={offset >= 0} aria-label={t.practice.later}><Icon name="chevron" size={16} /></button>
				</div>
			</div>
			<div class="bars" class:month={view === 'month'} style:grid-template-columns="repeat({period.days.length}, 1fr)">
				{#each period.days as day, i (day.day)}
					<div class="bar" title={t.practice.perDay(longDay.format(dayDate(day.day)), t.practice.duration(day.seconds))}>
						<span class="fill" class:today={day.day === today} class:future={day.day > today} style:height="{(day.seconds / highest) * 100}%">
							<!-- The minutes inside the bar, where it's tall enough for them (and wide enough, see the style). -->
							{#if day.seconds >= 60 && (day.seconds / highest) * BAR_HEIGHT >= 18}<span class="minutes" aria-hidden="true">{Math.round(day.seconds / 60)}<span class="unit">&nbsp;min</span></span>{/if}
						</span>
						<small>{label(day.day, i)}</small>
					</div>
				{/each}
			</div>
			<p class="sum">{period.total ? t.practice.total(t.practice.duration(period.total)) : t.practice.nothing}</p>
		</div>

		{#if days.length}
			<form method="POST" action="?/practiceDelete" use:enhance={saving.submit()} onsubmit={(event) => confirm(t.practice.confirmDelete) || event.preventDefault()}>
				<button class="delete" disabled={saving.busy}>{t.practice.delete}</button>
			</form>
		{/if}
	{/if}

	<!-- Notes drawn in the practice viewer: theirs alone, whether practice time is on or not. -->
	{#if markedParts}
		<div class="marks">
			<p><strong>{t.practice.marks.profileTitle}</strong> <span class="muted">{t.practice.marks.count(markedParts)} {t.practice.marks.private}</span></p>
			<form method="POST" action="?/marksDelete" use:enhance={saving.submit()} onsubmit={(event) => confirm(t.practice.marks.confirmDeleteAll) || event.preventDefault()}>
				<button class="delete" disabled={saving.busy}>{t.practice.marks.deleteAll}</button>
			</form>
		</div>
	{/if}
</section>

<style>
	.practice {
		display: grid;
		gap: var(--space-3);
	}

	h3 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-lg);
	}

	p {
		margin: 0;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.small {
		font-size: var(--text-xs);
	}

	.private {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--ok);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.grow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
		padding: var(--space-4);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--ok) 7%, var(--surface));
	}

	.tree {
		flex: 0 0 150px;
	}

	.stage {
		display: grid;
		flex: 1;
		gap: var(--space-1);
		min-width: 180px;
	}

	.stage strong {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		line-height: 1.1;
	}

	.progress {
		height: 8px;
		margin-top: var(--space-1);
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		overflow: hidden;
	}

	.progress span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--ok);
		transition: width 0.4s var(--ease);
	}

	.overview {
		display: grid;
		gap: var(--space-3);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.nav strong {
		min-width: 9em;
		text-align: center;
		font-size: var(--text-md);
	}

	.icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}

	.icon:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.bars {
		display: grid;
		gap: var(--space-2);
		align-items: end;
		height: 140px;
	}

	.bars.month {
		gap: 2px;
	}

	.bar {
		display: grid;
		grid-template-rows: 1fr auto;
		height: 100%;
		min-width: 0;
	}

	.fill {
		align-self: end;
		min-height: 2px;
		border-radius: var(--radius-xs) var(--radius-xs) var(--radius-hair) var(--radius-hair);
		background: color-mix(in oklab, var(--ok) 70%, transparent);
	}

	.bar {
		container-type: inline-size;
	}

	.fill {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		overflow: hidden;
	}

	.minutes {
		display: none;
		padding-top: 3px;
		/* Contrast on the 70 % green: dark ink in light mode, white in dark mode (axe, both ≥ 4.5). */
		color: light-dark(var(--text), #fff);
		font-size: var(--text-2xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		white-space: nowrap;
	}

	.unit {
		display: none;
	}

	/* The number where the bar is wide enough for it, "min" with it where there's room for that too. */
	@container (min-width: 1.8em) {
		.minutes {
			display: block;
		}
	}

	@container (min-width: 4.5em) {
		.unit {
			display: inline;
		}
	}

	.month .fill {
		border-radius: var(--radius-hair) var(--radius-hair) var(--radius-hair) var(--radius-hair);
	}

	.fill.today {
		background: var(--ok);
	}

	.fill.today .minutes {
		color: var(--surface);
	}

	.fill.future {
		visibility: hidden;
	}

	.bar small {
		height: 1.4em;
		overflow: visible;
		color: var(--text-muted);
		font-size: var(--text-2xs);
		text-align: center;
		white-space: nowrap;
	}

	.sum {
		font-weight: 600;
	}

	.marks {
		display: grid;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}

	.delete {
		justify-self: start;
		min-height: 36px;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-control);
		background: color-mix(in oklab, var(--danger) 10%, transparent);
		color: var(--danger);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ScanPlan from '#lib/components/ScanPlan.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const marking = new FormState();

	/** "" = all pieces, "@" = scans assigned to me, "*" = any current programme, else one programme. */
	let filter = $state(page.url.searchParams.has('meine') ? '@' : '');
	const anyMine = $derived(data.pieces.some((piece) => piece.gaps.some((gap) => gap.mine)));
	const shown = $derived(
		filter === '@'
			? data.pieces
					.map((piece) => ({ ...piece, gaps: piece.gaps.filter((gap) => gap.mine), reports: [], hints: [], unscored: [] }))
					.filter((piece) => piece.gaps.length)
			: data.pieces.filter((piece) =>
					filter === '' ? true : filter === '*' ? piece.programs.length > 0 : piece.programs.includes(filter)
				)
	);
	const filters = $derived([
		{ key: '', label: t.gaps.all },
		...(anyMine || filter === '@' ? [{ key: '@', label: t.gaps.mine }] : []),
		...(data.programs.length ? [{ key: '*', label: t.gaps.current }] : []),
		...(data.programs.length > 1 ? data.programs.map((program) => ({ key: program, label: program })) : [])
	]);
</script>

<Title title={t.gaps.title} />
<PageHeader title={t.gaps.title} lead={t.gaps.lead} />

{#if !data.ok}
	<p class="msg error">{t.gaps.failed}</p>
{:else if !data.pieces.length}
	<p class="msg ok"><Icon name="check" size={16} />{t.gaps.none}</p>
	{#if data.check && data.check.checked < data.check.total}<p class="muted">{t.gaps.checkProgress(data.check.checked, data.check.total)}</p>{/if}
{:else}
	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
	<ul class="counts">
		{#each ['missing', 'empty', 'incomplete', 'reports', 'hints', 'unscored'] as const as kind (kind)}
			{#if data.counts[kind]}
				<li class={kind}><strong>{data.counts[kind]}</strong> {t.gaps.counts[kind]}</li>
			{/if}
		{/each}
	</ul>
	{#if data.check && data.check.checked < data.check.total}<p class="muted progress">{t.gaps.checkProgress(data.check.checked, data.check.total)}</p>{/if}

	{#if filters.length > 1}
		<div class="filters" role="tablist">
			{#each filters as option (option.key)}
				<button role="tab" class="filter" class:active={filter === option.key} aria-selected={filter === option.key} onclick={() => (filter = option.key)}>
					{option.label}
				</button>
			{/each}
		</div>
	{/if}

	{#if shown.length}
		<ul class="pieces">
			{#each shown as piece (piece.id)}
				<li class="piece">
					<div class="head">
						<a class="title" href="/stuecke/{encodeURIComponent(piece.id)}">{piece.title}</a>
						{#if piece.composer}<span class="muted">{piece.composer}</span>{/if}
						{#each piece.programs as program (program)}<span class="tag program">{program}</span>{/each}
						{#if data.canMark && data.scanners.length && piece.gaps.length > 1}
							<ScanPlan
								ids={piece.gaps.map((gap) => gap.id)}
								scanners={data.scanners}
								label={t.gaps.planAll}
								hint={t.gaps.planAllHint(piece.gaps.length)}
							/>
						{/if}
					</div>
					<ul class="gaps">
						{#each piece.gaps as gap (gap.id)}
							<li>
								<a href={gap.url} target="_blank" rel="noopener noreferrer">{gap.label}</a>
								<span class="status {gap.status}">{t.piece.partStatus[gap.status]}</span>
								{#if gap.reported}<span class="status reported" title={t.gaps.reportedHint}><Icon name="flag" size={12} />{t.gaps.reported}</span>{/if}
								{#if gap.done}<span class="status done" title={t.gaps.doneHint}><Icon name="check" size={12} />{t.gaps.done}</span>{/if}
								{#if gap.priority}<span class="status priority {gap.priority}">{t.gaps.priorities[gap.priority]}</span>{/if}
								{#if gap.assigneeName}
									<span class="status assignee" class:mine={gap.mine}><Icon name="user" size={12} />{gap.mine ? t.gaps.assignedToMe : t.gaps.assignedTo(gap.assigneeName)}</span>
								{/if}
								{#if data.canMark && data.scanners.length && !gap.done}
									<ScanPlan ids={[gap.id]} priority={gap.priority} assignee={gap.assignee} scanners={data.scanners} />
								{/if}
								{#if data.canMark}
									<form method="POST" action="?/markDone" use:enhance={marking.submit()}>
										<input type="hidden" name="id" value={gap.id} />
										<input type="hidden" name="done" value={String(!gap.done)} />
										<button class="mini ghost" disabled={marking.busy}>{gap.done ? t.gaps.markOpen : t.gaps.markDone}</button>
									</form>
								{/if}
							</li>
						{/each}
						{#each piece.reports as report (report.id)}
							<li>
								{#if report.url}
									<a href={report.url} target="_blank" rel="noopener noreferrer">{report.part || t.reports.wholePiece}</a>
								{:else}
									<span>{report.part || t.reports.wholePiece}</span>
								{/if}
								<span class="status {report.status}">{t.piece.partStatus[report.status]}</span>
								<span class="status reported" title={t.gaps.reportedHint}><Icon name="flag" size={12} />{t.gaps.reported}: {t.feedbackValues.reportKind[report.kind]}</span>
								{#if report.comment}<span class="muted">{t.common.quote(report.comment)}</span>{/if}
							</li>
						{/each}
						{#each piece.unscored as voice (voice)}
							<li class="hint">
								<span>{voice}</span>
								<span class="status hinted missing" title={t.gaps.unscoredTitle}><Icon name="music" size={12} />{t.gaps.unscored}</span>
							</li>
						{/each}
						{#each piece.hints as hint (hint.id)}
							<li class="hint">
								<a href={hint.url} target="_blank" rel="noopener noreferrer">{hint.label}</a>
								<span class="status hinted {hint.problem}" title={t.gaps.hintTitle}>
									<Icon name="search" size={12} />{hint.problem === 'empty' ? t.gaps.hint.empty : t.gaps.hint.incomplete(hint.pages, hint.usual)}
								</span>
								{#if data.canMark}
									<form method="POST" use:enhance={marking.submit()}>
										<input type="hidden" name="id" value={hint.id} />
										{#if data.driveWrite}
											<button class="mini" formaction="?/confirmHint" disabled={marking.busy}>
												{t.gaps.hintConfirm(config.naming.status[hint.problem])}
											</button>
										{/if}
										<button class="mini ghost" formaction="?/dismissHint" disabled={marking.busy}>{t.gaps.hintDismiss}</button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="msg info">{t.gaps.noneHere}</p>
	{/if}
{/if}

<style>
	.msg {
		margin-bottom: var(--space-4);
	}

	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0 0 var(--space-4);
		padding: 0;
		list-style: none;
	}

	.counts li {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-sm);
	}

	.counts .missing,
	.counts .empty {
		background: color-mix(in oklab, var(--danger) 10%, transparent);
	}

	.counts .incomplete,
	.counts .reports,
	.counts .hints,
	.counts .unscored {
		background: color-mix(in oklab, var(--warn) 12%, transparent);
	}


	.filters {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		overflow-x: auto;
	}

	.filter {
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}

	.filter.active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.pieces {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.piece {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin-bottom: var(--space-2);
	}

	.title {
		font-weight: 600;
	}

	.title:hover {
		color: var(--accent);
	}

	.tag {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.gaps {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-md);
	}

	.gaps li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.gaps a:hover {
		color: var(--accent);
		text-decoration: underline;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 6px;
		border-radius: var(--radius-xs);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.status.missing,
	.status.empty {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.status.incomplete,
	.status.reported {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.status.hinted {
		border: 1px dashed currentColor;
		background: none;
		color: var(--warn);
		font-weight: 600;
	}

	.hint form {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.mini {
		padding: 2px 10px;
		border: 1px solid var(--accent);
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.mini.ghost {
		border-color: var(--border);
		background: var(--surface);
		color: var(--text);
	}

	.mini:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.progress {
		margin: calc(-1 * var(--space-2)) 0 var(--space-4);
	}

	.status.priority.high {
		background: var(--danger);
		color: var(--accent-contrast);
	}

	.status.priority.medium {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.status.priority.low,
	.status.assignee {
		background: var(--surface-2);
		color: var(--text);
		font-weight: 600;
	}

	.status.assignee.mine {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.status.done {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>

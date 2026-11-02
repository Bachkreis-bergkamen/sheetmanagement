<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { Priority } from '#lib/repertoire/missing-parts.ts';
	import type { PartStatus } from '#lib/music/types.ts';
	import Icon from './Icon.svelte';
	import ScanPlan from './ScanPlan.svelte';

	/**
	 * "Zu scannen" on a piece's page: its gaps, how urgent each is and who scans it,
	 * for the Notenwart. The same plans as on "Fehlende Stimmen".
	 */

	interface Gap {
		id: string;
		label: string;
		status: PartStatus;
		priority?: Priority;
		assignee?: string;
		assigneeName?: string;
		mine: boolean;
		done: boolean;
	}

	let { scans }: { scans: { scanners: { email: string; name: string }[]; gaps: Gap[] } | null } = $props();
</script>

{#if scans}
	<section class="block scans" aria-labelledby="scans-title">
		<div class="head">
			<h2 class="ui-label" id="scans-title"><Icon name="file" size={14} />{t.gaps.pieceTitle}</h2>
			{#if scans.gaps.length > 1}
				<ScanPlan
					ids={scans.gaps.map((gap) => gap.id)}
					scanners={scans.scanners}
					label={t.gaps.planAll}
					hint={t.gaps.planAllHint(scans.gaps.length)}
				/>
			{/if}
		</div>
		<p class="lead">{t.gaps.pieceLead}</p>
		<ul class="gaps">
			{#each scans.gaps as gap (gap.id)}
				<li>
					<span class="label">{gap.label}</span>
					<span class="status {gap.status}">{t.piece.partStatus[gap.status]}</span>
					{#if gap.priority}<span class="status priority {gap.priority}">{t.gaps.priorities[gap.priority]}</span>{/if}
					{#if gap.assigneeName}
						<span class="status assignee" class:mine={gap.mine}><Icon name="user" size={12} />{gap.mine ? t.gaps.assignedToMe : t.gaps.assignedTo(gap.assigneeName)}</span>
					{/if}
					{#if gap.done}<span class="status done"><Icon name="check" size={12} />{t.gaps.done}</span>{/if}
					<ScanPlan ids={[gap.id]} priority={gap.priority} assignee={gap.assignee} scanners={scans.scanners} />
				</li>
			{/each}
		</ul>
		<a class="more" href="/fehlende-stimmen">{t.gaps.link}<Icon name="chevron" size={14} /></a>
	</section>
{/if}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.head :global(.plan[open]) {
		flex-basis: 100%;
	}

	.ui-label {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
	}

	.lead {
		margin: var(--space-1) 0 var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.gaps {
		display: grid;
		gap: var(--space-1);
		margin: 0 0 var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
		list-style: none;
	}

	.gaps li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
	}

	.label {
		font-weight: 600;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 6px;
		border-radius: var(--radius-xs);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.status.missing,
	.status.empty {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.status.priority.high {
		background: var(--danger);
		color: var(--accent-contrast);
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

	.more {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}
</style>

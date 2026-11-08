<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { shortDateLabel } from '#lib/repertoire/dates.ts';
	import type { OpenItem } from '#lib/server/todo.ts';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();

	/** The kinds in the order they're dealt with, each with its icon; the rest under "Außerdem". */
	const KINDS: { key: string; icon: IconName; kinds: OpenItem['kind'][] }[] = [
		{ key: 'poll', icon: 'poll', kinds: ['poll'] },
		{ key: 'attendance', icon: 'users', kinds: ['attendance'] },
		{ key: 'report', icon: 'flag', kinds: ['report'] },
		{ key: 'request', icon: 'user', kinds: ['request'] },
		{ key: 'loan', icon: 'loan', kinds: ['loan'] },
		{ key: 'wish', icon: 'bulb', kinds: ['wish'] },
		{ key: 'other', icon: 'mail', kinds: ['scans', 'kummerAnswers', 'kummerInbox'] }
	];
	/** The date as a short label; for polls and rented music it's a deadline. */
	function when(item: OpenItem) {
		if (!item.date) return '';
		const label = shortDateLabel(item.date, data.today, config.locale);
		return item.kind === 'poll' || item.kind === 'loan' ? t.todo.until(label) : label;
	}

	const groups = $derived(
		KINDS.map((group) => ({ ...group, items: data.items.filter((item) => group.kinds.includes(item.kind)) })).filter((group) => group.items.length)
	);
</script>

<Title title={t.todo.title} />
<PageHeader title={t.todo.title} lead={t.todo.lead} />

{#if groups.length}
	<div class="groups">
		{#each groups as group (group.key)}
			<section aria-labelledby="todo-{group.key}">
				<h2 class="ui-label" id="todo-{group.key}">{t.todo.kinds[group.key]} <span class="n">{group.items.reduce((sum, item) => sum + (item.count ?? 1), 0)}</span></h2>
				<ul class="ui-list">
					{#each group.items as item, index (index)}
						<li>
							<a href={item.href} class="row">
								<span class="row-icon"><Icon name={group.icon} size={18} /></span>
								<span class="row-body">
									<strong>{#if item.count}{item.count} {/if}{item.title}</strong>
									{#if item.detail || item.date}
										<span>{[item.detail, when(item)].filter(Boolean).join(' · ')}</span>
									{/if}
								</span>
								<span class="chevron"><Icon name="chevron" size={16} /></span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{:else}
	<p class="msg info"><Icon name="check" size={18} />{t.todo.empty}</p>
{/if}

<style>
	.groups {
		display: grid;
		gap: var(--space-5);
	}

	section {
		display: grid;
		gap: var(--space-2);
	}

	.n {
		margin-left: var(--space-1);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 56px;
		padding: var(--space-2) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	.row:hover {
		background: var(--surface-2);
	}

	.row-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.row-body {
		display: grid;
		flex: 1;
		min-width: 0;
		line-height: 1.35;
	}

	.row-body strong {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.row-body span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.chevron {
		color: var(--text-muted);
	}
</style>

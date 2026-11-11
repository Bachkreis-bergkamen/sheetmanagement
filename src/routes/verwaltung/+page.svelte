<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { navGroups, organiserGroups } from '#lib/nav.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data } = $props();

	// The same groups as the workspace tabs on their pages, so the area and its pages agree.
	const groups = $derived(organiserGroups(navGroups({ auth: data.auth, rights: data.rights, features: data.features, polls: data.polls, parent: data.parent })));
</script>

<Title title={t.organise.title} />
<PageHeader title={t.organise.title} lead={t.organise.lead} />

<!-- What's waiting comes first: one list across all the groups below (#185). -->
<a class="ui-card todo" href="/zu-erledigen">
	<span class="row-icon"><Icon name="check" size={18} /></span>
	<span class="row-body">
		<strong>{t.todo.title}</strong>
		<span>{data.open ? t.todo.hub(data.open) : t.todo.empty}</span>
	</span>
	{#if data.open}<span class="count">{data.open}<span class="sr-only"> {t.nav.open}</span></span>{/if}
	<span class="chevron"><Icon name="chevron" size={16} /></span>
</a>

<div class="groups">
	{#each groups as group (group.key)}
		<section aria-labelledby="bereich-{group.key}">
			<h2 class="ui-label" id="bereich-{group.key}">{group.label}</h2>
			<ul class="ui-list">
				{#each group.items as item (item.href)}
					<li>
						<a href={item.href} class="row">
							<span class="row-icon"><Icon name={item.icon} size={18} /></span>
							<span class="row-body">
								<strong>{item.label}</strong>
								{#if t.home.describe[item.href]}<span>{t.home.describe[item.href]}</span>{/if}
							</span>
							{#if data.counts[item.href]}<span class="count">{data.counts[item.href]}<span class="sr-only"> {t.nav.open}</span></span>{/if}
							<span class="chevron"><Icon name="chevron" size={16} /></span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: var(--space-5) var(--space-4);
		align-items: start;
	}

	section {
		display: grid;
		gap: var(--space-2);
	}

	.todo {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 64px;
		margin-bottom: var(--space-5);
		padding: var(--space-3) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	.todo:hover {
		background: var(--surface-2);
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
	}

	.row-body span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.count {
		display: grid;
		place-items: center;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--warn);
		color: var(--bg);
		font-size: var(--text-2xs);
		font-weight: 700;
	}

	.chevron {
		color: var(--text-muted);
	}
</style>

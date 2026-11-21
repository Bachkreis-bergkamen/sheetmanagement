<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
</script>

<Title title={t.duties.title} />
<PageHeader title={t.duties.title} lead={t.duties.overviewLead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.duties.notSetUp}</p>
{:else}
	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
	{#if form && 'saved' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{form.saved}</p>{/if}

	<section class="block">
		<h2 class="ui-label">{t.duties.upcoming}</h2>
		{#if data.upcoming.length}
			<ul class="ui-list">
				{#each data.upcoming as date (date.id)}
					<li>
						<a class="row" href={date.href}>
							<span class="main">
								<span class="title">{date.title}</span>
								<span class="muted">{date.dateText}</span>
							</span>
							<span class="chip" class:free={date.places.free > 0}>{t.duties.places(date.places.free, date.places.needed)}</span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="msg info">{t.duties.noUpcoming}</p>
		{/if}
	</section>

	{#if data.withoutDuties.length}
		<section class="block">
			<h2 class="ui-label">{t.duties.withoutDuties}</h2>
			<ul class="ui-list">
				{#each data.withoutDuties as date (date.id)}
					<li>
						<a class="row" href={date.href}>
							<span class="main">
								<span class="title">{date.title}</span>
								<span class="muted">{date.dateText}</span>
							</span>
							<span class="action"><Icon name="plus" size={14} />{t.duties.setUp}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="block">
		<h2 class="ui-label">{t.duties.counts}</h2>
		<form class="period" method="GET">
			<label class="field">{t.duties.periodFrom}<input type="date" name="von" value={data.period.from} /></label>
			<label class="field">{t.duties.periodTo}<input type="date" name="bis" value={data.period.to} /></label>
			<button class="btn small ghost">{t.duties.show}</button>
		</form>
		{#if data.counts.length}
			<ol class="ui-list counts">
				{#each data.counts as person (person.email)}
					<li>
						<span class="main">
							<span class="title">{person.name}</span>
							<span class="muted">{person.tasks}</span>
						</span>
						<span class="n">{t.duties.countOf(person.count)}</span>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="msg info">{t.duties.noCounts}</p>
		{/if}
		{#if data.none.length}
			<details class="none">
				<summary>{t.duties.noneYet(data.none.length)}</summary>
				<p>{data.none.join(', ')}</p>
			</details>
		{/if}
	</section>

	<section class="block">
		<h2 class="ui-label">{t.duties.templates}</h2>
		{#if data.templates.length}
			<ul class="ui-list">
				{#each data.templates as template (template.id)}
					<li class="template">
						<span class="main">
							<span class="title">{template.name}</span>
							<span class="muted">{template.jobs}</span>
						</span>
						<form method="POST" action="?/removeTemplate" use:enhance={saving.submit()}>
							<input type="hidden" name="template" value={template.id} />
							<button class="icon-btn" disabled={saving.busy} aria-label={t.duties.removeTemplate(template.name)} title={t.duties.removeTemplate(template.name)}><Icon name="trash" size={16} /></button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="msg info">{t.duties.noTemplates}</p>
		{/if}
	</section>
{/if}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.row,
	.counts li,
	.template {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	a.row {
		color: inherit;
	}

	a.row:hover {
		background: var(--surface-2);
	}

	.main {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 2px;
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.chip {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--ok) 12%, transparent);
		color: var(--ok);
		font-size: var(--text-2xs);
		font-weight: 700;
		text-align: right;
	}

	.chip.free {
		background: color-mix(in oklab, var(--warn) 12%, transparent);
		color: var(--warn);
	}

	.action {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
	}

	.period {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
	}

	.n {
		font-weight: 700;
		white-space: nowrap;
	}

	.none {
		margin-top: var(--space-3);
	}

	.none summary {
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
	}

	.none p {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
	}

	.icon-btn {
		display: inline-grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--surface-2);
		color: var(--danger);
	}

	@media (max-width: 480px) {
		.row {
			flex-wrap: wrap;
		}
	}
</style>

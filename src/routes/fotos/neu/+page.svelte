<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { searchText } from '#lib/music/text.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const creating = new FormState();
	const p = t.album.pick;
	/** Shown at once without a search; the archive alone can hold hundreds of concerts. */
	const FIRST = 30;

	let query = $state('');
	const all = $derived(data.state === 'ready' ? data.choices : []);
	const matching = $derived.by(() => {
		const words = searchText(query).split(/\s+/).filter(Boolean);
		return words.length ? all.filter((choice) => words.every((word) => searchText(choice.title, choice.day, choice.when, t.album.kind[choice.kind]).includes(word))) : all;
	});
	const shown = $derived(matching.slice(0, query ? 100 : FIRST));
	const values = $derived(form && 'values' in form ? (form.values as Record<string, string>) : undefined);
	const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(config.locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))));
	const ICONS = { konzert: 'music', probe: 'note', fahrt: 'bus', sonstiges: 'camera' } as const;
</script>

<Title title={p.title} />
<Crumbs items={[{ href: '/fotos', label: t.album.title }]} />
<PageHeader title={p.title} lead={p.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.album.notSetUp}</p>
{:else}
	<label class="search">
		<Icon name="search" size={16} />
		<input bind:value={query} type="search" placeholder={p.search} aria-label={p.search} autocomplete="off" />
	</label>

	{#if shown.length}
		<ul class="ui-list choices">
			{#each shown as choice (choice.key)}
				<li>
					<a class="choice" href={choice.href}>
						<span class="icon"><Icon name={ICONS[choice.kind]} size={18} /></span>
						<span class="body">
							<strong>{choice.title}</strong>
							<span class="muted">{t.album.kind[choice.kind]}{choice.when ? ` · ${choice.when}` : ''}</span>
						</span>
						<Icon name="chevron" size={16} />
					</a>
				</li>
			{/each}
		</ul>
		{#if matching.length > shown.length}<p class="muted more">{p.more(matching.length - shown.length)}</p>{/if}
	{:else}
		<p class="msg info">{p.none}</p>
	{/if}

	<details class="ui-card own" open={!!form?.message}>
		<summary><Icon name="plus" size={16} />{p.ownTitle}</summary>
		<p class="muted">{p.ownLead}</p>
		{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
		<form method="POST" action="?/create" use:enhance={creating.submit()}>
			<label class="field wide">
				{p.name}
				<input name="title" required maxlength="120" placeholder={p.nameHint} value={values?.title ?? ''} />
			</label>
			<label class="field">
				{p.year}
				<input name="year" type="number" inputmode="numeric" required min={data.firstYear} max={data.thisYear} value={values?.year ?? ''} />
			</label>
			<label class="field">
				{p.month} <span class="muted">({p.optional})</span>
				<select name="month" value={values?.month ?? ''}>
					<option value="">{p.noMonth}</option>
					{#each months as month, i (i)}<option value={String(i + 1)}>{month}</option>{/each}
				</select>
			</label>
			<label class="field">
				{p.day} <span class="muted">({p.optional})</span>
				<input name="day" type="number" inputmode="numeric" min="1" max="31" value={values?.day ?? ''} />
			</label>
			<div class="wide">
				<button class="btn secondary" disabled={creating.busy}><Icon name="check" size={16} />{p.create}</button>
			</div>
		</form>
	</details>
{/if}

<style>
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--surface);
	}

	.search input {
		flex: 1;
		min-height: var(--tap);
		border: 0;
		background: transparent;
		font: inherit;
		outline: none;
	}

	.choice {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		color: var(--text);
		text-decoration: none;
	}

	.icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: color-mix(in oklab, var(--accent) 12%, var(--surface));
		color: var(--accent);
	}

	.body {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.more {
		margin-top: var(--space-2);
	}

	.own {
		margin-top: var(--space-6);
	}

	.own summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
		cursor: pointer;
	}

	.own form {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.field {
		display: grid;
		gap: var(--space-1);
	}

	.wide {
		grid-column: 1 / -1;
	}

	@media (max-width: 480px) {
		.own form {
			grid-template-columns: 1fr;
		}
	}
</style>

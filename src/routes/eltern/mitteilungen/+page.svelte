<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { formatDay } from '#lib/events/format.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const values = $derived(form && 'values' in form ? form.values : undefined);

	const confirmRemove = (title: string) => (event: MouseEvent) => {
		if (!confirm(t.parents.notices.confirmRemove(title))) event.preventDefault();
	};
</script>

<Title title={t.parents.notices.title} />
<PageHeader title={t.parents.notices.title} lead={t.parents.notices.lead} />

{#if data.state === 'not-set-up'}
	<p class="msg info">{t.parents.notices.notSetUp}</p>
{:else}
	{#if !data.parents}<p class="msg info block">{t.parents.notices.noParents}</p>{/if}

	<section class="ui-card block">
		<form method="POST" action="?/add" use:enhance={saving.submit({ reset: true })}>
			<label class="field">{t.parents.notices.heading}<input name="title" maxlength="120" required autocomplete="off" value={values?.title ?? ''} /></label>
			<label class="field">{t.parents.notices.body}<textarea name="body" rows="5" maxlength="5000" required value={values?.body ?? ''}></textarea></label>
			{#if data.orchestras.length > 1}
				<fieldset>
					<legend class="field">{t.parents.notices.for}</legend>
					<div class="checks">
						{#each data.orchestras as orchestra (orchestra)}
							<label class="check"><input type="checkbox" name="orchestra" value={orchestra} checked={values?.orchestras?.includes(orchestra)} />{orchestra}</label>
						{/each}
					</div>
					<span class="meta">{t.parents.notices.forHint}</span>
				</fieldset>
			{/if}
			{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}
			{#if form?.added}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.parents.notices.added}</p>{/if}
			<div><button class="btn" disabled={saving.busy}><Icon name="bell" size={16} />{t.parents.notices.send}</button></div>
		</form>
	</section>

	{#if !data.notices.length}
		<p class="msg info">{t.parents.notices.empty}</p>
	{:else}
		<ul class="ui-list notices">
			{#each data.notices as notice (notice.id)}
				<li>
					<div class="text">
						<strong>{notice.title}</strong>
						<p class="body">{notice.body}</p>
						<p class="meta">
							{t.parents.notices.by(notice.byName, formatDay(notice.day, config.locale))}
							· {notice.orchestras.length ? t.parents.notices.forSome(notice.orchestras.join(', ')) : t.parents.notices.forAll}
							· {t.parents.notices.reaches(notice.reaches)}
						</p>
					</div>
					<form method="POST" action="?/remove" use:enhance={saving.submit()}>
						<input type="hidden" name="id" value={notice.id} />
						<button class="btn ghost small" disabled={saving.busy} onclick={confirmRemove(notice.title)}><Icon name="trash" size={14} />{t.parents.notices.remove}</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	form {
		display: grid;
		gap: var(--space-4);
	}

	fieldset {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		cursor: pointer;
	}

	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.meta {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.notices li {
		display: flex;
		flex-wrap: wrap;
		align-items: start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.notices form {
		display: block;
	}

	.text {
		display: grid;
		flex: 1;
		gap: var(--space-1);
		min-width: min(100%, 240px);
	}

	.body {
		margin: 0;
		white-space: pre-line;
	}
</style>

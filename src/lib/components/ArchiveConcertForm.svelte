<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { splitList } from '#lib/repertoire/lists.ts';
	import DateField from './DateField.svelte';
	import Icon from './Icon.svelte';
	import PlaceInput from './PlaceInput.svelte';

	/**
	 * Changes a concert of the archive: its row in "Konzerte". Name and day together
	 * make the concert, so a name may repeat on another day; what names it elsewhere follows.
	 */
	let {
		edit,
		result,
		open = $bindable(false)
	}: {
		edit: { values: Record<'title' | 'date' | 'location' | 'orchestra', string>; version: string; orchestras: string[] };
		result?: { archiveError?: string; archiveValues?: Record<'title' | 'date' | 'location' | 'orchestra', string> } | null;
		open?: boolean;
	} = $props();

	const values = $derived(result?.archiveValues ?? edit.values);
	// svelte-ignore state_referenced_locally
	let date = $state(values.date);
	const ticked = $derived(values.orchestra ? splitList(values.orchestra) : []);
	const saving = new FormState();
	$effect(() => {
		if (result?.archiveError) open = true;
	});
</script>

{#if open}
	<section class="ui-card edit" aria-labelledby="archive-edit-title">
		<div class="head">
			<h2 id="archive-edit-title">{t.archive.editConcert}</h2>
			<button type="button" class="close" aria-label={t.nav.close} title={t.nav.close} onclick={() => (open = false)}><Icon name="x" size={18} /></button>
		</div>
		<p class="lead">{t.archive.editConcertLead}</p>
		<form method="POST" action="?/editArchive" use:enhance={saving.submit()}>
			<input type="hidden" name="version" value={edit.version} />
			{#if result?.archiveError}<p class="msg error" role="alert">{result.archiveError}</p>{/if}
			<label class="field">{t.archive.concertTitle}<input name="title" required maxlength="200" value={values.title} autocomplete="off" /></label>
			<DateField name="date" label={t.archive.date} fuzzy bind:value={date} hint={t.archive.dateHint} />
			<label class="field">{t.archive.location}<PlaceInput name="location" value={values.location} /></label>
			{#if edit.orchestras.length}
				<fieldset class="orchestras">
					<legend>{t.archive.orchestra}</legend>
					<span class="checks">
						{#each edit.orchestras as name (name)}
							<label class="check"><input type="checkbox" name="orchestra" value={name} checked={ticked.includes(name)} />{name}</label>
						{/each}
					</span>
				</fieldset>
			{/if}
			<div class="actions">
				<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.archive.save}</button>
				<button class="btn ghost" type="button" onclick={() => (open = false)}>{t.reports.cancel}</button>
			</div>
		</form>
	</section>
{/if}

<style>
	.edit {
		display: grid;
		gap: var(--space-3);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	h2 {
		font-size: var(--text-base);
	}

	.close {
		display: inline-grid;
		place-items: center;
		border: 0;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.lead {
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	form {
		display: grid;
		gap: var(--space-3);
	}

	.orchestras {
		border: 0;
		padding: 0;
		margin: 0;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>

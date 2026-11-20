<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { MAX_FIELD, NOTE_FIELDS } from '#lib/notes/rehearsal-notes.ts';
	import Icon from './Icon.svelte';

	/**
	 * What a rehearsal did, what to practise and what comes next (#145), for those who
	 * missed it. Before a rehearsal, the note of the one before says what to prepare.
	 */

	interface Note {
		done: string;
		practise: string;
		next: string;
		by: string;
		at: string;
	}

	let {
		data,
		result
	}: {
		data: { note: Note | null; canWrite: boolean; previous: { id: string; date: string; note: Note } | null };
		result?: { rehearsalNoteError?: string; rehearsalNoteSaved?: boolean; rehearsalNoteValues?: Record<(typeof NOTE_FIELDS)[number], string> } | null;
	} = $props();

	const saving = new FormState();
	// svelte-ignore state_referenced_locally
	let editing = $state(!!result?.rehearsalNoteError);
	const values = $derived(result?.rehearsalNoteValues ?? data.note ?? { done: '', practise: '', next: '' });
	const hints = { done: t.rehearsalNotes.doneHint, practise: t.rehearsalNotes.practiseHint, next: t.rehearsalNotes.nextHint };
</script>

{#snippet show(note: Note)}
	<dl class="fields">
		{#each NOTE_FIELDS as field (field)}
			{#if note[field]}
				<div class="field-row {field}">
					<dt>{t.rehearsalNotes[field]}</dt>
					<dd>{note[field]}</dd>
				</div>
			{/if}
		{/each}
	</dl>
	{#if note.by || note.at}<p class="by">{t.rehearsalNotes.by(note.by, note.at)}</p>{/if}
{/snippet}

<section class="block rehearsal-note" aria-labelledby="rehearsal-note-title">
	{#if data.previous && !data.note}
		<h2 class="ui-label" id="rehearsal-note-title"><Icon name="note" size={14} />{t.rehearsalNotes.previous(data.previous.date)}</h2>
		<a class="ui-card card link" href="/kalender/{encodeURIComponent(data.previous.id)}">{@render show(data.previous.note)}</a>
	{:else}
		<h2 class="ui-label" id="rehearsal-note-title"><Icon name="note" size={14} />{t.rehearsalNotes.title}</h2>
		{#if result?.rehearsalNoteSaved}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.rehearsalNotes.saved}</p>{/if}
		{#if result?.rehearsalNoteError}<p class="msg error" role="alert">{result.rehearsalNoteError}</p>{/if}
		{#if data.note && !editing}
			<div class="ui-card card">{@render show(data.note)}</div>
		{:else if !editing}
			<p class="placeholder">{t.rehearsalNotes.empty}</p>
		{/if}
		{#if data.canWrite}
			{#if editing}
				<form
					class="ui-card card form"
					method="POST"
					action="?/rehearsalNote"
					use:enhance={saving.submit({ onSuccess: () => (editing = false) })}
				>
					<p class="lead">{t.rehearsalNotes.lead}</p>
					{#each NOTE_FIELDS as field (field)}
						<label class="field">
							{t.rehearsalNotes[field]}
							<textarea name={field} rows="2" maxlength={MAX_FIELD} placeholder={hints[field]}>{values[field]}</textarea>
						</label>
					{/each}
					<div class="buttons">
						<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.rehearsalNotes.save}</button>
						<button type="button" class="btn ghost" onclick={() => (editing = false)}>{t.rehearsalNotes.cancel}</button>
					</div>
				</form>
			{:else}
				<div class="ui-actions">
					<button type="button" onclick={() => (editing = true)}><Icon name="edit" size={16} />{data.note ? t.rehearsalNotes.edit : t.rehearsalNotes.write}</button>
				</div>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.ui-label {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.card {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
		padding: var(--space-4);
	}

	.link:hover {
		background: var(--surface-2);
	}

	.fields {
		display: grid;
		gap: var(--space-3);
		margin: 0;
	}

	.field-row {
		display: grid;
		gap: 2px;
	}

	dt {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	dd {
		margin: 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	/* What to practise is what most people come for. */
	.practise dd {
		font-weight: 650;
	}

	.by,
	.lead {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.form .field {
		margin: 0;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.msg {
		margin-bottom: var(--space-2);
	}

	.placeholder {
		margin-bottom: var(--space-2);
		padding: var(--space-4) var(--space-5);
		border: 1px dashed var(--border);
		border-radius: var(--radius-l);
		color: var(--text-muted);
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { MAX_NOTE } from '#lib/notes/piece-notes.ts';
	import Icon from './Icon.svelte';

	/**
	 * Notes from rehearsals on a piece (#125): cuts, repeats, bowings. Everyone reads them;
	 * those who plan programmes add and delete them. Notes for concerts that are over are
	 * folded away, so they don't confuse the next performance.
	 */

	interface Note {
		id: string;
		text: string;
		section: string;
		concert?: string;
		by: string;
		at: string;
	}

	let {
		notes,
		result
	}: {
		notes: {
			current: Note[];
			earlier: Note[];
			form: { sections: string[]; instruments: string[]; concerts: { value: string; label: string }[] } | null;
		};
		result?: { noteError?: string; noteSaved?: boolean; noteDeleted?: boolean; noteValues?: { text: string; section: string; concert: string } } | null;
	} = $props();

	const saving = new FormState();
	const values = $derived(result?.noteValues);
	// svelte-ignore state_referenced_locally
	let adding = $state(!!result?.noteError && !!result.noteValues);
</script>

{#snippet list(items: Note[])}
	<ul class="notes">
		{#each items as note, i (i)}
			<li class="note">
				<p class="text">{note.text}</p>
				<div class="meta">
					{#if note.section}<span class="tag">{t.pieceNotes.forSection(note.section)}</span>{/if}
					{#if note.concert}<span class="tag concert">{t.pieceNotes.forConcert(note.concert)}</span>{/if}
					<span class="ui-muted">{t.pieceNotes.meta(note.by, note.at)}</span>
					{#if notes.form && note.id}
						<form method="POST" action="?/deleteNote" use:enhance={saving.submit()}>
							<input type="hidden" name="id" value={note.id} />
							<button class="delete" disabled={saving.busy} aria-label={t.pieceNotes.deleteNamed(note.text.slice(0, 40))} title={t.pieceNotes.delete}>
								<Icon name="trash" size={15} />
							</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/snippet}

{#if notes.current.length || notes.earlier.length || notes.form}
	<section class="block piece-notes" aria-labelledby="piece-notes-title">
		<h2 class="ui-label" id="piece-notes-title"><Icon name="note" size={14} />{t.pieceNotes.title}</h2>
		{#if result?.noteError}<p class="msg error" role="alert">{result.noteError}</p>{/if}
		{#if result?.noteSaved}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.pieceNotes.saved}</p>{/if}
		{#if result?.noteDeleted}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.pieceNotes.deleted}</p>{/if}

		{#if notes.current.length}
			{@render list(notes.current)}
		{:else if notes.form}
			<p class="ui-muted none">{t.pieceNotes.none}</p>
		{/if}

		{#if notes.form}
			<details class="add" bind:open={adding}>
				<summary><Icon name="plus" size={16} />{t.pieceNotes.add}</summary>
				<form method="POST" action="?/addNote" use:enhance={saving.submit({ reset: true, onSuccess: () => (adding = false) })}>
					<label class="field wide">
						{t.pieceNotes.text}
						<textarea name="text" rows="2" required maxlength={MAX_NOTE} placeholder={t.pieceNotes.textHint}>{values?.text ?? ''}</textarea>
					</label>
					<label class="field">
						{t.pieceNotes.section}
						<select name="section" value={values?.section ?? ''}>
							<option value="">{t.pieceNotes.everyone}</option>
							<optgroup label={t.pieceNotes.sections}>
								{#each notes.form.sections as section (section)}<option value={section}>{section}</option>{/each}
							</optgroup>
							<optgroup label={t.pieceNotes.instruments}>
								{#each notes.form.instruments as instrument (instrument)}<option value={instrument}>{instrument}</option>{/each}
							</optgroup>
						</select>
					</label>
					<label class="field">
						{t.pieceNotes.concert}
						<select name="concert" value={values?.concert ?? ''}>
							<option value="">{t.pieceNotes.always}</option>
							{#each notes.form.concerts as concert (concert.value)}<option value={concert.value}>{concert.label}</option>{/each}
						</select>
					</label>
					<div class="wide">
						<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.pieceNotes.save}</button>
					</div>
				</form>
			</details>
		{/if}

		{#if notes.earlier.length}
			<details class="ui-disclosure earlier">
				<summary>{t.pieceNotes.earlier} <span class="ui-muted">{notes.earlier.length}</span></summary>
				{@render list(notes.earlier)}
			</details>
		{/if}
	</section>
{/if}

<style>
	.block {
		margin-bottom: var(--space-6);
	}

	.msg {
		margin-bottom: var(--space-2);
	}

	.ui-label {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.notes {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.note {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.text {
		margin: 0;
		font-weight: 600;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
	}

	.tag {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.tag.concert {
		background: var(--surface-2);
		color: var(--text);
	}

	.none {
		margin: 0 0 var(--space-2) var(--space-1);
	}

	.meta form {
		margin-left: auto;
	}

	.delete {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--radius-s);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.delete:hover,
	.delete:focus-visible {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.add {
		margin-top: var(--space-3);
	}

	.add summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 36px;
		color: var(--accent);
		font-size: var(--text-md);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.add summary::-webkit-details-marker {
		display: none;
	}

	.add form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
		gap: var(--space-3);
		margin-top: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.add .field {
		margin: 0;
	}

	.earlier {
		margin-top: var(--space-3);
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from './Icon.svelte';

	/**
	 * A collapsed form for "archiv.bearbeiten": a piece without sheet music, or (where the app
	 * may write to Drive) one with its folder made right away, on to the uploads. Past concerts
	 * are entered with the dates on /kalender.
	 */
	let {
		result,
		withMusic: canAddMusic = false
	}: { result?: { archiveError?: string; values?: Record<string, string>; withFolder?: boolean } | null; withMusic?: boolean } = $props();

	// Opens again after a refused entry, with what was typed.
	let open = $state<'plain' | 'music' | null>(null);
	const mode = $derived(open ?? (result?.archiveError ? (result.withFolder ? 'music' : 'plain') : null));
	const music = $derived(mode === 'music' && canAddMusic);
	const values = $derived(result?.values ?? {});
	const saving = new FormState();
</script>

<section class="add">
	{#if mode}
		<form
			method="POST"
			action="?/addPiece"
			use:enhance={saving.submit()}
		>
			<h2>{music ? t.archive.addWithMusic : t.archive.addPiece}</h2>
			<p class="lead">{music ? t.archive.addWithMusicLead : t.archive.addPieceLead}</p>
			{#if music}<input type="hidden" name="withFolder" value="1" />{/if}
			{#if result?.archiveError}<p class="msg error" role="alert">{result.archiveError}</p>{/if}
			<label class="field">
				{t.archive.pieceTitle}
				<input name="title" required maxlength="200" value={values.title ?? ''} autocomplete="off" />
			</label>
			<label class="field">{t.archive.composer}<input name="composer" maxlength="200" value={values.composer ?? ''} autocomplete="off" /></label>
			<label class="field">{t.archive.catalogue}<input name="catalogue" maxlength="200" value={values.catalogue ?? ''} autocomplete="off" /></label>
			<div class="actions">
				<button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{music ? t.archive.addWithMusicSave : t.archive.add}</button>
				<button class="btn ghost" type="button" onclick={() => (open = null)}>{t.reports.cancel}</button>
			</div>
		</form>
	{:else}
		<div class="choices">
			{#if canAddMusic}
				<button class="btn ghost" onclick={() => (open = 'music')}>
					<Icon name="plus" size={16} />{t.archive.addWithMusic}
				</button>
			{/if}
			<button class="btn ghost" onclick={() => (open = 'plain')}>
				<Icon name="plus" size={16} />{t.archive.addPiece}
			</button>
		</div>
	{/if}
</section>

<style>
	.add {
		margin-top: var(--space-6);
	}

	form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	h2,
	.lead,
	.msg,
	.actions {
		grid-column: 1 / -1;
	}

	h2 {
		font-size: var(--text-base);
	}

	.lead {
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	.actions,
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>

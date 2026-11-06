<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { guardUnsaved } from '#lib/unsaved.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { config } from '#lib/config/index.ts';
	import { eventDay } from '#lib/repertoire/dates.ts';
	import { cleanLink } from '#lib/links.ts';
	import { listCompletions } from '#lib/repertoire/lists.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InstrumentationField from '#lib/components/InstrumentationField.svelte';
	import PieceSuggestions from '#lib/components/PieceSuggestions.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	// After a refused save, the form keeps what was typed.
	const values = $derived(form?.values ?? (data.state === 'ready' ? data.values : undefined));
	// The form's own copy, so a suggestion can be taken over before saving.
	let current = $state<Record<string, string>>({});
	$effect.pre(() => {
		current = { ...(values ?? {}) };
	});
	const apply = (field: string, value: string) => (current[field] = value);
	guardUnsaved(() => !saving.busy && !!values && Object.keys(current).some((key) => (current[key] ?? '') !== (values[key as keyof typeof values] ?? '')));
	/** Today in the orchestra's time zone, as the sheet writes dates: "2026-10-21". */
	const today = () => eventDay({ start: new Date().toISOString(), allDay: false }, config.timeZone);

	const columns = t.sheet.pieces.columns;
	const FIELDS = [
		{ name: 'title', wide: true, required: true },
		{ name: 'composer', list: 'composers', placeholder: t.pieceEditor.composerHint },
		{ name: 'composerFull', placeholder: t.pieceEditor.composerFullHint },
		{ name: 'catalogue' },
		{ name: 'arranger', list: 'arrangers', placeholder: t.pieceEditor.listHint },
		{ name: 'genre', list: 'genres', placeholder: t.pieceEditor.listHint },
		{ name: 'difficulty' },
		{ name: 'duration', placeholder: t.pieceEditor.durationHint },
		{ name: 'publisher', list: 'publishers', placeholder: t.pieceEditor.publisherHint },
		{ name: 'reviewedAt', placeholder: t.pieceEditor.reviewedHint },
		{ name: 'instrumentation', wide: true },
		// Text, not url: "keins" says there is none.
		{ name: 'recording', wide: true, inputmode: 'url', placeholder: t.pieceEditor.recordingHint }
	] as const;
	// Fields for columns the sheet doesn't have yet stay hidden until setup adds them.
	const fields = $derived(FIELDS.filter((field) => data.state !== 'ready' || !(data.missing as string[]).includes(field.name)));
	const missingNames = $derived(data.state === 'ready' ? data.missing.map((column) => columns[column]).join(', ') : '');
</script>

<Title title={t.pieceEditor.title(data.piece.title)} />

<Crumbs
	items={[
		{ href: '/stuecke', label: t.pieces.title },
		{ href: `/stuecke/${encodeURIComponent(data.piece.id)}`, label: data.piece.title }
	]}
/>
<h1>{t.pieceEditor.title(data.piece.title)}</h1>

{#if data.state === 'not-in-sheet' || !values}
	<p class="msg info">{t.pieceEditor.notInSheet}</p>
{:else}
	<p class="lead">{t.pieceEditor.lead}</p>
	{#if data.piece.folderName}<p class="folder"><Icon name="folder" size={14} />{data.piece.folderName}</p>{/if}
	{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}

	{#if data.list}
		<p class="msg info">{t.details.working(t.details.filters[data.list.filter], data.list.open)}</p>
	{/if}

	<div class="layout">
	<form
		method="POST"
		use:enhance={saving.submit()}
	>
		<input type="hidden" name="version" value={data.version} />
		{#each fields as field (field.name)}
			{#if field.name === 'instrumentation'}
				<!-- The instrument picker, as on the profile; the sheet keeps it as text (#249). -->
				<div class="field wide">
					<InstrumentationField name="instrumentation" label={columns.instrumentation} bind:value={current.instrumentation} instruments={data.instruments} />
				</div>
			{:else}
			<label class="field" class:wide={'wide' in field}>
				{columns[field.name]}
				<span class="input">
					<input
						name={field.name}
						type="text"
						inputmode={'inputmode' in field ? field.inputmode : undefined}
						bind:value={current[field.name]}
						list={'list' in field ? `${field.list}-list` : undefined}
						required={'required' in field}
						placeholder={'placeholder' in field ? field.placeholder : undefined}
						maxlength="1000"
						autocomplete="off"
						onblur={field.name === 'recording' ? () => (current.recording = cleanLink(current.recording ?? '') ?? current.recording) : undefined}
					/>
					{#if field.name === 'reviewedAt'}
						<button class="btn ghost small" type="button" onclick={() => (current.reviewedAt = today())}>{t.pieceEditor.today}</button>
					{:else if field.name === 'recording'}
						<button class="btn ghost small" type="button" title={t.pieceEditor.noRecordingHint} onclick={() => (current.recording = t.sheetValues.noRecording)}>
							{t.pieceEditor.noRecording}
						</button>
					{/if}
				</span>
			</label>
			{/if}
		{/each}
		<label class="field wide">
			{columns.notes}
			<textarea name="notes" maxlength="1000" bind:value={current.notes}></textarea>
		</label>
		{#if missingNames}<p class="hint wide">{t.pieceEditor.missingColumns(missingNames)}</p>{/if}
		<div class="actions">
			{#if data.list}
				<button class="btn" name="liste" value={data.list.filter} disabled={saving.busy}><Icon name="check" size={16} />{t.details.saveNext}</button>
				<a class="btn ghost" href="/stuecke/angaben?filter={data.list.filter}">{t.details.backToList}</a>
			{:else}
				<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{t.pieceEditor.save}</button>
				<a class="btn ghost" href="/stuecke/{encodeURIComponent(data.piece.id)}">{t.pieceEditor.cancel}</a>
			{/if}
		</div>
		<!-- Several names, separated by commas: picking one adds it after those already typed. -->
		{#each fields as field (field.name)}
			{#if 'list' in field && data.state === 'ready'}
				<datalist id="{field.list}-list">
					{#each listCompletions(current[field.name] ?? '', data[field.list]) as option (option)}<option value={option}></option>{/each}
				</datalist>
			{/if}
		{/each}
	</form>

	<PieceSuggestions
		values={current}
		{apply}
		files={data.files}
		canRead={data.canRead}
		videoLength={data.videoLength}
		genres={data.genres}
		knownComposers={data.composers}
		naming={config.naming}
		category={data.piece.category}
	/>
	</div>
{/if}

<style>

	h1 {
		margin-bottom: var(--space-2);
	}

	.lead {
		margin-bottom: var(--space-2);
		color: var(--text-muted);
	}

	.folder {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.msg {
		margin-bottom: var(--space-4);
	}

	form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--surface);
	}

	.wide,
	.actions {
		grid-column: 1 / -1;
	}

	.layout {
		display: grid;
		gap: var(--space-4);
		align-items: start;
	}

	@media (min-width: 1000px) {
		.layout {
			grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
		}

		form {
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		}
	}

	.input {
		display: flex;
		gap: var(--space-2);
	}

	.input input {
		flex: 1;
		min-width: 0;
	}

	.input .btn {
		flex: none;
		align-self: center;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>

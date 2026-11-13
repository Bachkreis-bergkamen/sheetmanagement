<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { CHOSEN_LISTS, DEFAULT_LISTS, QUESTION_TYPES } from '#lib/trips/lists.ts';
	import { TRIP_KINDS, type Trip } from '#lib/trips/trips.ts';
	import Icon from './Icon.svelte';

	/** A trip's details (#334): new on /fahrten, edited on the trip's page. */
	let {
		trip,
		orchestras,
		action,
		submit,
		error
	}: {
		trip?: Pick<Trip, 'title' | 'kind' | 'firstDay' | 'lastDay' | 'orchestras' | 'organisers' | 'stops' | 'note' | 'signupUntil' | 'cap' | 'lists' | 'questions' | 'pictureSearch' | 'noPicture'>;
		orchestras: string[];
		action: string;
		submit: string;
		error?: string;
	} = $props();

	const saving = new FormState();
	let next = 0;
	// The places, edited here until saved: the trip's as they were when the form opened, or one empty row.
	let stops = $state(untrack(() => (trip?.stops.length ? trip.stops : [{ place: '', from: '', until: '' }]).map((stop) => ({ ...stop, key: next++ }))));
	// The trip's own questions, the same way; a new row has no id until it's saved.
	let questions = $state(untrack(() => (trip?.questions ?? []).map((question) => ({ ...question, optionsText: question.options.join(', '), key: next++ }))));
	const lists = $derived(trip?.lists ?? DEFAULT_LISTS);
</script>

<form method="POST" {action} use:enhance={saving.submit()}>
	<div class="row">
		<label class="field grow">
			{t.trips.fields.title}
			<input name="title" required maxlength="120" placeholder={t.trips.fields.titleHint} value={trip?.title ?? ''} autocomplete="off" />
		</label>
		<label class="field">
			{t.trips.fields.kind}
			<select name="kind">
				{#each TRIP_KINDS as kind (kind)}
					<option value={kind} selected={trip?.kind === kind}>{t.trips.kinds[kind]}</option>
				{/each}
			</select>
		</label>
	</div>
	<div class="row">
		<label class="field">{t.trips.fields.firstDay}<input type="date" name="firstDay" required value={trip?.firstDay ?? ''} /></label>
		<label class="field">{t.trips.fields.lastDay}<input type="date" name="lastDay" required value={trip?.lastDay ?? ''} /></label>
	</div>

	{#if orchestras.length > 1}
		<fieldset class="chips">
			<legend>{t.trips.fields.orchestras}</legend>
			<p class="hint">{t.trips.fields.orchestrasHint}</p>
			{#each orchestras as name (name)}
				<label class="chip"><input type="checkbox" name="orchestra" value={name} checked={trip?.orchestras.includes(name)} /><span>{name}</span></label>
			{/each}
		</fieldset>
	{/if}

	<fieldset class="stops">
		<legend>{t.trips.fields.stops}</legend>
		<p class="hint">{t.trips.fields.stopsHint}</p>
		{#each stops as stop, i (stop.key)}
			<div class="stop">
				<label class="field"><span class:sr-only={i > 0}>{t.trips.fields.stopPlace}</span><input name="stopPlace" maxlength="200" value={stop.place} /></label>
				<label class="field"><span class:sr-only={i > 0}>{t.trips.fields.stopFrom}</span><input type="date" name="stopFrom" value={stop.from} /></label>
				<label class="field"><span class:sr-only={i > 0}>{t.trips.fields.stopUntil}</span><input type="date" name="stopUntil" value={stop.until} /></label>
				{#if stops.length > 1}
					<button type="button" class="remove" aria-label={t.trips.fields.removeStop} title={t.trips.fields.removeStop} onclick={() => stops.splice(i, 1)}>
						<Icon name="x" size={16} />
					</button>
				{/if}
			</div>
		{/each}
		<button type="button" class="add" onclick={() => stops.push({ place: '', from: '', until: '', key: next++ })}><Icon name="plus" size={16} />{t.trips.fields.addStop}</button>
	</fieldset>

	<div class="row">
		<label class="field">{t.trips.fields.signupUntil}<input type="date" name="signupUntil" value={trip?.signupUntil ?? ''} /></label>
		<label class="field">
			{t.trips.fields.cap}
			<input type="number" name="cap" min="1" max="10000" inputmode="numeric" value={trip?.cap ?? ''} aria-describedby="cap-hint" />
		</label>
	</div>
	<p class="hint" id="cap-hint">{t.trips.fields.capHint}</p>
	<label class="field">
		{t.trips.fields.organisers}
		<input name="organisers" value={trip?.organisers.join(', ') ?? ''} autocomplete="off" aria-describedby="organisers-hint" />
	</label>
	<p class="hint" id="organisers-hint">{t.trips.fields.organisersHint}</p>
	<label class="field">{t.trips.fields.note}<textarea name="note" maxlength="2000" rows="3">{trip?.note ?? ''}</textarea></label>

	<fieldset class="chips">
		<legend>{t.trips.fields.lists}</legend>
		<p class="hint">{t.trips.fields.listsHint}</p>
		{#each CHOSEN_LISTS as kind (kind)}
			<label class="chip"><input type="checkbox" name="list" value={kind} checked={lists.includes(kind)} /><span>{t.trips.lists.kinds[kind]}</span></label>
		{/each}
	</fieldset>

	<fieldset class="stops">
		<legend>{t.trips.fields.questions}</legend>
		<p class="hint">{t.trips.fields.questionsHint}</p>
		{#each questions as question, i (question.key)}
			<div class="question">
				<input type="hidden" name="questionId" value={question.id ?? ''} />
				<label class="field text"><span class:sr-only={i > 0}>{t.trips.fields.questionText}</span><input name="questionText" maxlength="500" bind:value={question.text} /></label>
				<label class="field">
					<span class:sr-only={i > 0}>{t.trips.fields.questionType}</span>
					<select name="questionType" bind:value={question.type}>
						{#each QUESTION_TYPES as type (type)}<option value={type}>{t.trips.fields.questionTypes[type]}</option>{/each}
					</select>
				</label>
				<label class="field options" class:hidden={question.type !== 'auswahl'}>
					<span class:sr-only={i > 0}>{t.trips.fields.questionOptions}</span>
					<input name="questionOptions" maxlength="500" placeholder={t.trips.fields.questionOptionsHint} bind:value={question.optionsText} />
				</label>
				<button type="button" class="remove" aria-label={t.trips.fields.removeQuestion} title={t.trips.fields.removeQuestion} onclick={() => questions.splice(i, 1)}>
					<Icon name="x" size={16} />
				</button>
			</div>
		{/each}
		<button type="button" class="add" onclick={() => questions.push({ id: '', text: '', type: 'text', options: [], optionsText: '', key: next++ })}><Icon name="plus" size={16} />{t.trips.fields.addQuestion}</button>
	</fieldset>

	<fieldset class="stops">
		<legend>{t.trips.fields.picture}</legend>
		<p class="hint">{t.trips.fields.pictureHint}</p>
		<div class="row">
			<label class="field">{t.trips.fields.pictureSearch}<input name="pictureSearch" maxlength="200" value={trip?.pictureSearch ?? ''} autocomplete="off" /></label>
		</div>
		<label class="inline"><input type="checkbox" name="noPicture" checked={trip?.noPicture} />{t.trips.fields.noPicture}</label>
	</fieldset>
	{#if error}<p class="msg error" role="alert">{error}</p>{/if}
	<div>
		<button class="btn" disabled={saving.busy}><Icon name="suitcase" size={16} />{submit}</button>
	</div>
</form>

<style>
	form {
		display: grid;
		gap: var(--space-4);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.row .field {
		flex: 1 1 160px;
	}

	.row .grow {
		flex: 3 1 240px;
	}

	fieldset {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.hint {
		margin: calc(-1 * var(--space-2)) 0 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	fieldset .hint {
		margin: 0 0 var(--space-1);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chips legend,
	.chips .hint {
		width: 100%;
	}

	.chip {
		position: relative;
		cursor: pointer;
	}

	.chip input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.chip span {
		display: inline-flex;
		align-items: center;
		height: 36px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.chip input:checked + span {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.chip input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.stop {
		display: grid;
		grid-template-columns: minmax(160px, 3fr) minmax(140px, 2fr) minmax(140px, 2fr) 40px;
		align-items: end;
		gap: var(--space-2);
	}

	.remove,
	.add {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		cursor: pointer;
	}

	.remove {
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-control);
	}

	.remove:hover {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.add {
		justify-self: start;
		padding: var(--space-1) 0;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.question {
		display: grid;
		grid-template-columns: minmax(180px, 4fr) minmax(120px, 2fr) minmax(140px, 3fr) 40px;
		align-items: end;
		gap: var(--space-2);
	}

	/* Kept in the form, so the rows line up, but only shown for a choice. */
	.question .hidden {
		visibility: hidden;
	}

	.inline {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.inline input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	/* On a phone: the place on its own line, the days and the remove button below. */
	@media (max-width: 720px) {
		.stop {
			grid-template-columns: 1fr 1fr 40px;
			padding-bottom: var(--space-2);
			border-bottom: 1px solid var(--hairline);
		}

		.stop .field:first-child {
			grid-column: 1 / -1;
		}

		.question {
			grid-template-columns: 1fr 40px;
			padding-bottom: var(--space-2);
			border-bottom: 1px solid var(--hairline);
		}

		.question .text {
			grid-column: 1 / -1;
		}

		.question .options {
			grid-column: 1 / -1;
			grid-row: 3;
		}

		.question .hidden {
			display: none;
		}

		.question .field :global(.sr-only) {
			position: static;
			width: auto;
			height: auto;
			margin: 0;
			clip-path: none;
		}

		.stop .field :global(.sr-only) {
			position: static;
			width: auto;
			height: auto;
			margin: 0;
			clip-path: none;
		}
	}
</style>

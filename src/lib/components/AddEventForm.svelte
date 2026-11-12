<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { NEW_EVENT_TYPES, type NewEventType } from '#lib/events/new-event.ts';
	import { splitList } from '#lib/repertoire/lists.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import DateField from './DateField.svelte';
	import Icon from './Icon.svelte';
	import PlaceInput from './PlaceInput.svelte';
	import Segmented from './Segmented.svelte';

	/**
	 * A concert or rehearsal straight into the Google Calendar, for those who plan dates
	 * ("termine.planen"); a concert that's already over goes into the archive, the sheet, for
	 * those who keep it ("archiv.bearbeiten"). While the app may only read the calendar, it says
	 * what to set up. With `editing`, the same form changes a date that's already in the calendar,
	 * filled in from it, on that date's page.
	 */
	let {
		calendar,
		archive,
		writable,
		orchestras,
		concerts,
		today,
		last,
		open = $bindable(false),
		result,
		preset = {},
		editing = false,
		onsaved
	}: {
		/** May add to the calendar ("termine.planen"). */
		calendar: boolean;
		/** May add past concerts to the archive ("archiv.bearbeiten"). */
		archive: boolean;
		writable: boolean;
		orchestras: string[];
		concerts: { id: string; title: string; date: string }[];
		today: string;
		/** The last day the site shows from the calendar. */
		last: string;
		open?: boolean;
		result?: { eventError?: string; eventValues?: Record<string, string>; eventAdded?: { id: string; title: string } } | null;
		/** Filled in from a link, e.g. a rehearsal for one concert; or the date being changed. */
		preset?: Record<string, string | undefined>;
		/** Changes the date filled in from `preset` (the event's page) instead of adding one. */
		editing?: boolean;
		/** After a change was saved. */
		onsaved?: () => void;
	} = $props();

	const saving = new FormState();
	const submit = $derived(editing ? saving.submit({ onSuccess: () => onsaved?.() }) : saving.submit({ reset: true }));
	const values = $derived<Record<string, string | undefined>>(result?.eventValues ?? preset);
	// svelte-ignore state_referenced_locally
	let type = $state<NewEventType>(calendar ? (NEW_EVENT_TYPES.find((value) => value === values.type) ?? 'probe') : 'konzert');
	// svelte-ignore state_referenced_locally
	let date = $state(values.date ?? '');
	$effect(() => {
		date = values.date ?? '';
	});
	/** A concert that's over: into the archive, not the calendar. "1957" or "1957-12" is over too. */
	const past = $derived(!editing && archive && type === 'konzert' && !!date && date < today.slice(0, date.length));
	const word = (type: NewEventType) => {
		const first = config.events[type][0] ?? type;
		return first.charAt(0).toUpperCase() + first.slice(1);
	};
	// Without the calendar, only past concerts can be entered.
	// A concert stays a concert when changed, a rehearsal may become the Generalprobe.
	const types = $derived(
		(editing
			? NEW_EVENT_TYPES.filter((value) => (value === 'konzert') === (values.type === 'konzert'))
			: calendar
				? NEW_EVENT_TYPES
				: (['konzert'] as const)
		).map((value) => ({ value, label: t.concerts.types[value] }))
	);
	// A refused entry opens again, with what was typed.
	$effect(() => {
		if (result?.eventError) open = true;
	});
</script>

{#if open}
<section class="ui-card add" aria-labelledby="add-event-title">
	<div class="head">
		<h2 id="add-event-title">{editing ? t.calendar.edit.title : t.calendar.add.open}</h2>
		<button type="button" class="close" aria-label={t.nav.close} title={t.nav.close} onclick={() => (open = false)}><Icon name="x" size={18} /></button>
	</div>
	<form method="POST" action={editing ? '?/editEvent' : '?/addEvent'} use:enhance={submit}>
		{#if types.length > 1}
			<div class="type">
				<Segmented options={types} bind:value={type} label={t.calendar.add.type} />
			</div>
		{/if}
		<input type="hidden" name="type" value={type} />
		<label class="field">
			{t.calendar.add.title}
			<input
				name="title"
				maxlength="120"
				required={type === 'konzert'}
				value={values.title ?? ''}
				placeholder={type === 'konzert' ? t.calendar.add.concertHint : t.calendar.add.untitled(word(type))}
				autocomplete="off"
			/>
		</label>
		<div class="when" class:only-date={past}>
			<!-- Old concerts are often known only by month or year: those go into the archive as they are. -->
			<div class="date"><DateField name="date" label={t.calendar.add.date} required bind:value={date} fuzzy={!editing && archive && type === 'konzert'} max={calendar || editing ? last : today} /></div>
			{#if !past}
				<label class="field">{t.calendar.add.start}<input type="time" name="start" step="900" value={values.start ?? ''} /></label>
				<label class="field">{t.calendar.add.end}<input type="time" name="end" step="900" value={values.end ?? ''} /></label>
			{/if}
		</div>
		{#if past}
			<label class="check"><input type="checkbox" name="yearOnly" checked={!!values.yearOnly} />{t.calendar.add.yearOnly}</label>
		{:else}
			<p class="hint">{t.calendar.add.timeHint}</p>
		{/if}
		<label class="field">
			{t.calendar.add.location}
			<PlaceInput name="location" value={values.location ?? ''} placeholder={t.calendar.add.locationHint} />
		</label>
		<!-- A past concert's orchestras go into the archive, a rehearsal's into its title ("Probe A"). -->
		{#if (past && orchestras.length) || (type !== 'konzert' && orchestras.length > 1)}
			<!-- Playing together is the usual case: all ticked to start with, any of them alone or together. -->
			{@const ticked = values.orchestra ? splitList(values.orchestra) : orchestras}
			<fieldset class="orchestras">
				<legend>{t.archive.orchestra}</legend>
				<span class="checks">
					{#each orchestras as name (name)}
						<label class="check"><input type="checkbox" name="orchestra" value={name} checked={ticked.includes(name)} />{name}</label>
					{/each}
				</span>
			</fieldset>
		{/if}
		{#if type !== 'konzert' && concerts.length}
			<label class="field">
				{t.calendar.add.concert}
				<select name="concert" value={values.concert ?? concerts[0].id}>
					{#each concerts as concert (concert.id)}<option value={concert.id}>{concert.title} · {concert.date}</option>{/each}
					<option value="">{t.calendar.add.noConcert}</option>
				</select>
			</label>
		{/if}
		{#if !past}
			<!-- Rarely needed, so folded away; the archive keeps neither. -->
			<details class="more" open={!!(values.description || values.tentative)}>
				<summary><Icon name="chevron" size={14} />{t.calendar.add.more}</summary>
				<label class="field">{t.calendar.add.description}<textarea name="description" maxlength="2000" rows="2">{values.description ?? ''}</textarea></label>
				<label class="check"><input type="checkbox" name="tentative" checked={!!values.tentative} />{t.calendar.add.tentative}</label>
			</details>
			{#if !writable}<p class="msg info">{t.calendar.add.readOnly}</p>{/if}
		{/if}
		{#if result?.eventError}<p class="msg error" role="alert">{result.eventError}</p>{/if}
		{#if result?.eventAdded}
			<p class="msg ok added" role="status">
				<Icon name="check" size={16} /><span>{t.calendar.add.added(result.eventAdded.title)}</span>
				<a href="/kalender/{encodeURIComponent(result.eventAdded.id)}">{t.calendar.add.show}</a>
			</p>
		{/if}
		<div>
			{#if editing}
				<button class="btn" disabled={saving.busy || !writable}><Icon name="check" size={16} />{t.calendar.edit.save}</button>
			{:else if past}
				<button class="btn" disabled={saving.busy}><Icon name="history" size={16} />{t.calendar.add.saveArchive}</button>
			{:else}
				<button class="btn" disabled={saving.busy || !writable}><Icon name="calendar" size={16} />{t.calendar.add.save}</button>
			{/if}
		</div>
		<p class="hint">{editing ? t.calendar.edit.lead : past ? t.calendar.add.leadArchive : calendar ? t.calendar.add.lead : t.calendar.add.archiveOnly}</p>
	</form>
</section>
{/if}

<style>
	.add {
		padding: var(--space-4);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.head h2 {
		font-size: var(--text-lg);
	}

	.close {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.close:hover {
		background: var(--surface-2);
		color: var(--text);
	}

	form {
		display: grid;
		gap: var(--space-3);
	}

	.hint {
		margin-top: calc(-1 * var(--space-2));
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.type :global(.segmented) {
		width: 100%;
	}

	.more {
		display: grid;
		gap: var(--space-3);
	}

	.more[open] {
		gap: var(--space-3);
	}

	.more summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}

	.more summary::-webkit-details-marker {
		display: none;
	}

	.more summary :global(svg) {
		transition: transform var(--fast) var(--ease);
	}

	.more[open] summary {
		margin-bottom: var(--space-3);
	}

	.more[open] summary :global(svg) {
		transform: rotate(90deg);
	}

	.more .check {
		margin-top: var(--space-3);
	}

	.when {
		display: grid;
		grid-template-columns: minmax(150px, 2fr) minmax(96px, 1fr) minmax(96px, 1fr);
		gap: var(--space-2);
	}

	.when.only-date {
		grid-template-columns: 1fr;
	}

	.added span {
		flex: 1;
	}

	.added a {
		color: var(--accent);
		font-weight: 650;
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-md);
	}

	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.orchestras {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.orchestras legend {
		padding: 0 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.checks .check {
		min-height: 36px;
		cursor: pointer;
	}

	@media (max-width: 560px) {
		.when {
			grid-template-columns: 1fr 1fr;
		}

		.when .date {
			grid-column: 1 / -1;
		}
	}
</style>

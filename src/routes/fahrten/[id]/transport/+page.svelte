<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { pickupsText, type Vehicle } from '#lib/trips/organising.ts';
	import AssignBoard, { warningText } from '#lib/components/AssignBoard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const tr = t.trips.organising.transport;

	const units = $derived(
		data.vehicles.map(({ unit, people, warnings, instruments }) => ({
			id: unit.id,
			title: unit.name,
			sub: [tr.kinds[unit.kind], unit.seats ? tr.seats(unit.seats) : '', unit.legs.length === 2 ? `${tr.legs.hin} + ${tr.legs.rueck}` : ''].filter(Boolean).join(' · '),
			icon: 'bus' as const,
			places: unit.seats,
			people,
			warnings: warnings.map(warningText),
			details: [
				...(unit.driver ? [`${tr.driver}: ${unit.driver}`] : []),
				...(unit.pickups.length ? [pickupsText(unit.pickups)] : []),
				...(instruments.length ? [`${tr.bulky}: ${instruments.join(', ')}`] : []),
				...(unit.note ? [unit.note] : [])
			]
		}))
	);
	// Saving stays on the way being shown.
	const keep = $derived(`&weg=${data.leg}`);
	const vehicleOf = (id: string) => data.vehicles.find((one) => one.unit.id === id)?.unit;
</script>

<Title title={tr.pageTitle(data.trip.title)} />

<a class="back no-print" href="/fahrten/{data.trip.id}"><Icon name="back" size={16} />{data.trip.title}</a>

<header class="head">
	<h1>{tr.title}</h1>
	<p class="lead">{tr.lead}</p>
	{#if !data.organises}<p class="muted">{t.trips.organising.board.readOnly}</p>{/if}
</header>

<div class="toolbar no-print">
	<nav class="views" aria-label={tr.title}>
		{#each data.legs as leg (leg)}
			<a href="?weg={leg}" aria-current={data.leg === leg ? 'page' : undefined}>{tr.legs[leg]}</a>
		{/each}
	</nav>
	<button type="button" class="btn secondary small" onclick={() => window.print()}><Icon name="print" size={16} />{t.trips.days.print}</button>
</div>

{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}

{#snippet vehicleForm(vehicle?: Vehicle)}
	<form method="POST" action="?/save{keep}" class="unit-form" use:enhance={saving.submit({ reset: !vehicle })}>
		{#if vehicle}<input type="hidden" name="id" value={vehicle.id} />{/if}
		<div class="row">
			<label class="field grow">{tr.fields.name}<input name="name" required maxlength="80" value={vehicle?.name ?? ''} placeholder={tr.fields.nameHint} /></label>
			<label class="field">
				{tr.fields.kind}
				<select name="kind">
					{#each data.kinds as kind (kind)}<option value={kind} selected={(vehicle?.kind ?? 'bus') === kind}>{tr.kinds[kind]}</option>{/each}
				</select>
			</label>
			<label class="field seats">{tr.fields.seats}<input name="seats" type="number" min="1" max="500" value={vehicle?.seats ?? ''} placeholder={tr.fields.seatsHint} /></label>
		</div>
		<fieldset class="legs">
			<legend>{tr.fields.legs}</legend>
			{#each data.legs as leg (leg)}
				<label class="check"><input type="checkbox" name="leg" value={leg} checked={vehicle ? vehicle.legs.includes(leg) : true} />{tr.legs[leg]}</label>
			{/each}
		</fieldset>
		<label class="field">{tr.fields.driver}<input name="driver" maxlength="80" value={vehicle?.driver ?? ''} /></label>
		<label class="field">{tr.fields.pickups}<textarea name="pickups" rows="3" placeholder={tr.fields.pickupsHint}>{vehicle ? pickupsText(vehicle.pickups) : ''}</textarea></label>
		<label class="field">{tr.fields.note}<textarea name="note" rows="2" maxlength="500">{vehicle?.note ?? ''}</textarea></label>
		<div><button class="btn small" disabled={saving.busy}>{t.trips.days.save}</button></div>
	</form>
{/snippet}

{#snippet tools(id: string)}
	{@const vehicle = vehicleOf(id)}
	{#if data.organises && vehicle && data.unplaced.length}
		<form method="POST" action="?/everyone{keep}" class="no-print" use:enhance={saving.submit()}>
			<input type="hidden" name="unit" value={id} />
			<input type="hidden" name="leg" value={data.leg} />
			<button class="btn secondary small" disabled={saving.busy}><Icon name="users" size={14} />{tr.everyone(data.unplaced.length)}</button>
		</form>
	{/if}
	{#if data.organises && vehicle}
		<details class="edit no-print">
			<summary><Icon name="edit" size={14} />{t.trips.days.edit}</summary>
			{@render vehicleForm(vehicle)}
			<form method="POST" action="?/remove{keep}" use:enhance={saving.submit()}>
				<input type="hidden" name="id" value={id} />
				<button class="btn ghost small remove" disabled={saving.busy}><Icon name="trash" size={14} />{t.trips.days.remove}</button>
			</form>
		</details>
	{/if}
{/snippet}

{#if data.vehicles.length}
	<AssignBoard {units} unplaced={data.unplaced} edits={data.organises} hidden={{ leg: data.leg }} search={keep} {tools} />
{:else}
	<p class="ui-card empty muted">{tr.none}</p>
{/if}
{#if data.elsewhere}<p class="muted elsewhere">{tr.elsewhere(data.elsewhere)}</p>{/if}

{#if data.bulky.length}
	<section class="ui-card bulky">
		<h2><Icon name="music" size={18} />{tr.bulky}</h2>
		<p class="muted">{tr.bulkyLead}</p>
		<ul>
			{#each data.bulky as row, i (i)}<li><strong>{row.name}</strong> · {row.person}</li>{/each}
		</ul>
	</section>
{/if}

{#if data.organises}
	<details class="add ui-card no-print" open={!data.vehicles.length && !data.elsewhere}>
		<summary><Icon name="plus" size={16} />{tr.add}</summary>
		{@render vehicleForm()}
	</details>
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 32px;
		margin-bottom: var(--space-2);
		color: var(--accent);
		font-weight: 600;
	}

	.head {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}

	.lead {
		max-width: 62ch;
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	/* There or back: the segmented control the plan uses too. */
	.views {
		display: inline-flex;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.views a {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		padding: 0 var(--space-4);
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.views a[aria-current='page'] {
		background: var(--surface-lifted);
		color: var(--text);
		box-shadow: var(--shadow);
	}

	.empty {
		padding: var(--space-5);
	}

	.elsewhere {
		margin-top: var(--space-3);
	}

	.bulky {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-4);
		padding: var(--space-4);
	}

	.bulky h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-md);
	}

	.bulky ul {
		margin: 0;
		padding-left: var(--space-5);
	}

	.add {
		margin-top: var(--space-5);
		padding: 0 var(--space-4);
	}

	.add summary,
	.edit summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		list-style: none;
		cursor: pointer;
		font-weight: 600;
	}

	.add summary {
		min-height: var(--tap);
		color: var(--accent);
	}

	.edit summary {
		min-height: 28px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.add summary::-webkit-details-marker,
	.edit summary::-webkit-details-marker {
		display: none;
	}

	.unit-form {
		display: grid;
		gap: var(--space-3);
		margin: var(--space-2) 0 var(--space-4);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.row .field {
		flex: 1 1 120px;
	}

	.row .grow {
		flex: 3 1 180px;
	}

	.row .seats {
		flex: 0 1 110px;
	}

	.legs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.legs legend {
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}

	.check input {
		accent-color: var(--accent);
	}

	.remove {
		color: var(--danger);
	}
</style>

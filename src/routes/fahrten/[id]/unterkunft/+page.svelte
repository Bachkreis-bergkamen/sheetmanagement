<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { stayKind, type Room } from '#lib/trips/organising.ts';
	import AssignBoard, { warningText } from '#lib/components/AssignBoard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const s = t.trips.organising.stays;

	const placed = $derived(data.rooms.reduce((sum, one) => sum + one.people.length, 0));
	const units = $derived(
		data.rooms.map(({ unit, people, warnings }) => ({
			id: unit.id,
			title: unit.name,
			sub: `${s.kinds[stayKind(unit)]} · ${s.beds(unit.beds)}`,
			icon: stayKind(unit) === 'gastfamilie' ? ('home' as const) : ('bed' as const),
			places: unit.beds,
			people,
			warnings: warnings.map(warningText),
			details: unit.note ? [unit.note] : []
		}))
	);
	const roomOf = (id: string) => data.rooms.find((one) => one.unit.id === id)?.unit;
	// A new place is a host family when the trip has those already.
	const newKind = $derived(data.rooms.some((one) => stayKind(one.unit) === 'gastfamilie') ? 'gastfamilie' : 'zimmer');
</script>

<Title title={s.pageTitle(data.trip.title)} />

<a class="back" href="/fahrten/{data.trip.id}"><Icon name="back" size={16} />{data.trip.title}</a>

<header class="head">
	<h1>{s.title}</h1>
	<p class="lead">{s.lead}</p>
	{#if data.rooms.length}<p class="muted">{s.bedsTotal(data.beds, placed + data.unplaced.length)}</p>{/if}
	{#if !data.organises}<p class="muted">{t.trips.organising.board.readOnly}</p>{/if}
</header>

{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}

{#snippet roomForm(room?: Room)}
	<form method="POST" action="?/save" class="unit-form" use:enhance={saving.submit({ reset: !room })}>
		{#if room}<input type="hidden" name="id" value={room.id} />{/if}
		<div class="row">
			<label class="field">
				{s.fields.kind}
				<select name="kind">
					{#each ['zimmer', 'gastfamilie'] as const as kind (kind)}
						<option value={kind} selected={(room ? stayKind(room) : newKind) === kind}>{s.kinds[kind]}</option>
					{/each}
				</select>
			</label>
			<label class="field grow">{s.fields.name}<input name="name" required maxlength="80" value={room?.name ?? ''} placeholder={s.fields.nameHint} /></label>
			<label class="field beds">{s.fields.beds}<input name="beds" type="number" min="1" max="100" required value={room?.beds ?? (newKind === 'gastfamilie' ? 2 : 4)} /></label>
		</div>
		<label class="field">{s.fields.note}<textarea name="note" rows="2" maxlength="500" placeholder={s.fields.noteHint}>{room?.note ?? ''}</textarea></label>
		<div><button class="btn small" disabled={saving.busy}>{t.trips.days.save}</button></div>
	</form>
{/snippet}

{#snippet tools(id: string)}
	{@const room = roomOf(id)}
	{#if data.organises && room}
		<details class="edit">
			<summary><Icon name="edit" size={14} />{t.trips.days.edit}</summary>
			{@render roomForm(room)}
			<form method="POST" action="?/remove" use:enhance={saving.submit()}>
				<input type="hidden" name="id" value={id} />
				<button class="btn ghost small remove" disabled={saving.busy}><Icon name="trash" size={14} />{t.trips.days.remove}</button>
			</form>
		</details>
	{/if}
{/snippet}

{#if data.rooms.length}
	<AssignBoard {units} unplaced={data.unplaced} edits={data.organises} {tools} />
{:else}
	<p class="ui-card empty muted">{s.none}</p>
{/if}

{#if data.organises}
	<div class="adds">
		<details class="add ui-card" open={!data.rooms.length}>
			<summary><Icon name="plus" size={16} />{s.add}</summary>
			{@render roomForm()}
		</details>
		<details class="add ui-card">
			<summary><Icon name="plus" size={16} />{s.addMany}</summary>
			<form method="POST" action="?/addMany" class="unit-form" use:enhance={saving.submit()}>
				<div class="row">
					<label class="field">{s.count}<input name="count" type="number" min="1" max="200" value="6" required /></label>
					<label class="field">{s.fields.beds}<input name="beds" type="number" min="1" max="100" value="4" required /></label>
					<label class="field grow">{s.prefix}<input name="prefix" maxlength="60" value={s.room} /></label>
				</div>
				<div><button class="btn small" disabled={saving.busy}>{t.trips.days.save}</button></div>
			</form>
		</details>
	</div>
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
		margin-bottom: var(--space-5);
	}

	.lead {
		max-width: 62ch;
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.empty {
		padding: var(--space-5);
	}

	.adds {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		align-items: start;
		gap: var(--space-3);
		margin-top: var(--space-5);
	}

	.add {
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

	.row .beds {
		flex: 0 1 90px;
	}

	.remove {
		color: var(--danger);
	}
</style>

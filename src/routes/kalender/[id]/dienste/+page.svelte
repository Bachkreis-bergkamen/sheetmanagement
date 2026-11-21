<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import * as t from '#lib/i18n/texts.ts';
	import { MAX_NEEDED } from '#lib/duties/duties.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const f = t.duties.fields;
	// After a refused new job, the form keeps what was typed.
	const values = $derived(form && 'values' in form ? (form.values as Record<string, string>) : undefined);
	// A refused change opens that job's form again.
	const failedSlot = $derived(form && 'slot' in form ? String(form.slot) : '');
	// Opened right away while there's nothing yet.
	// svelte-ignore state_referenced_locally
	let addOpen = $state(data.manage && !data.slots.length);
	const title = $derived(`${t.duties.title} · ${data.event.title}`);
	const confirmRemove = (event: SubmitEvent) => confirm(t.duties.removeQuestion) || event.preventDefault();
	let rideKind = $state<'offer' | 'request'>('offer');
	const offers = $derived(data.rides.filter((ride) => ride.kind === 'offer'));
	const requests = $derived(data.rides.filter((ride) => ride.kind === 'request'));
</script>

<Title {title} />
<a class="back" href={data.back}><Icon name="back" size={16} />{data.event.title}</a>
<PageHeader title={t.duties.title} lead={`${data.event.title} · ${data.event.dateText}`} />

<p class="lead">{data.manage ? t.duties.leadManage : t.duties.lead}</p>

{#if form?.message}<p class="msg error" role="alert">{form.message}</p>{/if}
{#if form && 'saved' in form}<p class="msg ok" role="status"><Icon name="check" size={16} />{form.saved}</p>{/if}
{#if data.event.past && data.slots.length}<p class="msg info">{t.duties.past}</p>{/if}

{#if data.slots.length}
	<p class="summary" class:full={!data.places.free}>
		<Icon name="users" size={18} />{t.duties.places(data.places.free, data.places.needed)}
	</p>
	<ul class="jobs">
		{#each data.slots as slot (slot.id)}
			<li class="ui-card job" class:mine={slot.mine}>
				<div class="head">
					<div class="what">
						<h2>{slot.task}</h2>
						{#if slot.time}<span class="time"><Icon name="clock" size={14} />{slot.time}</span>{/if}
					</div>
					<span class="chip" class:free={slot.free > 0}>{slot.free ? t.duties.slotPlaces(slot.on.length, slot.needed) : t.duties.full}</span>
				</div>
				{#if slot.note}<p class="note">{slot.note}</p>{/if}
				<ul class="people" aria-label={t.duties.slotPlaces(slot.on.length, slot.needed)}>
					{#each slot.on as person (person.email)}
						<li class:me={person.me}>
							<Icon name="user" size={14} /><span>{person.name}</span>
							{#if person.offered}<span class="chip free">{t.duties.offered}</span>{/if}
							{#if data.manage}
								<form method="POST" action="?/unassign" use:enhance={saving.submit()}>
									<input type="hidden" name="slot" value={slot.id} />
									<input type="hidden" name="email" value={person.email} />
									<button class="icon-btn" disabled={saving.busy} aria-label={t.duties.unassign(person.name)} title={t.duties.unassign(person.name)}><Icon name="x" size={14} /></button>
								</form>
							{/if}
						</li>
					{:else}
						<li class="muted">{t.duties.nobody}</li>
					{/each}
				</ul>
				<div class="actions">
					{#if data.canTake && slot.mine}
						{@const offered = slot.on.some((person) => person.me && person.offered)}
						<span class="ok"><Icon name="check" size={16} />{t.duties.mine}</span>
						<form method="POST" action="?/offer" use:enhance={saving.submit()}>
							<input type="hidden" name="slot" value={slot.id} />
							<input type="hidden" name="offered" value={offered ? '0' : '1'} />
							<button class="btn small ghost" disabled={saving.busy} title={offered ? undefined : t.duties.offerHint}>{offered ? t.duties.unoffer : t.duties.offer}</button>
						</form>
						<form method="POST" action="?/leave" use:enhance={saving.submit()}>
							<input type="hidden" name="slot" value={slot.id} />
							<button class="btn small ghost" disabled={saving.busy}>{t.duties.leave}</button>
						</form>
					{:else if data.canTake}
						{#if slot.free}
							<form method="POST" action="?/take" use:enhance={saving.submit()}>
								<input type="hidden" name="slot" value={slot.id} />
								<button class="btn small" disabled={saving.busy}><Icon name="plus" size={14} />{t.duties.take}</button>
							</form>
						{/if}
						{#each slot.on.filter((person) => person.offered) as person (person.email)}
							<form method="POST" action="?/takeOver" use:enhance={saving.submit()}>
								<input type="hidden" name="slot" value={slot.id} />
								<input type="hidden" name="from" value={person.email} />
								<button class="btn small" disabled={saving.busy}><Icon name="refresh" size={14} />{t.duties.takeOver(person.name)}</button>
							</form>
						{/each}
					{/if}
					{#if data.manage && slot.free}
						<form method="POST" action="?/assign" class="assign" use:enhance={saving.submit()}>
							<input type="hidden" name="slot" value={slot.id} />
							<select name="email" required aria-label={t.duties.assignLabel}>
								<option value="">{t.duties.assignPick}</option>
								{#each data.people.filter((person) => !slot.on.some((on) => on.email === person.email)) as person (person.email)}
									<option value={person.email}>{person.name}</option>
								{/each}
							</select>
							<button class="btn small ghost" disabled={saving.busy}>{t.duties.assign}</button>
						</form>
					{/if}
				</div>
				{#if data.manage}
					<details class="edit" open={failedSlot === slot.id}>
						<summary><Icon name="edit" size={14} />{t.duties.edit}</summary>
						<form method="POST" action="?/update" class="grid" use:enhance={saving.submit()}>
							<input type="hidden" name="slot" value={slot.id} />
							{@render jobFields({ task: slot.task, from: slot.from, to: slot.to, needed: String(slot.needed), note: slot.note })}
							<div class="wide row-actions">
								<button class="btn small" disabled={saving.busy}><Icon name="check" size={14} />{t.duties.save}</button>
							</div>
						</form>
						<form method="POST" action="?/remove" class="remove" use:enhance={saving.submit()} onsubmit={confirmRemove}>
							<input type="hidden" name="slot" value={slot.id} />
							<button class="btn small ghost danger" disabled={saving.busy}><Icon name="trash" size={14} />{t.duties.remove}</button>
						</form>
					</details>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="msg info">{data.manage ? t.duties.noneManage : t.duties.none}</p>
{/if}

{#if data.nudge}
	<!-- Members with no job here yet get a reminder through the reminders job: push or mail, never at night. -->
	<form method="POST" action="?/nudge" class="ui-card section nudge" use:enhance={saving.submit()}>
		<p>{t.duties.nudgeHint(data.nudge.waiting)}{#if data.nudge.last}{' '}{t.duties.nudgedAt(data.nudge.last)}{/if}</p>
		<button class="btn small ghost" disabled={saving.busy || !data.nudge.waiting}><Icon name="bell" size={14} />{t.duties.nudge}</button>
	</form>
{/if}

<section class="section rides" aria-labelledby="rides-title">
	<h2 id="rides-title" class="ui-label">{t.duties.rides}</h2>
	<p class="muted">{t.duties.ridesLead}</p>
	{#if data.rides.length}
		<div class="ride-lists">
			{#each [{ label: t.duties.offers, list: offers }, { label: t.duties.requests, list: requests }] as group (group.label)}
				{#if group.list.length}
					<div>
						<h3>{group.label}</h3>
						<ul class="ui-list">
							{#each group.list as ride (ride.id)}
								<li class="ride">
									<span class="ride-main">
										<strong>{ride.name}</strong>
										<span>{ride.kind === 'offer' ? t.duties.rideOffer(ride.from, ride.seats) : t.duties.rideRequest(ride.from)}</span>
										{#if ride.note}<span class="muted">{ride.note}</span>{/if}
									</span>
									{#if ride.mine}
										<form method="POST" action="?/removeRide" use:enhance={saving.submit()}>
											<input type="hidden" name="ride" value={ride.id} />
											<button class="icon-btn" disabled={saving.busy} aria-label={t.duties.removeRide} title={t.duties.removeRide}><Icon name="trash" size={14} /></button>
										</form>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<p class="msg info">{t.duties.noRides}</p>
	{/if}
	{#if data.me && !data.event.past}
		<details class="ui-card add-ride" open={!!form && 'ride' in form}>
			<summary><Icon name="plus" size={16} />{t.duties.addRide}</summary>
			<form method="POST" action="?/addRide" class="grid" use:enhance={saving.submit({ reset: true })} onreset={() => (rideKind = 'offer')}>
				<fieldset class="wide kind">
					<legend>{t.duties.rideKind}</legend>
					<!-- Not bound: a form reset after saving would clear the choice; it goes back to "offer" instead. -->
					<label class="check"><input type="radio" name="kind" value="offer" defaultChecked onchange={() => (rideKind = 'offer')} />{t.duties.kindOffer}</label>
					<label class="check"><input type="radio" name="kind" value="request" onchange={() => (rideKind = 'request')} />{t.duties.kindRequest}</label>
				</fieldset>
				<label class="field">
					{t.duties.rideFrom}
					<input name="from" required maxlength="100" placeholder={t.duties.rideFromHint} />
				</label>
				{#if rideKind === 'offer'}
					<label class="field">
						{t.duties.rideSeats}
						<input name="seats" type="number" min="1" max="8" value="1" required />
					</label>
				{/if}
				<label class="field wide">
					{t.duties.rideNote}
					<input name="note" maxlength="300" placeholder={t.duties.rideNoteHint} />
				</label>
				<div class="wide">
					<button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{t.duties.addRide}</button>
				</div>
			</form>
		</details>
	{/if}
</section>

{#snippet jobFields(v: Record<string, string> | undefined)}
	<label class="field wide">
		{f.task}
		<input name="task" required maxlength="100" placeholder={f.taskHint} value={v?.task ?? ''} />
	</label>
	<label class="field">
		{f.from}
		<input name="from" inputmode="numeric" maxlength="8" placeholder={f.timeHint} value={v?.from ?? ''} />
	</label>
	<label class="field">
		{f.to}
		<input name="to" inputmode="numeric" maxlength="8" placeholder={f.timeHint} value={v?.to ?? ''} />
	</label>
	<label class="field">
		{f.needed}
		<input name="needed" type="number" min="1" max={MAX_NEEDED} required value={v?.needed ?? '1'} />
	</label>
	<label class="field wide">
		{f.note}
		<input name="note" maxlength="500" placeholder={f.noteHint} value={v?.note ?? ''} />
	</label>
{/snippet}

{#if data.manage}
	<details class="ui-card section add" bind:open={addOpen}>
		<summary><Icon name="plus" size={16} />{t.duties.add}</summary>
		<form method="POST" action="?/add" class="grid" use:enhance={saving.submit({ reset: true })}>
			{@render jobFields(values)}
			<div class="wide">
				<button class="btn" disabled={saving.busy}><Icon name="plus" size={16} />{t.duties.add}</button>
			</div>
		</form>
	</details>

	<section class="ui-card section" aria-labelledby="templates-title">
		<h2 id="templates-title" class="ui-label">{t.duties.templates}</h2>
		{#if data.templates.length}
			<form method="POST" action="?/useTemplate" class="inline" use:enhance={saving.submit()}>
				<label class="field">
					{t.duties.useTemplate}
					<select name="template" required>
						<option value="">{t.duties.templatePick}</option>
						{#each data.templates as template (template.id)}<option value={template.id}>{template.name} ({t.duties.jobsOf(template.count)})</option>{/each}
					</select>
				</label>
				<button class="btn small" disabled={saving.busy}>{t.duties.useTemplate}</button>
			</form>
		{/if}
		{#if data.slots.length}
			<form method="POST" action="?/saveTemplate" class="inline" use:enhance={saving.submit({ reset: true })}>
				<label class="field">
					{t.duties.templateName}
					<input name="name" required maxlength="100" placeholder={t.duties.templateNameHint} aria-describedby="template-hint" />
				</label>
				<button class="btn small ghost" disabled={saving.busy}>{t.duties.saveTemplate}</button>
			</form>
			<p id="template-hint" class="hint">{t.duties.templateHint}</p>
		{:else if !data.templates.length}
			<p class="muted">{t.duties.noTemplates}</p>
		{/if}
	</section>
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

	.lead {
		margin: 0 0 var(--space-4);
		color: var(--text-muted);
	}

	.summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		color: var(--warn);
		font-weight: 600;
	}

	.summary.full {
		color: var(--ok);
	}

	.jobs {
		display: grid;
		gap: var(--space-3);
		margin: 0 0 var(--space-5);
		padding: 0;
		list-style: none;
	}

	.job {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-5);
	}

	.job.mine {
		border-color: var(--accent);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.what {
		display: grid;
		gap: 2px;
	}

	.what h2 {
		margin: 0;
		font-size: var(--text-md);
	}

	.time {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--ok) 12%, transparent);
		color: var(--ok);
		font-size: var(--text-2xs);
		font-weight: 700;
		white-space: nowrap;
	}

	.chip.free {
		background: color-mix(in oklab, var(--warn) 12%, transparent);
		color: var(--warn);
	}

	.note {
		margin: 0;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}

	.people {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}

	.people li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.people li.me {
		color: var(--accent);
		font-weight: 600;
	}

	.icon-btn {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--surface-2);
		color: var(--danger);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.actions:empty {
		display: none;
	}

	.ok {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--ok);
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.assign {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-left: auto;
	}

	.assign select {
		max-width: 14rem;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.edit summary,
	.add summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.edit summary {
		font-size: var(--text-sm);
	}

	.edit summary::-webkit-details-marker,
	.add summary::-webkit-details-marker {
		display: none;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.remove {
		margin-top: var(--space-3);
	}

	.remove .danger {
		color: var(--danger);
	}

	.section {
		margin-bottom: var(--space-5);
		padding: var(--space-4) var(--space-5);
	}

	.inline {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-3);
	}

	.inline .field {
		flex: 1 1 14rem;
	}

	.nudge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
	}

	.nudge p {
		flex: 1 1 18rem;
		margin: 0;
		font-size: var(--text-sm);
	}

	.rides h3 {
		margin: var(--space-3) 0 var(--space-2);
		font-size: var(--text-sm);
	}

	.ride-lists {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0 var(--space-4);
	}

	.ride {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
	}

	.ride-main {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 2px;
		overflow-wrap: anywhere;
	}

	.add-ride {
		margin-top: var(--space-3);
		padding: var(--space-4) var(--space-5);
	}

	.add-ride summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.add-ride summary::-webkit-details-marker {
		display: none;
	}

	.kind {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.kind legend {
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	@media (max-width: 480px) {
		.assign {
			margin-left: 0;
		}

		.assign select {
			max-width: none;
			flex: 1;
		}
	}
</style>

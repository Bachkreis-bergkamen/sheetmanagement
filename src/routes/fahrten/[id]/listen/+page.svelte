<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { DIETS, INSURANCES, looksBulky, OWNERS, SEVERITIES, type ListAnswers, type ListKind } from '#lib/trips/lists.ts';
	import { formatWeekday, localDay } from '#lib/trips/trips.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	// What the last action said, whichever list it was for.
	const result = $derived(form as { kind?: string; error?: string; saved?: boolean; instrumentError?: string; instrumentSaved?: boolean } | null);
	const saving = new FormState();
	const l = t.trips.lists;
	const day = (iso: string) => formatWeekday(iso.length > 10 ? localDay(iso, config.timeZone) : iso, config.locale);
	const euro = new Intl.NumberFormat(config.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
	const confirm = (question: string) => (event: SubmitEvent) => {
		if (!window.confirm(question)) event.preventDefault();
	};
	const answers = <K extends ListKind>(list: { kind: ListKind; data: unknown }, _kind: K) => list.data as ListAnswers[K] | null;

	// The allergies, edited here until saved: as filled in (or kept), or one empty row.
	let next = 0;
	let allergies = $state(
		untrack(() => {
			const known = data.lists.find((list) => list.kind === 'ernaehrung')?.data as ListAnswers['ernaehrung'] | null | undefined;
			return (known?.allergies.length ? known.allergies : [{ what: '', severity: 'mittel' as const }]).map((allergy) => ({ ...allergy, key: next++ }));
		})
	);
	// A new instrument's "own seat" box follows its name until it's ticked by hand.
	let newName = $state('');
	let bulkyTouched = $state(false);
	let newBulky = $state(false);
	$effect(() => {
		if (!bulkyTouched) newBulky = looksBulky(newName);
	});
</script>

<Title title="{l.title} · {data.trip.title}" />

<a class="back" href="/fahrten/{data.trip.id}"><Icon name="back" size={16} />{l.back}</a>

<header class="head">
	<p class="over">{data.trip.title}</p>
	<h1>{data.person.byParent ? l.titleFor(data.person.name) : l.title}</h1>
	<p class="lead">{l.lead}</p>
	{#if data.people.length > 1}
		<nav class="people" aria-label={l.title}>
			{#each data.people as one (one.fuer)}
				<a class="chip" class:on={one.fuer === data.fuer} aria-current={one.fuer === data.fuer ? 'page' : undefined} href={one.fuer ? `?fuer=${one.fuer}` : '?'}>{one.name}</a>
			{/each}
		</nav>
	{/if}
	<p class="hint">{l.goneOn(day(data.goneOn))}</p>
	{#if !data.editable}<p class="msg info">{l.closed}</p>{/if}
</header>

{#if !data.lists.length}
	<p class="muted">{l.nothing}</p>
{/if}

{#snippet status(list: (typeof data.lists)[number])}
	<p class="status" class:todo={!list.savedAt}>
		{#if list.savedAt}
			<Icon name="check" size={14} />{list.savedBy ? l.savedBy(list.savedBy, day(list.savedAt)) : l.savedAt(day(list.savedAt))}
		{:else if list.fromLastTrip}
			<Icon name="history" size={14} />{l.fromLastTrip}
		{:else}
			<Icon name="alert" size={14} />{l.missing}
		{/if}
	</p>
{/snippet}

{#snippet yesNo(name: string, value: boolean | undefined, label: string)}
	<fieldset class="yes-no">
		<legend>{label}</legend>
		<label><input type="radio" {name} value="ja" checked={value === true} required />{l.yes}</label>
		<label><input type="radio" {name} value="nein" checked={value === false} />{l.no}</label>
	</fieldset>
{/snippet}

{#snippet keepBox(list: (typeof data.lists)[number], hint: string)}
	{#if list.keep !== null}
		<label class="check">
			<input type="checkbox" name="keep" checked={list.keep} />
			<span>{l.keep}<small>{hint}</small></span>
		</label>
	{/if}
{/snippet}

{#snippet footer(list: (typeof data.lists)[number])}
	{#if result?.kind === list.kind && result.error}<p class="msg error" role="alert">{result.error}</p>{/if}
	{#if result?.kind === list.kind && result.saved}<p class="msg ok" role="status"><Icon name="check" size={16} />{l.saved}</p>{/if}
	<div>
		<button class="btn" disabled={saving.busy || !data.editable}>
			<Icon name="check" size={16} />{list.fromLastTrip ? l.confirm : l.save}
		</button>
	</div>
{/snippet}

{#each data.lists as list (list.kind)}
	<section class="ui-card section" id={list.kind}>
		<h2>{l.kinds[list.kind]}</h2>
		<p class="muted">{l.leads[list.kind]}</p>
		<p class="readers"><Icon name="eye" size={14} />{l.readers[list.readers]}</p>
		{@render status(list)}

		{#if list.kind === 'instrumente'}
			{@const taken = answers(list, 'instrumente')?.taken ?? []}
			<h3>{l.instruments.yours}</h3>
			{#if data.instruments.length}
				<ul class="instruments">
					{#each data.instruments as instrument (instrument.id)}
						<li>
							<label class="take">
								<input type="checkbox" name="taken" value={instrument.id} form="list-instrumente" checked={taken.includes(instrument.id)} disabled={!data.editable} />
								<span class="name">{instrument.name}</span>
								<span class="muted">
									{[
										l.instruments.owners[instrument.owner],
										...(instrument.value !== undefined ? [euro.format(instrument.value)] : []),
										l.instruments.insurances[instrument.insurance],
										...(instrument.bulky ? [l.instruments.bulkyShort] : [])
									].join(' · ')}
								</span>
							</label>
							{#if instrument.confirmedAt}<span class="hint">{l.instruments.confirmedOn(day(instrument.confirmedAt))}</span>{/if}
							{#if data.editable}
								<details class="edit-instrument">
									<summary>{l.instruments.edit}</summary>
									{@render instrumentForm(instrument)}
									<form method="POST" action="?/removeInstrument" use:enhance={saving.submit()} onsubmit={confirm(l.instruments.removeConfirm(instrument.name))}>
										<input type="hidden" name="id" value={instrument.id} />
										<input type="hidden" name="fuer" value={data.fuer ?? ''} />
										<button class="btn ghost small danger-text" disabled={saving.busy}><Icon name="trash" size={14} />{l.instruments.remove}</button>
									</form>
								</details>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">{l.instruments.none}</p>
			{/if}
			{#if result?.instrumentError}<p class="msg error" role="alert">{result.instrumentError}</p>{/if}
			{#if data.editable}
				<details class="add">
					<summary><Icon name="plus" size={16} />{l.instruments.add}</summary>
					{@render instrumentForm(null)}
				</details>
			{/if}
			<form method="POST" action="?/save" id="list-instrumente" class="list-form" use:enhance={saving.submit()}>
				<input type="hidden" name="kind" value="instrumente" />
				<input type="hidden" name="fuer" value={data.fuer ?? ''} />
				{#if data.instruments.length}
					<label class="check"><input type="checkbox" name="confirmValues" disabled={!data.editable} /><span>{l.instruments.confirmValues}</span></label>
				{/if}
				{@render footer(list)}
			</form>
		{:else}
			<form method="POST" action="?/save" class="list-form" use:enhance={saving.submit()}>
				<input type="hidden" name="kind" value={list.kind} />
				<input type="hidden" name="fuer" value={data.fuer ?? ''} />
				<fieldset class="plain" disabled={!data.editable || list.locked}>
					{#if list.kind === 'ernaehrung'}
						{@const diet = answers(list, 'ernaehrung')}
						<label class="field">
							{l.diet.diet}
							<select name="diet" required>
								<option value="" disabled selected={!diet}>{l.choose}</option>
								{#each DIETS as one (one)}
									<option value={one} selected={diet?.diet === one}>{l.diet.diets[one]}</option>
								{/each}
							</select>
						</label>
						<label class="field">{l.diet.dietNote}<input name="dietNote" maxlength="500" value={diet?.dietNote ?? ''} /></label>
						<fieldset class="plain allergies">
							<legend>{l.diet.allergies}</legend>
							<p class="hint">{l.diet.allergiesHint}</p>
							{#each allergies as allergy, i (allergy.key)}
								<div class="allergy">
									<label class="field"><span class="sr-only">{l.diet.allergy}</span><input name="allergy" maxlength="120" bind:value={allergy.what} placeholder={l.diet.allergy} /></label>
									<label class="field">
										<span class="sr-only">{l.diet.severity}</span>
										<select name="severity" bind:value={allergy.severity}>
											{#each SEVERITIES as severity (severity)}<option value={severity}>{l.diet.severityOptions[severity]}</option>{/each}
										</select>
									</label>
									{#if allergies.length > 1}
										<button type="button" class="icon-btn" aria-label={l.diet.removeAllergy} title={l.diet.removeAllergy} onclick={() => allergies.splice(i, 1)}><Icon name="x" size={16} /></button>
									{/if}
								</div>
							{/each}
							<button type="button" class="link-btn" onclick={() => allergies.push({ what: '', severity: 'mittel', key: next++ })}><Icon name="plus" size={14} />{l.diet.addAllergy}</button>
						</fieldset>
						<label class="field">
							{l.diet.medication}
							<textarea name="medication" rows="2" maxlength="500" aria-describedby="medication-hint">{diet?.medication ?? ''}</textarea>
						</label>
						<p class="hint" id="medication-hint">{l.diet.medicationHint}</p>
						<!-- Asked again on every trip, never ticked in advance (Art. 9 DSGVO). -->
						<label class="check consent"><input type="checkbox" name="consent" required /><span>{l.diet.consent}</span></label>
						{@render keepBox(list, l.diet.keepHint)}
					{:else if list.kind === 'wuensche'}
						{@const wishes = answers(list, 'wuensche')}
						<label class="field">{l.wishes.roomWith}<input name="roomWith" maxlength="500" value={wishes?.roomWith ?? ''} /></label>
						<label class="field">{l.wishes.busWith}<input name="busWith" maxlength="500" value={wishes?.busWith ?? ''} /></label>
						<label class="field">{l.wishes.note}<textarea name="note" rows="2" maxlength="500">{wishes?.note ?? ''}</textarea></label>
						{@render keepBox(list, l.keepHint)}
					{:else if list.kind === 'notfall'}
						{@const contact = answers(list, 'notfall')}
						<div class="row">
							<label class="field">{l.emergency.name}<input name="name" required maxlength="120" autocomplete="off" value={contact?.name ?? ''} /></label>
							<label class="field">{l.emergency.phone}<input name="phone" type="tel" required maxlength="32" autocomplete="off" value={contact?.phone ?? ''} /></label>
						</div>
						<label class="field">{l.emergency.insurance}<input name="insurance" maxlength="120" value={contact?.insurance ?? ''} /></label>
						{@render keepBox(list, l.keepHint)}
					{:else if list.kind === 'dokumente'}
						{@render yesNo('validId', answers(list, 'dokumente')?.validId, l.documents.validId)}
					{:else if list.kind === 'einverstaendnis'}
						{@const consents = answers(list, 'einverstaendnis')}
						{#if list.locked}<p class="msg info">{l.locked}</p>{/if}
						{@render yesNo('photos', consents?.photos, l.consents.photos)}
						{@render yesNo('travelAlone', consents?.travelAlone, l.consents.travelAlone)}
						{#if data.person.minor}{@render yesNo('freeTime', consents?.freeTime, l.consents.freeTime)}{/if}
						{@render keepBox(list, l.keepHint)}
					{:else if list.kind === 'fragen'}
						{@const given = answers(list, 'fragen') ?? {}}
						{#each data.questions as question (question.id)}
							{#if question.type === 'janein'}
								<fieldset class="yes-no">
									<legend>{question.text}</legend>
									<label><input type="radio" name="q-{question.id}" value="ja" checked={given[question.id] === 'ja'} />{l.yes}</label>
									<label><input type="radio" name="q-{question.id}" value="nein" checked={given[question.id] === 'nein'} />{l.no}</label>
								</fieldset>
							{:else if question.type === 'auswahl'}
								<label class="field">
									{question.text}
									<select name="q-{question.id}">
										<option value="">{l.choose}</option>
										{#each question.options as option (option)}<option value={option} selected={given[question.id] === option}>{option}</option>{/each}
									</select>
								</label>
							{:else}
								<label class="field">{question.text}<input name="q-{question.id}" maxlength="500" value={given[question.id] ?? ''} /></label>
							{/if}
						{/each}
					{/if}
				</fieldset>
				{#if !list.locked}{@render footer(list)}{/if}
			</form>
		{/if}
	</section>
{/each}

{#snippet instrumentForm(instrument: (typeof data.instruments)[number] | null)}
	<form method="POST" action="?/instrument" class="instrument-form" use:enhance={saving.submit({ reset: !instrument })}>
		<input type="hidden" name="fuer" value={data.fuer ?? ''} />
		{#if instrument}<input type="hidden" name="id" value={instrument.id} />{/if}
		<div class="row">
			{#if instrument}
				<label class="field grow">{l.instruments.name}<input name="name" required maxlength="120" value={instrument.name} /></label>
			{:else}
				<label class="field grow">{l.instruments.name}<input name="name" required maxlength="120" placeholder={l.instruments.nameHint} bind:value={newName} /></label>
			{/if}
			<label class="field">{l.instruments.value}<input name="value" inputmode="numeric" maxlength="12" value={instrument?.value ?? ''} /></label>
		</div>
		<div class="row">
			<label class="field">
				{l.instruments.owner}
				<select name="owner">{#each OWNERS as owner (owner)}<option value={owner} selected={(instrument?.owner ?? 'eigen') === owner}>{l.instruments.owners[owner]}</option>{/each}</select>
			</label>
			<label class="field">
				{l.instruments.insurance}
				<select name="insurance">{#each INSURANCES as insurance (insurance)}<option value={insurance} selected={(instrument?.insurance ?? 'keine') === insurance}>{l.instruments.insurances[insurance]}</option>{/each}</select>
			</label>
			<label class="field">{l.instruments.serial}<input name="serial" maxlength="120" value={instrument?.serial ?? ''} /></label>
		</div>
		{#if instrument}
			<label class="check"><input type="checkbox" name="bulky" checked={instrument.bulky} /><span>{l.instruments.bulky}</span></label>
		{:else}
			<label class="check"><input type="checkbox" name="bulky" bind:checked={newBulky} onchange={() => (bulkyTouched = true)} /><span>{l.instruments.bulky}</span></label>
		{/if}
		<div><button class="btn small" disabled={saving.busy}><Icon name="check" size={14} />{l.instruments.save}</button></div>
	</form>
{/snippet}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
		color: var(--accent);
		font-weight: 600;
	}

	.head {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}

	.over {
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.people {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		color: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.chip.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.muted,
	.hint,
	.readers {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		font-size: var(--text-xs);
	}

	.section {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		padding: var(--space-4);
		scroll-margin-top: var(--space-6);
	}

	.section h2 {
		font-size: var(--text-lg);
	}

	.section h3 {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.readers,
	.status {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.status {
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.status.todo {
		color: var(--warn);
	}

	.list-form,
	.instrument-form {
		display: grid;
		gap: var(--space-3);
	}

	.plain {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.plain legend,
	.yes-no legend {
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
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
		flex: 3 1 220px;
	}

	.allergies {
		gap: var(--space-2);
	}

	.allergy {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) 40px;
		align-items: end;
		gap: var(--space-2);
	}

	.yes-no {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.yes-no legend {
		width: 100%;
	}

	.yes-no label,
	.check {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		min-height: 32px;
		cursor: pointer;
	}

	.yes-no input,
	.check input {
		flex: none;
		width: 18px;
		height: 18px;
		margin: 2px 0 0;
		accent-color: var(--accent);
	}

	.check span {
		display: grid;
		gap: 2px;
	}

	.check small {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.consent {
		padding: var(--space-3);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		font-size: var(--text-sm);
	}

	.instruments {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.instruments li {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--hairline);
	}

	.instruments li:first-child {
		border-top: 0;
	}

	.take {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		cursor: pointer;
	}

	.take input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.take .name {
		font-weight: 600;
	}

	.add summary,
	.edit-instrument summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.add[open] > .instrument-form,
	.edit-instrument[open] > .instrument-form {
		margin: var(--space-3) 0;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.link-btn {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-1);
		padding: var(--space-1) 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.danger-text {
		color: var(--danger);
	}
</style>

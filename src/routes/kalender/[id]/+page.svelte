<script lang="ts">
	import { page } from '$app/state';
	import AddEventForm from '#lib/components/AddEventForm.svelte';
	import { enhance } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { t } from '#lib/i18n/index.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import EventRow from '#lib/components/EventRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InstrumentationMatrix from '#lib/components/InstrumentationMatrix.svelte';
	import ProgramList from '#lib/components/ProgramList.svelte';
	import RehearsalNote from '#lib/components/RehearsalNote.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import Signups from '#lib/components/Signups.svelte';
	import Title from '#lib/components/Title.svelte';
	import { splitTrailingEmoji } from '#lib/events/format.ts';
	import { FormState } from '#lib/forms.svelte.ts';

	let { data, form } = $props();
	/** The form that changes this date in the calendar, for those who plan dates. */
	let editing = $state(false);
	let editSaved = $state(false);
	const orchestraSave = new FormState();
	const publishSave = new FormState();
	const detailsSave = new FormState();
	const partnersSave = new FormState();
	/** The orchestra whose Drive folder is being synced. */
	let syncing = $state<string | null>(null);
	const several = $derived(data.program.groups.length > 1);
	const id = $derived(encodeURIComponent(page.params.id ?? ''));
	const title = $derived(data.kind === 'event' ? data.event.displayTitle : data.archive.title);
	const location = $derived(data.kind === 'event' ? data.event.location : data.archive.location);
	const isConcert = $derived(data.kind === 'archive' || data.event.type === 'konzert');
	const [titleStart, titleEnd] = $derived(splitTrailingEmoji(title));

	/** A rehearsal sits below its concert: "Konzerte › Herbstkonzert › Probe". */
	const crumbs = $derived([
		{ href: '/kalender', label: t.concerts.title },
		...(data.kind === 'event' && !isConcert && data.concert
			? [{ href: `/kalender/${encodeURIComponent(data.concert.id)}`, label: data.concert.displayTitle }]
			: [])
	]);

	/** The page's one main action: the member's parts for this concert or rehearsal. */
	const partsUrl = $derived(
		data.kind !== 'event' || data.event.past
			? undefined
			: isConcert
				? data.program.items.length
					? `/meine-noten?konzert=${id}`
					: undefined
				: data.rehearsalPlan.partsUrl
	);
	/** For the group chat: when, where and, for a concert, what's played. */
	const shareText = $derived(
		[
			title,
			data.kind === 'event'
				? [data.event.date.long, data.event.date.time].filter(Boolean).join(', ')
				: (data.archive.label?.long ?? data.archive.dateText),
			location,
			...(isConcert && data.program.items.length
				? ['', `${t.concert.program}:`, ...data.program.items.map((item, i) => `${i + 1}. ${item.title}`)]
				: [])
		]
			.filter((line) => line !== undefined)
			.join('\n')
	);
	const check = $derived(data.program.check);
	const checkOpen = $derived(check?.filter((item) => !item.ok).length ?? 0);

	/**
	 * Planners get two views of a concert: what every member sees, and "Planung" with the
	 * check, the tools, the instrumentation and attendance. Members see one calm page.
	 */
	const planning = $derived(data.kind === 'event' ? data.planning : null);
	// svelte-ignore state_referenced_locally
	let view = $state<'overview' | 'planung'>(page.url.searchParams.has('planung') ? 'planung' : 'overview');
	function changeView(next: 'overview' | 'planung') {
		const url = new URL(page.url.href);
		if (next === 'planung') url.searchParams.set('planung', '');
		else url.searchParams.delete('planung');
		// Linkable, without a new history entry for every switch.
		replaceState(url, {});
	}
	const overview = $derived(!planning || view === 'overview');
	const planner = $derived(!planning || view === 'planung');
	/** Editing links, Drive and suggestions sit inline only where there's no "Planung" to keep them in. */
	const inlineTools = $derived(!planning);
	const showPlan = $derived(
		data.kind === 'event' &&
			!isConcert &&
			data.event.type !== 'sonstiges' &&
			(data.rehearsalPlan.items.length || data.rehearsalPlan.editUrl || data.rehearsalPlan.partsUrl)
	);
</script>

<Title {title} />

<Crumbs items={crumbs} />

<header class="head {data.kind === 'event' ? data.event.type : 'konzert'}" class:past={data.kind === 'event' && data.event.past}>
	<!-- When at a glance: the date as a tile, like in the calendar's list. -->
	{#if data.kind === 'event'}
		<span class="tile" aria-hidden="true">
			<span class="weekday">{data.event.date.weekday}</span>
			<span class="day">{data.event.date.day}</span>
			<span class="month">{data.event.date.month}</span>
		</span>
	{/if}
	<div class="head-text">
		<h1>{titleStart}{#if titleEnd}<span class="keep">{titleEnd}</span>{/if}</h1>
		<!-- The title leads; the type is said again only when the title doesn't say it. -->
		{#if data.kind === 'event'}
			{@const type = t.concerts.types[data.event.type]}
			<p class="when">
				{#if !title.toLowerCase().includes(type.toLowerCase())}<span class="type">{type}</span>{' · '}{/if}
				{data.event.date.long} · {data.event.date.time || t.concerts.allDay}
				{#if !data.event.past}{' · '}<span class="relative">{t.concerts.relative(data.event.daysUntil)}</span>{/if}
				{#if data.event.tentative}<span class="tentative">{t.concerts.tentative}</span>{/if}
			</p>
		{:else}
			<p class="when"><span class="type">{t.concert.archive}</span></p>
		{/if}
	</div>
	<div class="head-actions">
		{#if partsUrl}
			<a class="btn" href={partsUrl}><Icon name="parts" size={18} />{t.nav.myParts}</a>
		{/if}
		<div class="ui-actions">
			{#if data.kind === 'event' && data.editing}
				<button type="button" aria-expanded={editing} onclick={() => ((editing = !editing), (editSaved = false))}><Icon name="edit" size={16} />{t.calendar.edit.open}</button>
			{/if}
			<ShareButton {title} text={shareText} url={page.url.pathname} />
			<!-- Where it came from: a quiet way out, beside sharing rather than among the facts. -->
			{#if data.kind === 'event' && data.event.url}
				<a href={data.event.url} target="_blank" rel="noopener noreferrer"><Icon name="calendar" size={16} />{t.concert.openInCalendar}</a>
			{/if}
		</div>
	</div>
</header>

{#if data.kind === 'event' && data.editing}
	<div class="edit">
		<AddEventForm
			editing
			calendar
			archive={false}
			writable={data.editing.writable}
			orchestras={data.editing.orchestras}
			concerts={data.editing.concerts}
			today=""
			last={data.editing.last}
			bind:open={editing}
			result={form}
			preset={data.editing.values}
			onsaved={() => ((editing = false), (editSaved = true))}
		/>
	</div>
	{#if editSaved}<p class="saved edit-saved" role="status"><Icon name="check" size={16} />{t.calendar.edit.saved}</p>{/if}
{/if}

{#if planning}
	<div class="views">
		<Segmented
			label={t.concert.views.label}
			options={[
				{ value: 'overview', label: t.concert.views.overview, icon: 'calendar' },
				{ value: 'planung', label: checkOpen ? `${t.concert.views.planning} · ${checkOpen}` : t.concert.views.planning, icon: 'list' }
			]}
			bind:value={view}
			onchange={changeView}
		/>
	</div>
{/if}

{#if overview}
<!-- The one thing every member does here, right below the date (#215): visible without scrolling on a phone. -->
{#if data.kind === 'event' && data.signups}
	{#if data.signups.state === 'ready'}
		<Signups signups={data.signups} result={form} />
	{:else}
		<p class="placeholder block">{data.signups.state === 'sign-in' ? t.signups.signInNeeded : t.signups.notSetUp}</p>
	{/if}
{/if}

<!-- The facts as one calm list: when, where, what it belongs to. -->
<ul class="ui-list facts">
	{#if data.kind === 'archive'}
		<li>
			<div class="fact">
				<span class="icon"><Icon name="calendar" size={18} /></span>
				<span class="fact-body">
					<strong>{data.archive.label?.long ?? (data.archive.dateText || t.concert.dateUnknown)}</strong>
				</span>
			</div>
		</li>
	{/if}
	{#if location}
		<li>
			<svelte:element
				this={data.mapUrl ? 'a' : 'div'}
				class="fact"
				href={data.mapUrl}
				target={data.mapUrl ? '_blank' : undefined}
				rel={data.mapUrl ? 'noopener noreferrer' : undefined}
			>
				<span class="icon"><Icon name="pin" size={18} /></span>
				<span class="fact-body">
					<strong>{location.split(',')[0].trim()}</strong>
					{#if location.includes(',')}<span>{location.split(',').slice(1).join(',').trim()}</span>{/if}
				</span>
				{#if data.mapUrl}<span class="trail">{t.concert.map}<Icon name="external" size={14} /></span>{/if}
			</svelte:element>
		</li>
	{/if}
	{#if data.kind === 'event' && !isConcert && data.concert}
		<li>
			<a class="fact" href="/kalender/{encodeURIComponent(data.concert.id)}">
				<span class="icon concert"><Icon name="link" size={18} /></span>
				<span class="fact-body">
					<span class="over">{t.concert.preparesFor}</span>
					<strong>{data.concert.displayTitle}</strong>
					<span>{data.concert.date.long} · {t.concerts.relative(data.concert.daysUntil)}</span>
				</span>
				<span class="trail"><Icon name="chevron" size={16} /></span>
			</a>
		</li>
	{/if}
	{#if data.kind === 'event' && data.orchestras}
		{@const orchestras = data.orchestras}
		<li>
			<div class="fact">
				<span class="icon"><Icon name="users" size={18} /></span>
				<span class="fact-body">
					<span class="over">{t.concert.orchestras.over}</span>
					<strong>{orchestras.current.length === orchestras.all.length ? t.concert.orchestras.all : orchestras.current.join(' + ')}</strong>
				</span>
			</div>
			{#if orchestras.canChange}
				<!-- Also afterwards: who saw the rehearsal and who counts for it follow the ticks. -->
				<details class="orchestra-edit" open={!!form?.orchestraError}>
					<summary>{t.concert.orchestras.change}</summary>
					<form method="POST" action="?/orchestras" use:enhance={orchestraSave.submit()}>
						<fieldset>
							<legend class="sr-only">{t.concert.orchestras.over}</legend>
							{#each orchestras.all as name (name)}
								<label class="check"><input type="checkbox" name="orchestra" value={name} checked={orchestras.current.includes(name)} />{name}</label>
							{/each}
						</fieldset>
						<p class="hint">{t.concert.orchestras.hint}</p>
						{#if form?.orchestraError}<p class="msg error" role="alert">{form.orchestraError}</p>{/if}
						<button class="btn small" disabled={orchestraSave.busy}>{t.concert.orchestras.save}</button>
					</form>
				</details>
				{#if form?.orchestrasSaved}<p class="saved orchestra-saved" role="status"><Icon name="check" size={16} />{t.concert.orchestras.saved}</p>{/if}
			{/if}
		</li>
	{/if}
	{#if isConcert && (data.program.ours.length || data.program.partners.length || data.program.organizer)}
		<!-- Who plays it: our orchestras, the choirs and orchestras we give it with, and who organises it when it isn't us. -->
		<li>
			<div class="fact">
				<span class="icon"><Icon name="users" size={18} /></span>
				<span class="fact-body">
					{#if data.program.ours.length || data.program.partners.length}
						<span class="over">{t.partners.over}</span>
						<strong>
							{data.program.ours.join(', ')}{#each data.program.partners as partner, i (partner.name)}{i || data.program.ours.length ? ', ' : ''}{#if partner.website}<a href={partner.website} target="_blank" rel="noopener noreferrer">{partner.name}</a>{:else}{partner.name}{/if}{/each}
						</strong>
						{@const conductors = data.program.partners.filter((partner) => partner.conductor)}
						{#if conductors.length}
							<!-- With one guest its conductor is plain; with several, each by name. -->
							<span>{conductors.map((partner) => (data.program.partners.length > 1 ? `${partner.name}: ` : '') + t.partners.conductor(partner.conductor!)).join(' · ')}</span>
						{/if}
					{/if}
					{#if data.program.organizer}<span>{t.partners.organizedBy(data.program.organizer)}</span>{/if}
				</span>
			</div>
		</li>
	{/if}
	{#if data.kind === 'event' && data.event.description}
		<!-- The note from the calendar is one more fact, not a section of its own. -->
		<li>
			<div class="fact top">
				<span class="icon"><Icon name="note" size={18} /></span>
				<span class="fact-body">
					<span class="over">{t.concert.description}</span>
					<span class="description">{data.event.description}</span>
				</span>
			</div>
		</li>
	{/if}
</ul>
{/if}

{#if check && planner}
	<!-- For planners: what's done and what's still open, worked out from the data. -->
	<details class="block check" open={checkOpen > 0}>
		<summary>
			<span class="check-icon" class:done={!checkOpen}><Icon name={checkOpen ? 'list' : 'check'} size={18} /></span>
			<span class="check-title">
				<strong>{t.check.title}</strong>
				<span>{checkOpen ? t.check.open(checkOpen) : t.check.allDone}</span>
			</span>
		</summary>
		<ul>
			{#each check as item (item.key)}
				<li class:ok={item.ok}>
					<Icon name={item.ok ? 'check' : 'alert'} size={16} />
					{#if item.href && !item.ok}
						<a href={item.href}>{item.text}</a>
					{:else}
						<span>{item.text}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</details>
{/if}

{#if planning && view === 'planung'}
	<!-- Everything a planner works with for this concert, one tap each. -->
	<section class="block">
		<h2 class="ui-label">{t.concert.tools}</h2>
		<ul class="ui-list tools">
			{#if data.program.canEdit}
				<li><a href="/kalender/{id}/programm"><Icon name="edit" size={18} /><span>{t.editor.edit}</span><Icon name="chevron" size={18} /></a></li>
			{/if}
			{#if data.program.canEdit && data.program.suggestions}
				<li><a href="/kalender/{id}/programm"><Icon name="bulb" size={18} /><span>{t.editor.openSuggestions(data.program.suggestions)}</span><Icon name="chevron" size={18} /></a></li>
			{/if}
			{#if data.program.canEdit && data.program.jointUrl}
				<li><a href={data.program.jointUrl}><Icon name="link" size={18} /><span>{t.editor.addJoint(data.program.jointNames)}</span><Icon name="chevron" size={18} /></a></li>
			{/if}
			{#if data.kind === 'event' && data.rehearsalPlan.editUrl}
				<li><a href={data.rehearsalPlan.editUrl}><Icon name="calendar" size={18} /><span>{t.rehearsalPlan.edit}</span><Icon name="chevron" size={18} /></a></li>
			{/if}
			{#if data.kind === 'event' && data.addRehearsalUrl}
				<li><a href={data.addRehearsalUrl}><Icon name="plus" size={18} /><span>{t.concert.addRehearsal}</span><Icon name="chevron" size={18} /></a></li>
			{/if}
			{#if planning.attendanceUrl}
				<li>
					<a href={planning.attendanceUrl.href}>
						<Icon name="users" size={18} /><span>{t.concert.lastAttendance}<small>{planning.attendanceUrl.label}</small></span><Icon name="chevron" size={18} />
					</a>
				</li>
			{/if}
			{#if planning.printUrl}
				<li><a href={planning.printUrl}><Icon name="print" size={18} /><span>{t.print.handout} · {t.print.setlist}</span><Icon name="chevron" size={18} /></a></li>
			{/if}
			{#if planning.reportUrl}
				<li><a href={planning.reportUrl}><Icon name="table" size={18} /><span>{t.musicReport.tab}</span><Icon name="chevron" size={18} /></a></li>
			{/if}
		</ul>
	</section>
	{#if data.program.groups.some((group) => group.drive && group.items.length)}
		<!-- "01 | Aktuelles Programm" for each orchestra, kept here so the overview stays the programme itself. -->
		<section class="block">
			<h2 class="ui-label">{t.currentProgram.title}</h2>
			{#each data.program.groups as group (group.orchestra)}
				{#if group.drive && group.items.length}{@render driveCard(group, several ? group.label : t.currentProgram.title)}{/if}
			{/each}
		</section>
	{/if}
{/if}

{#if data.kind === 'event' && (data.tickets?.doorUrl || data.tickets?.manageUrl)}
	<!-- For those who run the sale and the door, in either view: on the evening it's the first thing they need. -->
	<section class="block">
		<h2 class="ui-label">{t.tickets.title}</h2>
		<ul class="ui-list tools">
			{#if data.tickets.doorUrl}
				<li><a href={data.tickets.doorUrl}><Icon name="check" size={18} /><span>{t.tickets.door}<small>{t.tickets.doorHint}</small></span><Icon name="chevron" size={18} /></a></li>
			{/if}
			{#if data.tickets.manageUrl}
				<li><a href={data.tickets.manageUrl}><Icon name="list" size={18} /><span>{t.tickets.manage}<small>{t.tickets.manageHint}</small></span><Icon name="chevron" size={18} /></a></li>
			{/if}
		</ul>
	</section>
{/if}

{#if planner && data.program.partnerForm}
	{@const partnerForm = data.program.partnerForm}
	<!-- Concerts with other choirs and orchestras: kept in "Konzerte", the details in "Ensembles". -->
	<section class="block">
		<h2 class="ui-label">{t.partners.title}</h2>
		<form class="partners" method="POST" action="?/partners" use:enhance={partnersSave.submit()}>
			<p class="details-hint">{t.partners.lead}</p>
			{#if partnerForm.orchestras.length}
				<input type="hidden" name="ours" value="1" />
				<fieldset>
					<legend>{t.partners.ours}</legend>
					{#each partnerForm.orchestras as name (name)}
						<label class="pick">
							<input type="checkbox" name="orchestra" value={name} checked={partnerForm.ours.includes(name)} />{name}
						</label>
					{/each}
				</fieldset>
			{/if}
			{#if partnerForm.ensembles.length}
				<fieldset>
					<legend>{t.partners.known}</legend>
					{#each partnerForm.ensembles as ensemble (ensemble.shortName)}
						<label class="pick">
							<input type="checkbox" name="partner" value={ensemble.shortName} checked={partnerForm.chosen.includes(ensemble.shortName)} />
							{ensemble.name}{#if ensemble.shortName !== ensemble.name}<span class="muted">{ensemble.shortName}</span>{/if}
						</label>
					{/each}
				</fieldset>
			{/if}
			<label class="field">
				<span>{partnerForm.ensembles.length ? t.partners.others : t.partners.over}</span>
				<input name="others" maxlength="200" value={partnerForm.others} autocomplete="off" />
				<small>{t.partners.othersHint} <a href="/ensembles">{t.ensembles.manage}</a></small>
			</label>
			<label class="field">
				<span>{t.partners.organizer}</span>
				<select name="organizer">
					<option value="" selected={!partnerForm.organizer}>{t.partners.us(partnerForm.us)}</option>
					{#each partnerForm.ensembles as ensemble (ensemble.shortName)}
						<option value={ensemble.shortName} selected={partnerForm.organizer === ensemble.shortName}>{ensemble.name}</option>
					{/each}
					{#if partnerForm.organizer && !partnerForm.ensembles.some((e) => e.shortName === partnerForm.organizer)}
						<option value={partnerForm.organizer} selected>{partnerForm.organizer}</option>
					{/if}
				</select>
				<small>{t.partners.organizerHint}</small>
			</label>
			{#if form?.partnersError}<p class="msg error" role="alert">{form.partnersError}</p>{/if}
			<div class="details-actions">
				<button class="btn small" disabled={partnersSave.busy}>{t.partners.save}</button>
				{#if form?.partnersSaved}<span class="saved-inline" role="status"><Icon name="check" size={16} />{t.partners.saved}</span>{/if}
			</div>
		</form>
	</section>
{/if}

{#if planner && data.program.published !== null}
	<!-- In the public feed the orchestra's website reads (#197): a switch, saved at once. Planning, not what members come for. -->
	<section class="block">
		<h2 class="ui-label">{t.concert.publish.title}</h2>
		<form class="publish" method="POST" action="?/publish" use:enhance={publishSave.submit()}>
			<input type="hidden" name="published" value={data.program.published ? '' : 'on'} />
			<span class="publish-state" class:on={data.program.published}>
				<Icon name="globe" size={16} />
				{data.program.published ? t.concert.publish.on : t.concert.publish.off}
			</span>
			<button class="btn small secondary" disabled={publishSave.busy}>{data.program.published ? t.concert.publish.withdraw : t.concert.publish.publish}</button>
		</form>
		{#if data.program.published && data.program.publicDetails}
			{@const details = data.program.publicDetails}
			<!-- What the website shows with it; folded, since most concerts need only the switch. -->
			<details class="ui-disclosure public-details" open={!!(form?.publicDetailsError || form?.publicDetailsSaved)}>
				<summary>{t.concert.publish.details}</summary>
				<form method="POST" action="?/publicDetails" use:enhance={detailsSave.submit()}>
					<p class="details-hint">{t.concert.publish.detailsHint}</p>
					<div class="pair">
						<label class="field">
							<span>{t.concert.publish.textDe}</span>
							<textarea name="textDe" lang="de" maxlength="2000">{details.text?.de ?? ''}</textarea>
						</label>
						<label class="field">
							<span>{t.concert.publish.textEn}</span>
							<textarea name="textEn" lang="en" maxlength="2000">{details.text?.en ?? ''}</textarea>
						</label>
					</div>
					<label class="field">
						<span>{t.concert.publish.ticketUrl}</span>
						<input
							type="url"
							name="ticketUrl"
							inputmode="url"
							placeholder="https://"
							value={details.ticketUrl ?? ''}
							aria-invalid={form?.publicDetailsError ? 'true' : undefined}
							aria-describedby={form?.publicDetailsError ? 'ticket-error' : undefined}
						/>
					</label>
					{#if form?.publicDetailsError}<p class="msg error" id="ticket-error" role="alert">{form.publicDetailsError}</p>{/if}
					<div class="pair">
						<label class="field">
							<span>{t.concert.publish.ticketNoteDe}</span>
							<input name="ticketNoteDe" lang="de" maxlength="200" placeholder={t.concert.publish.ticketNotePlaceholder} value={details.ticketNote?.de ?? ''} />
						</label>
						<label class="field">
							<span>{t.concert.publish.ticketNoteEn}</span>
							<input name="ticketNoteEn" lang="en" maxlength="200" value={details.ticketNote?.en ?? ''} />
						</label>
					</div>
					<div class="details-actions">
						<button class="btn small" disabled={detailsSave.busy}>{t.concert.publish.save}</button>
						{#if form?.publicDetailsSaved}<span class="saved-inline" role="status"><Icon name="check" size={16} />{t.concert.publish.saved}</span>{/if}
					</div>
				</form>
			</details>
		{/if}
	</section>
{/if}

{#if overview}
{#if data.kind === 'event' && data.attendance?.kind === 'rehearsal'}
	<section class="block">
		<h2 class="ui-label">{t.attendance.title}</h2>
		{#if data.attendanceSaved}<p class="saved" role="status"><Icon name="check" size={16} />{t.attendance.saved}</p>{/if}
		{#if data.attendance.state === 'not-set-up'}
			<p class="placeholder">{t.attendance.notSetUp}</p>
		{:else}
			<a class="ui-card attendance-link" href={data.attendance.url}>
				<span class="icon"><Icon name="users" size={18} /></span>
				<span class="fact-body">
					<strong>{data.attendance.of ? t.attendance.present(data.attendance.present, data.attendance.of) : t.attendance.notTaken}</strong>
					<span>{data.attendance.of ? t.attendance.edit : t.attendance.take}</span>
				</span>
				<span class="trail"><Icon name="chevron" size={16} /></span>
			</a>
		{/if}
	</section>
{/if}

{#if isConcert}
	<section class="block">
		<div class="block-head">
			<h2 class="ui-label">{t.concert.program}</h2>
			<div class="ui-actions">
				{#if data.program.items.length}
					<a href="/kalender/{id}/drucken"><Icon name="print" size={16} />{t.print.link}</a>
					{#if data.program.canPrintSet}<a href="/kalender/{id}/stimmensatz"><Icon name="file" size={16} />{t.partSet.link}</a>{/if}
				{/if}
				{#if data.program.canEdit && !several && inlineTools}
					<a href={data.program.groups[0].editUrl}><Icon name="edit" size={16} />{t.editor.edit}</a>
				{/if}
			</div>
		</div>
		{#if data.program.saved}<p class="saved" role="status"><Icon name="check" size={16} />{t.editor.saved}</p>{/if}
		{#if data.program.driveAuto === 'ok'}<p class="saved" role="status"><Icon name="folder" size={16} />{t.currentProgram.autoDone}</p>{/if}
		{#if data.program.driveAuto === 'fehler'}<p class="saved warn" role="status"><Icon name="alert" size={16} />{t.currentProgram.autoFailed}</p>{/if}
		{#if data.program.sharedFrom}
			<p class="note">
				<Icon name="link" size={16} />
				<span>{t.concert.sharedFrom} <a href="/kalender/{encodeURIComponent(data.program.sharedFrom.id)}">{data.program.sharedFrom.title}</a></span>
			</p>
		{:else if data.program.sharedWith.length}
			<p class="note">
				<Icon name="link" size={16} />
				<span>
					{t.concert.sharedWith}
					{#each data.program.sharedWith as other, i (other.id)}{i ? ', ' : ' '}<a href="/kalender/{encodeURIComponent(other.id)}">{other.title}</a>{/each}
				</span>
			</p>
		{/if}
		{#if data.program.canEdit && data.program.suggestions && inlineTools}
			<p class="note">
				<Icon name="bulb" size={16} />
				<a href="/kalender/{id}/programm">{t.editor.openSuggestions(data.program.suggestions)}</a>
			</p>
		{/if}
		{#each data.program.groups as group (group.orchestra)}
			<!-- Several orchestras: each programme under its own heading, edited on its own. -->
			{#if several}
				<div class="group-head" class:joint={group.joint}>
					<h3>{#if group.joint}<Icon name="link" size={16} />{/if}{group.label}</h3>
					{#if data.program.canEdit && inlineTools}
						<a href={group.editUrl}><Icon name="edit" size={16} />{t.editor.edit}</a>
					{/if}
				</div>
			{/if}
			{#if group.items.length}
				<ProgramList items={group.items} total />
				{#if group.drive && inlineTools}{@render driveCard(group, t.currentProgram.title)}{/if}
			{:else}
				<p class="placeholder">{data.program.sheet === 'ok' ? t.concert.programEmpty : t.concert.programNoSheet}</p>
			{/if}
		{/each}
		{#if data.program.canEdit && data.program.jointUrl && inlineTools}
			<!-- Nothing played together yet: one click to the editor's tab for it. -->
			<a class="add-joint" href={data.program.jointUrl}><Icon name="link" size={16} />{t.editor.addJoint(data.program.jointNames)}</a>
		{/if}
		<!-- Where it's kept only matters to those who keep it. -->
		{#if data.program.canEdit && data.program.items.length && inlineTools}<p class="hint">{t.concert.programHint}</p>{/if}
	</section>
{/if}

{#if data.kind === 'event' && isConcert}
	<section class="block">
		<div class="block-head">
			<h2 class="ui-label">{t.concert.rehearsals}</h2>
			{#if (data.rehearsalPlan.editUrl || data.addRehearsalUrl) && inlineTools}
				<div class="ui-actions">
					{#if data.addRehearsalUrl}<a href={data.addRehearsalUrl}><Icon name="plus" size={16} />{t.concert.addRehearsal}</a>{/if}
					{#if data.rehearsalPlan.editUrl}<a href={data.rehearsalPlan.editUrl}><Icon name="edit" size={16} />{t.rehearsalPlan.edit}</a>{/if}
				</div>
			{/if}
		</div>
		{#if page.url.searchParams.has('probenplan')}<p class="saved" role="status"><Icon name="check" size={16} />{t.rehearsalPlan.saved}</p>{/if}
		{#if data.rehearsals.length}
			{@const upcoming = data.rehearsals.filter((r) => !r.past)}
			<!-- Before the concert, past rehearsals fold away so the next ones come first. -->
			{@const folded = upcoming.length ? data.rehearsals.filter((r) => r.past) : []}
			{#snippet rehearsalList(list: typeof data.rehearsals)}
				<ul class="ui-list">
					{#each list as rehearsal (rehearsal.id)}
						<li>
							<EventRow event={rehearsal} />
							{#if rehearsal.planned.length}
								<!-- What's on, each piece one tap away. -->
								<ul class="planned" aria-label={t.rehearsalPlan.title}>
									{#each rehearsal.planned as item, i (i)}
										<li>
											{#if item.pieceId}
												<a class="chip" href="/stuecke/{encodeURIComponent(item.pieceId)}">{item.title}</a>
											{:else}
												<span class="chip">{item.title}</span>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			{/snippet}
			{#if folded.length}
				<details class="past-rehearsals">
					<summary><Icon name="chevron" size={16} />{t.concert.pastRehearsals(folded.length)}</summary>
					{@render rehearsalList(folded)}
				</details>
			{/if}
			{@render rehearsalList(folded.length ? upcoming : data.rehearsals)}
		{:else}
			<p class="placeholder">{t.concert.noRehearsals}</p>
		{/if}
		{#if data.attendance?.kind === 'concert' && data.attendance.mine}
			<p class="note mine"><Icon name="users" size={16} /><span>{t.attendance.mine(data.attendance.mine.present, data.attendance.mine.of)}</span></p>
		{/if}
	</section>
{:else if data.kind === 'event' && showPlan}
	<section class="block">
		<div class="block-head">
			<h2 class="ui-label">{t.rehearsalPlan.title}</h2>
			{#if data.rehearsalPlan.editUrl}
				<div class="ui-actions">
					<a href={data.rehearsalPlan.editUrl}><Icon name="edit" size={16} />{t.rehearsalPlan.edit}</a>
				</div>
			{/if}
		</div>
		{#if data.rehearsalPlan.items.length}
			<ProgramList items={data.rehearsalPlan.items} total />
		{:else}
			<p class="placeholder">{t.rehearsalPlan.empty}</p>
		{/if}
	</section>
{/if}

{#if data.kind === 'event' && data.rehearsalNote}
	<RehearsalNote data={data.rehearsalNote} result={form} />
{/if}

{/if}

{#if planner && data.kind === 'event' && data.attendance?.kind === 'concert' && data.attendance.table}
	{@const summary = data.attendance}
	<section class="block">
		<h2 class="ui-label">{t.attendance.overview}</h2>
		{#if summary.table}
			<div class="ui-card attendance">
				<p class="hint">{t.attendance.overviewLead(summary.taken)} {t.attendance.overviewHint}</p>
				<div class="scroll">
					<table>
						<thead>
							<tr>
								<th>{t.attendance.person}</th>
								<th>{t.attendance.total}</th>
								{#each summary.table.columns as column, i (i)}<th title={column}><span>{column}</span></th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each summary.table.rows as row, r (r)}
								<tr>
									<td>{row.name}</td>
									<td class="count" class:low={row.of && row.present / row.of < 0.5}>{t.attendance.count(row.present, row.of)}</td>
									{#each row.pieces as cell, i (i)}
										<td class="count" class:low={cell && cell.of && cell.present === 0}>{cell ? t.attendance.count(cell.present, cell.of) : '–'}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>
{/if}

{#if planner && isConcert && data.program.instrumentation}
	<InstrumentationMatrix {...data.program.instrumentation} />
{/if}

{#snippet driveCard(group: (typeof data.program.groups)[number], heading: string)}
	{#if group.drive}
		{@const drive = group.drive}
		{@const mine = form?.currentProgramOrchestra === group.orchestra}
		{@const result = mine ? form?.currentProgram : undefined}
		<!-- "01 | Aktuelles Programm" (#60): how far the folder matches, and one button to make it match. -->
		<form
			class="ui-card drive"
			method="POST"
			action="?/currentProgram"
			use:enhance={() => {
				syncing = group.orchestra;
				return async ({ update }) => {
					await update({ reset: false });
					syncing = null;
				};
			}}
		>
			<input type="hidden" name="orchestra" value={group.orchestra} />
			<span class="icon" class:done={result || (drive.program && drive.linked === drive.total && !drive.extra.length)}><Icon name="folder" size={18} /></span>
			<span class="fact-body">
				<strong>{heading}</strong>
				<span>
					{#if result}
						{t.currentProgram.done(result.added.length, result.removed.length)}{#if result.removed.length}{' '}{t.currentProgram.removedHint}{/if}{#if result.stuck.length}{' '}{t.currentProgram.stuck(result.stuck)}{/if}
					{:else if !drive.program}
						{t.currentProgram.noFolder(drive.orchestra)}
					{:else if drive.linked === drive.total && !drive.extra.length}
						{t.currentProgram.complete(drive.total, drive.program)}
					{:else}
						{t.currentProgram.partly(drive.linked, drive.total, drive.program)}{#if drive.extra.length}{' '}{t.currentProgram.extra(drive.extra.length)}{/if}
					{/if}
					{#if !drive.next}· {t.currentProgram.notNext}{/if}
				</span>
				{#if mine && form?.currentProgramError}<span class="drive-error" role="alert">{form.currentProgramError}</span>{/if}
			</span>
			{#if result}<a class="open" href={result.folderUrl} target="_blank" rel="noopener noreferrer">{t.currentProgram.open}<Icon name="external" size={14} /></a>{/if}
			<button class="btn small secondary" disabled={syncing !== null}><Icon name="refresh" size={16} />{t.currentProgram.sync}</button>
		</form>
	{/if}
{/snippet}

<style>
	.edit {
		margin-bottom: var(--space-4);
	}

	.edit-saved {
		margin-bottom: var(--space-4);
	}

	.head {
		--tone: color-mix(in oklab, var(--ok) 80%, var(--text));
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-areas: 'tile text' 'actions actions';
		align-items: center;
		gap: var(--space-2) var(--space-4);
		margin-bottom: var(--space-5);
	}

	.head.konzert {
		--tone: var(--accent);
	}

	.head.generalprobe {
		--tone: var(--warn);
	}

	.head-text {
		grid-area: text;
		display: grid;
		justify-items: start;
		gap: var(--space-1);
		min-width: 0;
	}

	/* An archive concert has no tile: its text takes the whole row. */
	.head-text:first-child {
		grid-column: 1 / -1;
	}

	.head h1 {
		overflow-wrap: anywhere;
		text-wrap: balance;
	}

	.head h1 .keep {
		white-space: nowrap;
	}

	.when {
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	.tile {
		grid-area: tile;
		display: grid;
		justify-items: center;
		align-self: start;
		width: 68px;
		padding: var(--space-2) 0;
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--tone) 12%, transparent);
		color: var(--tone);
		line-height: 1.1;
	}

	.head.konzert:not(.past) .tile {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	/* Over: a quieter tile, still readable. */
	.head.past {
		--tone: var(--text-muted);
	}

	.tile .weekday,
	.tile .month {
		font-size: var(--text-2xs);
		font-weight: 650;
		text-transform: uppercase;
	}

	.tile .day {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: 600;
	}

	@media (max-width: 480px) {
		.tile {
			width: 56px;
		}

		.tile .day {
			font-size: var(--text-2xl);
		}
	}

	.when .type {
		font-weight: 600;
	}

	.head.konzert .when .type {
		color: var(--accent);
	}

	.head.generalprobe .when .type {
		color: var(--warn);
	}

	.tentative {
		display: inline-block;
		margin-left: var(--space-2);
		padding: 0 8px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.relative {
		color: var(--text);
		font-weight: 600;
	}

	.views {
		margin-bottom: var(--space-5);
	}

	.tools a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 52px;
		padding: var(--space-2) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	.tools a:hover {
		background: var(--surface-2);
	}

	.tools a > :global(svg:first-child) {
		color: var(--accent);
	}

	.tools a > :global(svg:last-child) {
		color: var(--text-muted);
	}

	.tools span {
		display: grid;
		flex: 1;
		font-weight: 600;
	}

	.tools small {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.note.mine {
		margin-top: var(--space-3);
	}

	.head-actions {
		grid-area: actions;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
		margin-top: var(--space-2);
	}

	.check {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.check summary {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		cursor: pointer;
		list-style: none;
	}

	.check summary::-webkit-details-marker {
		display: none;
	}

	.check-icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-control);
		background: color-mix(in oklab, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.check-icon.done {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.check-title {
		display: grid;
		line-height: 1.35;
	}

	.check-title span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.check ul {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0 var(--space-4) var(--space-4) calc(34px + var(--space-3) + var(--space-4));
		list-style: none;
	}

	.check li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--text-md);
	}

	.check li :global(svg) {
		flex: none;
		margin-top: 3px;
		color: var(--warn);
	}

	.check li.ok {
		color: var(--text-muted);
	}

	.check li.ok :global(svg) {
		color: var(--ok);
	}

	.check a {
		color: var(--accent);
		font-weight: 600;
	}

	@media (max-width: 480px) {
		.check ul {
			padding-left: var(--space-4);
		}
	}

	.attendance-link {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.attendance-link:hover {
		background: var(--surface-2);
	}

	.attendance {
		padding: var(--space-4);
	}

	.attendance .hint {
		margin: 0 0 var(--space-3);
	}

	.scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: var(--space-2);
		border-bottom: 1px solid var(--hairline);
		text-align: left;
		white-space: nowrap;
	}

	th {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
	}

	th span {
		display: inline-block;
		max-width: 9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: bottom;
	}

	td.count {
		font-variant-numeric: tabular-nums;
	}

	td.low {
		color: var(--danger);
		font-weight: 600;
	}

	.facts {
		margin-bottom: var(--space-6);
	}

	.fact {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 60px;
		padding: var(--space-3) var(--space-4);
		transition: background var(--fast) var(--ease);
	}

	a.fact:hover {
		background: var(--surface-2);
	}

	.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-control);
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.icon.concert {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.fact-body {
		display: grid;
		flex: 1;
		min-width: 0;
		line-height: 1.35;
	}

	.fact-body strong {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.fact-body span {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.fact-body .over {
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	/* A longer note: the icon stays by its first line. */
	.fact.top {
		align-items: flex-start;
	}

	.fact-body .description {
		margin-top: 2px;
		color: var(--text);
		font-size: var(--text-md);
	}

	.trail {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	a.fact:hover .trail {
		color: var(--accent);
	}

	.block {
		margin-bottom: var(--space-6);
	}

	.block-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0 var(--space-3);
	}

	.block-head .ui-actions {
		margin-bottom: var(--space-2);
	}

	.description {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.placeholder {
		padding: var(--space-4) var(--space-5);
		border: 1px dashed var(--border);
		border-radius: var(--radius-l);
		color: var(--text-muted);
	}

	.hint {
		margin: var(--space-2) var(--space-1) 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.saved.warn {
		background: color-mix(in oklab, var(--warn) 14%, transparent);
	}

	.group-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0 var(--space-3);
		margin: var(--space-5) 0 var(--space-2);
	}

	.group-head:first-of-type {
		margin-top: var(--space-2);
	}

	.group-head h3 {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-base);
	}

	/* Played together: set apart in the accent colour, so it reads as its own part of the evening. */
	.group-head.joint h3 {
		color: var(--accent);
	}

	.add-joint {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-4);
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--border);
		border-radius: var(--radius-m);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.add-joint:hover {
		border-color: var(--accent);
	}

	.group-head a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.drive {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.ui-label + .drive {
		margin-top: 0;
	}

	/* On a phone the status reads across the card and the button drops below it. */
	.drive .fact-body {
		flex-basis: 14rem;
	}

	.drive .icon.done {
		background: color-mix(in oklab, var(--ok) 14%, transparent);
		color: var(--ok);
	}

	.drive .open {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.orchestra-edit {
		padding: 0 var(--space-4) var(--space-3) calc(var(--space-4) + 34px + var(--space-3));
		font-size: var(--text-sm);
	}

	.orchestra-edit summary {
		width: fit-content;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
	}

	.orchestra-edit form {
		display: grid;
		justify-items: start;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.orchestra-edit fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.orchestra-edit .check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		cursor: pointer;
	}

	.orchestra-edit .check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.orchestra-edit .hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.orchestra-saved {
		margin: 0 var(--space-4) var(--space-3);
	}

	.fact-body .drive-error {
		color: var(--danger);
	}

	.saved {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--ok) 12%, transparent);
	}

	.publish {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		margin: 0 0 var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
	}

	.publish-state {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.publish-state.on {
		color: var(--text);
		font-weight: 600;
	}

	.publish-state.on :global(svg) {
		color: var(--ok);
	}

	.partners {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		font-size: var(--text-sm);
	}

	.partners fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.partners legend {
		margin-bottom: var(--space-1);
		font-weight: 600;
	}

	.pick {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		cursor: pointer;
	}

	.pick input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.pick .muted {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.partners small {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.fact-body a {
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--border);
		text-underline-offset: 3px;
	}

	.public-details {
		margin: 0 0 var(--space-3);
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		font-size: var(--text-sm);
	}

	.public-details form {
		display: grid;
		gap: var(--space-3);
		padding-bottom: var(--space-3);
	}

	.details-hint {
		margin: 0;
		color: var(--text-muted);
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--space-3);
	}

	.details-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.saved-inline {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--ok);
		font-weight: 600;
	}

	.note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-3) var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	.note :global(svg) {
		flex: none;
		color: var(--accent);
	}

	.note a {
		color: var(--accent);
		font-weight: 600;
	}

	/* Indented to line up with the rehearsal's title, past its date tile. */
	.past-rehearsals {
		margin-bottom: var(--space-3);
	}

	.past-rehearsals summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 32px;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}

	.past-rehearsals summary::-webkit-details-marker {
		display: none;
	}

	.past-rehearsals summary :global(svg) {
		transition: transform var(--fast) var(--ease);
	}

	.past-rehearsals[open] summary :global(svg) {
		transform: rotate(90deg);
	}

	.past-rehearsals[open] {
		margin-bottom: var(--space-4);
		opacity: 0.85;
	}

	.planned {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: calc(-1 * var(--space-2)) 0 0;
		padding: 0 var(--space-4) var(--space-3) calc(52px + 2 * var(--space-4));
		list-style: none;
	}

	.chip {
		display: inline-block;
		max-width: 100%;
		padding: 3px 10px;
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--text-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	a.chip:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}

	@media (max-width: 480px) {
		.planned {
			padding-left: var(--space-4);
		}
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { formatDays, formatWeekday, TRIP_ROLES } from '#lib/trips/trips.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';
	import TripForm from '#lib/components/TripForm.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const trip = $derived(data.trip);
	const day = (iso: string) => formatWeekday(iso, config.locale);
	const going = $derived(data.mine?.status === 'angemeldet' || data.mine?.status === 'warteliste');
	const confirm = (question: string) => (event: SubmitEvent) => {
		if (!window.confirm(question)) event.preventDefault();
	};
</script>

<Title title={trip.title} />

<a class="back" href="/fahrten"><Icon name="back" size={16} />{t.trips.all}</a>

<header class="head">
	{#if trip.picture}
		<!-- A sight of the place, from Wikimedia Commons, served by the app itself. -->
		<figure class="hero">
			<img src="/fahrten/{trip.id}/bild" alt={t.trips.picture.alt(trip.picture.title)} />
			<div class="overlay">
				<p class="over">{t.trips.kinds[trip.kind]}</p>
				<h1>{trip.title}</h1>
				<p class="when">{formatDays(trip.firstDay, trip.lastDay, config.locale)}</p>
			</div>
			<figcaption><a href={trip.picture.page} target="_blank" rel="noopener noreferrer">{trip.picture.title} · {t.trips.picture.credit(trip.picture.artist, trip.picture.license)}</a></figcaption>
		</figure>
	{:else}
		<p class="over">{t.trips.kinds[trip.kind]}</p>
		<h1>{trip.title}</h1>
		<p class="when">{formatDays(trip.firstDay, trip.lastDay, config.locale)}</p>
	{/if}
	{#if trip.stops.length}
		<ul class="stops">
			{#each trip.stops as stop (stop.place + stop.from)}
				<li><Icon name="pin" size={14} /><span>{stop.place}</span>{#if stop.from !== trip.firstDay || stop.until !== trip.lastDay}<span class="muted"> · {formatDays(stop.from, stop.until, config.locale)}</span>{/if}</li>
			{/each}
		</ul>
	{/if}
	<p class="meta">
		{t.trips.forOrchestras}: {trip.orchestras.length ? trip.orchestras.join(', ') : t.trips.allOrchestras}
		{#if trip.organiserNames.length}· {t.trips.organisedBy}: {trip.organiserNames.join(', ')}{/if}
		{#if trip.signupUntil && data.open}· {t.trips.until(day(trip.signupUntil))}{/if}
	</p>
	{#if trip.note}<p class="note">{trip.note}</p>{/if}
</header>

{#if data.saved}<p class="msg ok" role="status"><Icon name="check" size={16} />{t.trips.signup.saved}</p>{/if}
{#if form?.error}<p class="msg error" role="alert">{form.error}</p>{/if}

{#if data.inside}
	<a class="ui-card plan-link" href="/fahrten/{trip.id}/plan">
		<span class="badge"><Icon name="calendar" size={22} /></span>
		<span class="body"><strong>{t.trips.plan}</strong><span class="muted">{t.trips.planLead}</span></span>
		<Icon name="chevron" size={16} />
	</a>
{/if}

<!-- The lists (step 2): your own and your children's, and for those who read them, everyone's. -->
{#each data.myLists as lists (lists.fuer)}
	<a class="ui-card plan-link" href="/fahrten/{trip.id}/listen{lists.fuer ? `?fuer=${lists.fuer}` : ''}">
		<span class="badge" class:todo={lists.filled < lists.of}><Icon name="list" size={22} /></span>
		<span class="body">
			<strong>{lists.fuer ? t.trips.lists.titleFor(lists.name) : t.trips.lists.yours}</strong>
			<span class="muted">{t.trips.lists.progress(lists.filled, lists.of)}</span>
		</span>
		<Icon name="chevron" size={16} />
	</a>
{/each}
{#if data.listProgress?.length}
	{@const missing = data.listProgress.reduce((sum, one) => sum + one.of - one.filled, 0)}
	<a class="ui-card plan-link" href="/fahrten/{trip.id}/auswertung">
		<span class="badge"><Icon name="table" size={22} /></span>
		<span class="body">
			<strong>{t.trips.lists.evaluate}</strong>
			<span class="muted">{t.trips.lists.evaluateLead}</span>
			<span class="mini">
				{#each data.listProgress as one (one.kind)}
					<span class="tag" class:warn={one.filled < one.of}>{t.trips.lists.kinds[one.kind]} {one.filled}/{one.of}</span>
				{/each}
			</span>
			{#if !missing}<span class="muted">{t.trips.lists.overview.complete}</span>{/if}
		</span>
		<Icon name="chevron" size={16} />
	</a>
{/if}

<!-- Your own sign-up: not for admin or parent logins, which never come along themselves. -->
{#if data.canJoin}
	<section class="ui-card section">
		<h2>{t.trips.signup.title}</h2>
		{#if data.mine?.status === 'angemeldet'}
			<p class="state go"><Icon name="check" size={16} />{t.trips.signup.signedUp}</p>
		{:else if data.mine?.status === 'warteliste'}
			<p class="state">{t.trips.signup.waiting(data.mine.waitPlace)}</p>
		{:else if data.mine?.status === 'abgemeldet'}
			<p class="state">{t.trips.signup.cancelled}</p>
		{/if}
		{#if data.mine?.parentPending}<p class="msg info">{t.trips.signup.waitsForParent}</p>{/if}

		{#if !data.open}
			<p class="muted">{t.trips.signup.closed}</p>
		{:else}
			{#if data.full && !going}<p class="msg info">{t.trips.signup.full}</p>{/if}
			<form method="POST" action="?/signup" class="signup" use:enhance={saving.submit()}>
				<!-- One or more: a parent can come along as Begleitperson and play in the orchestra too.
				     Young members come as Musiker·in only, so they get no choice. -->
				{#if data.roles.length === 1}
					<input type="hidden" name="role" value={data.roles[0]} />
				{:else}
				<fieldset class="roles-pick">
					<legend>{t.trips.signup.role}</legend>
					<p class="hint">{t.trips.signup.roleHint}</p>
					{#each data.roles as role (role)}
						<label class="chip"><input type="checkbox" name="role" value={role} checked={(data.mine?.roles ?? ['musiker']).includes(role)} /><span>{t.trips.roles[role]}</span></label>
					{/each}
				</fieldset>
				{/if}
				{#if !data.young}
				<div class="row">
					<label class="field">{t.trips.signup.arrival}<input type="date" name="arrival" min={trip.firstDay} max={trip.lastDay} value={going ? (data.mine?.arrival ?? '') : ''} /></label>
					<label class="field">{t.trips.signup.departure}<input type="date" name="departure" min={trip.firstDay} max={trip.lastDay} value={going ? (data.mine?.departure ?? '') : ''} /></label>
				</div>
				{/if}
				<label class="field">
					{t.trips.signup.note}
					<textarea name="note" rows="2" maxlength="2000" aria-describedby="note-hint">{going ? (data.mine?.note ?? '') : ''}</textarea>
				</label>
				<p class="hint" id="note-hint">{t.trips.signup.noteHint}</p>
				<div class="actions">
					<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{going ? t.trips.signup.update : t.trips.signup.go}</button>
					{#if data.mine?.status !== 'abgemeldet'}
						<button class="btn secondary" formaction="?/decline" disabled={saving.busy}>{going ? t.trips.signup.cancel : t.trips.signup.decline}</button>
					{/if}
				</div>
			</form>
		{/if}
	</section>
{/if}

<!-- A parent's children (#299): confirm or withdraw their sign-up. -->
{#if data.children.length}
	<section class="ui-card section">
		<h2>{t.trips.parent.title}</h2>
		<p class="muted">{t.trips.parent.lead}</p>
		<ul class="people">
			{#each data.children as child (child.email)}
				<li>
					<span class="name">{child.name}</span>
					{#if child.status === 'angemeldet' || child.status === 'warteliste'}
						<span class="muted">{t.trips.parent.status[child.status]} · {child.confirmedAt ? t.trips.parent.confirmed(day(child.confirmedAt)) : t.trips.parent.waiting}</span>
						<span class="row-actions">
							{#if !child.confirmedAt}
								<form method="POST" action="?/confirmChild" use:enhance={saving.submit()}>
									<input type="hidden" name="child" value={child.email} />
									<button class="btn small" disabled={saving.busy}><Icon name="check" size={14} />{t.trips.parent.confirm}</button>
								</form>
							{/if}
							<form method="POST" action="?/withdrawChild" use:enhance={saving.submit()}>
								<input type="hidden" name="child" value={child.email} />
								<button class="btn small secondary" disabled={saving.busy}>{t.trips.parent.withdraw}</button>
							</form>
						</span>
					{:else}
						<span class="muted">{t.trips.parent.notSignedUp}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<!-- The concerts and rehearsals of the trip: they stay normal calendar dates and know their trip. -->
{#if data.attached.length || data.organises}
	<section class="ui-card section">
		<h2>{t.trips.events.title}</h2>
		<p class="muted">{t.trips.events.lead}</p>
		{#if data.attached.length}
			<ul class="events">
				{#each data.attached as event (event.id)}
					<li>
						<a href="/kalender/{event.id}">
							<Icon name={event.type === 'konzert' ? 'music' : 'calendar'} size={16} />
							<span class="name">{event.title}</span>
							<span class="muted">{[day(event.day), event.start].filter(Boolean).join(' · ')}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{t.trips.events.none}</p>
		{/if}
		{#if data.organises}
			<details class="pick">
				<summary>{t.trips.events.pick}</summary>
				{#if data.pickable.length}
					<form method="POST" action="?/events" use:enhance={saving.submit()}>
						{#each data.pickable as event (event.id)}
							<label class="check">
								<input type="checkbox" name="event" value={event.id} checked={event.attached} />
								<span>{event.title}</span>
								<span class="muted">{[day(event.day), event.start].filter(Boolean).join(' · ')}</span>
							</label>
						{/each}
						<div><button class="btn small" disabled={saving.busy}>{t.trips.events.save}</button></div>
					</form>
				{:else}
					<p class="muted">{t.trips.events.noneInWindow}</p>
				{/if}
			</details>
		{/if}
	</section>
{/if}

{#if data.inside}
	<section class="ui-card section">
		<h2>{t.trips.participants.title}</h2>
		{#if data.overview}
			<p class="counts">
				{[
					t.trips.participants.signedUp(data.overview.signedUp) + (trip.cap ? ` / ${trip.cap}` : ''),
					...(data.overview.waiting ? [t.trips.participants.waiting(data.overview.waiting)] : []),
					...(data.overview.cancelled ? [t.trips.participants.cancelled(data.overview.cancelled)] : [])
				].join(' · ')}
			</p>
			<p class="roles">
				{#each TRIP_ROLES.filter((role) => data.overview?.byRole[role]) as role (role)}
					<span class="tag">{t.trips.roles[role]}: {data.overview.byRole[role]}</span>
				{/each}
			</p>
		{:else}
			<p class="hint">{t.trips.participants.visible}</p>
		{/if}

		{#snippet people(list: typeof data.signedUp, kind: 'in' | 'waiting' | 'out')}
			<ul class="people">
				{#each list as person (person.email)}
					<li>
						<span class="name">{person.name}</span>
						<span class="muted">
							{person.roles.map((role) => t.trips.roles[role]).join(', ')}
							{#if person.arrival}· {t.trips.participants.arrives(day(person.arrival))}{/if}
							{#if person.departure}· {t.trips.participants.leaves(day(person.departure))}{/if}
						</span>
						{#if person.parentPending && kind !== 'out'}<span class="tag warn">{t.trips.participants.parentPending}</span>{/if}
						{#if person.note}<span class="person-note">{person.note}</span>{/if}
						{#if data.organises}
							<span class="row-actions">
								{#if kind === 'waiting'}
									<form method="POST" action="?/moveUp" use:enhance={saving.submit()}>
										<input type="hidden" name="email" value={person.email} />
										<button class="btn small" disabled={saving.busy}>{t.trips.participants.moveUp}</button>
									</form>
								{/if}
								<form method="POST" action="?/removeParticipant" use:enhance={saving.submit()} onsubmit={confirm(t.trips.participants.removeConfirm(person.name))}>
									<input type="hidden" name="email" value={person.email} />
									<button class="icon-btn" aria-label="{t.trips.participants.remove}: {person.name}" title={t.trips.participants.remove} disabled={saving.busy}><Icon name="trash" size={16} /></button>
								</form>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/snippet}

		{#if data.signedUp.length}
			{@render people(data.signedUp, 'in')}
		{:else}
			<p class="muted">{t.trips.participants.none}</p>
		{/if}

		{#if data.overview}
			{#if data.waiting.length}
				<h3>{t.trips.participants.waitingList}</h3>
				{@render people(data.waiting, 'waiting')}
			{/if}
			{#if data.overview.awaitingParent.length}
				<h3>{t.trips.participants.awaitingParent}</h3>
				<p class="names">{data.overview.awaitingParent.join(', ')}</p>
			{/if}
			{#if data.overview.unanswered.length && data.open}
				<h3>{t.trips.participants.unanswered}</h3>
				<p class="names">{data.overview.unanswered.join(', ')}</p>
			{/if}
			{#if data.cancelled.length}
				<h3>{t.trips.participants.cancelledList}</h3>
				{@render people(data.cancelled, 'out')}
			{/if}
		{/if}
	</section>
{/if}

{#if data.organises}
	<details class="ui-card section edit" open={!!form?.editError}>
		<summary><Icon name="edit" size={16} />{t.trips.edit.open}</summary>
		{#if form?.edited}<p class="msg ok" role="status">{t.trips.edit.saved}</p>{/if}
		<TripForm {trip} orchestras={data.orchestras} action="?/update" submit={t.trips.edit.save} error={form?.editError} />
		<form method="POST" action="?/remove" class="danger" onsubmit={confirm(t.trips.edit.removeConfirm(trip.title))}>
			<button class="btn ghost danger-btn"><Icon name="trash" size={16} />{t.trips.edit.remove}</button>
		</form>
	</details>
{/if}

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

	.hero {
		position: relative;
		margin: 0 0 var(--space-2);
		overflow: hidden;
		border-radius: var(--radius-l);
		background: var(--surface-2);
		aspect-ratio: 16 / 7;
		min-height: 200px;
	}

	.hero img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* The title on the photo, on a shade that keeps it readable on any picture. */
	.hero .overlay {
		position: absolute;
		inset: auto 0 0;
		display: grid;
		gap: var(--space-1);
		padding: var(--space-6) var(--space-4) var(--space-5);
		background: linear-gradient(to top, rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.35) 60%, transparent);
		color: #fff;
	}

	.hero .over {
		color: #fff;
		opacity: 0.9;
	}

	.hero h1 {
		color: #fff;
		text-shadow: 0 1px 12px rgb(0 0 0 / 0.35);
	}

	.hero figcaption {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		max-width: calc(100% - 2 * var(--space-2));
		padding: 2px var(--space-2);
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: rgb(0 0 0 / 0.45);
		font-size: var(--text-2xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hero figcaption a {
		color: #fff;
	}

	.over {
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.when {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.stops {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.stops li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.meta,
	.muted,
	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		margin: calc(-1 * var(--space-2)) 0 0;
		font-size: var(--text-xs);
	}

	.note {
		white-space: pre-line;
	}

	.section {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		padding: var(--space-4);
	}

	.section h2 {
		font-size: var(--text-lg);
	}

	.section h3 {
		margin-top: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.plan-link {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		color: inherit;
	}

	.plan-link .body {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}

	.mini {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-1);
	}

	.badge.todo {
		background: color-mix(in oklab, var(--warn) 15%, transparent);
		color: var(--warn);
	}

	.badge {
		display: grid;
		place-items: center;
		flex: none;
		width: 42px;
		height: 42px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.state {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
	}

	.state.go {
		color: var(--accent);
	}

	.signup {
		display: grid;
		gap: var(--space-3);
	}

	.roles-pick {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.roles-pick legend {
		margin-bottom: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.roles-pick .hint {
		width: 100%;
		margin: 0;
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

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.row .field {
		flex: 1 1 180px;
	}

	.actions,
	.row-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.people,
	.events {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.people li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--hairline);
	}

	.people li:first-child {
		border-top: 0;
	}

	.people .name {
		font-weight: 600;
	}

	.people .row-actions {
		margin-left: auto;
	}

	.person-note {
		flex-basis: 100%;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-style: italic;
		white-space: pre-line;
	}

	.events a {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		padding: var(--space-2) 0;
		color: inherit;
	}

	.events .name {
		font-weight: 600;
	}

	.pick summary,
	.edit summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--accent);
		font-weight: 650;
		cursor: pointer;
	}

	.pick form {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.check {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-height: 40px;
	}

	.counts {
		font-weight: 600;
	}

	.roles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.tag {
		padding: 2px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.tag.warn {
		background: color-mix(in oklab, var(--warn) 15%, transparent);
		color: var(--warn);
	}

	.names {
		font-size: var(--text-sm);
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

	.danger {
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}

	.danger-btn {
		color: var(--danger);
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { config } from '#lib/config/index.ts';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import { formatEuros } from '#lib/trips/organising.ts';
	import { formatDays, formatWeekday, tripDays, TRIP_ROLES } from '#lib/trips/trips.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';
	import TripForm from '#lib/components/TripForm.svelte';
	import TripGlobe from '#lib/components/TripGlobe.svelte';
	import TripHero from '#lib/components/TripHero.svelte';

	let { data, form } = $props();
	const saving = new FormState();
	const trip = $derived(data.trip);
	const o = t.trips.organising;
	const day = (iso: string) => formatWeekday(iso, config.locale);
	// "Di., 8. Dez.": a day to tap when arriving later or leaving early.
	const shortDay = (iso: string) => new Intl.DateTimeFormat(config.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
	const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
	const days = $derived(tripDays(trip));
	// The places OpenStreetMap found, for the globe.
	const pinned = $derived(trip.where.flatMap((one, key) => (one.lat !== undefined && one.lon !== undefined ? [{ lat: one.lat, lon: one.lon, name: one.place, key }] : [])));
	// The place in focus, by its number: hovered or tapped in the route, or its pin tapped on the globe.
	// The globe turns to it and zooms in, and the header shows its picture.
	let focus = $state<number | null>(null);
	const focusPicture = $derived(focus === null ? null : (trip.where[focus]?.picture ?? -1));
	const hover = (key: number | null) => (event: PointerEvent) => {
		if (event.pointerType === 'mouse') focus = key;
	};
	const going = $derived(data.mine?.status === 'angemeldet' || data.mine?.status === 'warteliste');
	const confirm = (question: string) => (event: SubmitEvent) => {
		if (!window.confirm(question)) event.preventDefault();
	};
	// The day a later arrival or earlier departure is on; empty for the whole trip.
	let arrival = $state('');
	let departure = $state('');
	$effect.pre(() => {
		arrival = going ? (data.mine?.arrival ?? '') : '';
		departure = going ? (data.mine?.departure ?? '') : '';
	});
	// Until the first day, the day of the trip while it runs; nothing once it's over.
	const countdown = $derived.by(() => {
		const until = daysBetween(data.today, trip.firstDay);
		if (until > 0) return { num: String(until), label: t.trips.countdown.days(until) };
		if (until === 0) return { num: '', label: t.trips.countdown.today };
		const index = days.indexOf(data.today);
		return index >= 0 ? t.trips.countdown.running(index + 1, days.length) : null;
	});
	const missingLists = $derived(data.listProgress?.reduce((sum, one) => sum + one.of - one.filled, 0) ?? 0);
	const listsTotal = $derived(data.listProgress?.reduce((sum, one) => sum + one.of, 0) ?? 0);
</script>

<Title title={trip.title} />

<a class="back" href="/fahrten"><Icon name="back" size={16} />{t.trips.all}</a>

{#snippet heading()}
	<h1>{trip.title}</h1>
	<p class="when">
		<span>{formatDays(trip.firstDay, trip.lastDay, config.locale)}</span>
		<span class="sep" aria-hidden="true"></span>
		<span>{t.trips.dayCount(days.length)}</span>
		<span class="sep" aria-hidden="true"></span>
		<span>{t.trips.kinds[trip.kind]}</span>
	</p>
{/snippet}

<header class="head" class:plain={!trip.pictures.length}>
	{#if trip.pictures.length}
		<!-- A sight of each place, from Wikimedia Commons, served by the app itself, in turn. -->
		<TripHero tripId={trip.id} pictures={trip.pictures} focus={focusPicture !== null && focusPicture >= 0 ? focusPicture : null}>
			{@render heading()}
		</TripHero>
	{:else}
		{@render heading()}
	{/if}
</header>

{#if data.saved}<p class="msg ok top-msg" role="status"><Icon name="check" size={16} />{t.trips.signup.saved}</p>{/if}
{#if form?.error}<p class="msg error top-msg" role="alert">{form.error}</p>{/if}

<div class="layout">
	<!-- The facts at a glance: until when to answer, how many places, who's behind it. -->
	<dl class="facts ui-card">
		<!-- How long until it starts, or which day of the trip it is; nothing once it's over. -->
		{#if countdown}
			<p class="countdown">
				{#if countdown.num}<strong>{countdown.num}</strong>{/if}
				<span>{countdown.label}</span>
			</p>
		{/if}
		{#if trip.signupUntil || !data.open}
			<div>
				<dt>{t.trips.facts.signup}</dt>
				{#if data.open && trip.signupUntil}
					{@const left = daysBetween(data.today, trip.signupUntil)}
					<dd>{shortDay(trip.signupUntil)}</dd>
					<dd class="sub" class:soon={left <= 3}>{t.trips.facts.closes(left)}</dd>
				{:else}
					<dd>{t.trips.facts.closed}</dd>
				{/if}
			</div>
		{/if}
		<div>
			<dt>{t.trips.facts.seats}</dt>
			{#if trip.cap}
				<dd>{data.count} / {trip.cap}</dd>
				<dd class="sub">{t.trips.facts.left(trip.cap - data.count)}</dd>
				<dd class="bar" aria-hidden="true"><span style:width="{Math.min(100, (data.count / trip.cap) * 100)}%"></span></dd>
			{:else}
				<dd>{t.trips.signedUp(data.count)}</dd>
			{/if}
		</div>
		{#if trip.organiserNames.length}
			<div>
				<dt>{t.trips.organisedBy}</dt>
				<dd>{trip.organiserNames.join(', ')}</dd>
			</div>
		{/if}
		<div>
			<dt>{t.trips.forOrchestras}</dt>
			<dd>{trip.orchestras.length ? trip.orchestras.join(', ') : t.trips.allOrchestras}</dd>
		</div>
		{#if trip.note}<p class="note">{trip.note}</p>{/if}
	</dl>

	{#if trip.where.length}
		<!-- Where the trip goes: the earth with a pin in each place, and the places in their order. -->
		<section class="where ui-card" aria-label={t.trips.fields.stops}>
			{#if pinned.length}
				<div class="globe-box"><TripGlobe places={pinned} label={t.trips.where.globe(pinned.map((one) => one.name).join(', '))} bind:focus /></div>
			{/if}
			<!-- Pointing at a place or tapping it brings it into focus. -->
			<ol class="route" onpointerleave={hover(null)}>
				{#each trip.where as stop, i (stop.place + stop.from)}
					<li class:on={focus === i}>
						<span class="dot" aria-hidden="true"></span>
						<button type="button" class="stop" aria-pressed={focus === i} onpointerenter={hover(i)} onclick={() => (focus = focus === i ? null : i)} onfocus={() => (focus = i)}>
							<span class="stop-name">
								{#if stop.flag}<img class="flag" src={stop.flag} alt="" width="20" height="15" />{/if}
								<strong>{stop.place}</strong>
							</span>
							{#if stop.address}<span class="muted">{stop.address}</span>{/if}
							{#if stop.where}<span class="muted">{stop.where}</span>{/if}
						</button>
						<span class="stop-foot">
							{#if stop.from !== trip.firstDay || stop.until !== trip.lastDay}<span class="muted">{formatDays(stop.from, stop.until, config.locale)}</span>{/if}
							{#if stop.lat !== undefined && stop.lon !== undefined}
								<a href="https://www.openstreetmap.org/?mlat={stop.lat}&mlon={stop.lon}#map=15/{stop.lat}/{stop.lon}" target="_blank" rel="noopener noreferrer">{t.trips.where.map}<Icon name="external" size={12} /></a>
							{/if}
						</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<div class="main">
		<!-- Your own sign-up: not for admin or parent logins, which never come along themselves. -->
		{#if data.canJoin}
			{@const status = data.mine?.status}
			<section class="ui-card answer" aria-labelledby="answer-title">
				{#if status === 'angemeldet'}
					<p class="status ok" id="answer-title"><span class="status-icon"><Icon name="check" size={18} /></span>{t.trips.signup.signedUp}</p>
				{:else if status === 'warteliste'}
					<p class="status warn" id="answer-title"><span class="status-icon"><Icon name="clock" size={18} /></span>{t.trips.signup.waiting(data.mine?.waitPlace ?? 0)}</p>
				{:else if status === 'abgemeldet'}
					<p class="status out" id="answer-title"><span class="status-icon"><Icon name="x" size={18} /></span>{t.trips.signup.cancelled}</p>
				{:else}
					<h2 id="answer-title">{data.open ? t.trips.signup.ask : t.trips.signup.title}</h2>
				{/if}
				{#if data.mine?.parentPending}<p class="msg info">{t.trips.signup.waitsForParent}</p>{/if}

				{#if !data.open}
					<p class="muted">{t.trips.signup.closed}</p>
				{:else}
					{#if data.full && !going}<p class="msg info">{t.trips.signup.full}</p>{/if}
					{#snippet signupForm()}
						<form method="POST" action="?/signup" class="signup" use:enhance={saving.submit()}>
							<!-- One or more: a parent can come along as Begleitperson and play in the orchestra too.
							     Young members come as Musiker·in only, so they get no choice. -->
							{#if data.roles.length === 1}
								<input type="hidden" name="role" value={data.roles[0]} />
							{:else}
								<fieldset class="pick">
									<legend>{t.trips.signup.role}</legend>
									<p class="hint">{t.trips.signup.roleHint}</p>
									<div class="chips">
										{#each data.roles as role (role)}
											<label class="chip"><input type="checkbox" name="role" value={role} checked={(data.mine?.roles ?? ['musiker']).includes(role)} /><span><Icon name="check" size={14} />{t.trips.roles[role]}</span></label>
										{/each}
									</div>
								</fieldset>
							{/if}
							<!-- Later or earlier by a day of the trip, tapped rather than typed. -->
							{#if !data.young && days.length > 1}
								<fieldset class="pick">
									<legend>{t.trips.signup.arrival}</legend>
									<div class="chips">
										<label class="chip"><input type="radio" name="arrival" value="" bind:group={arrival} /><span>{t.trips.signup.fromStart}</span></label>
										{#each days.slice(1) as option (option)}
											<label class="chip"><input type="radio" name="arrival" value={option} bind:group={arrival} disabled={!!departure && option > departure} /><span>{shortDay(option)}</span></label>
										{/each}
									</div>
								</fieldset>
								<fieldset class="pick">
									<legend>{t.trips.signup.departure}</legend>
									<div class="chips">
										{#each days.slice(0, -1) as option (option)}
											<label class="chip"><input type="radio" name="departure" value={option} bind:group={departure} disabled={!!arrival && option < arrival} /><span>{shortDay(option)}</span></label>
										{/each}
										<label class="chip"><input type="radio" name="departure" value="" bind:group={departure} /><span>{t.trips.signup.toEnd}</span></label>
									</div>
								</fieldset>
							{/if}
							<label class="field">
								{t.trips.signup.note}
								<textarea name="note" rows="2" maxlength="2000" aria-describedby="note-hint">{going ? (data.mine?.note ?? '') : ''}</textarea>
								<span class="hint" id="note-hint">{t.trips.signup.noteHint}</span>
							</label>
							<div class="actions">
								<button class="btn" disabled={saving.busy}><Icon name="check" size={16} />{going ? t.trips.edit.save : t.trips.signup.go}</button>
								{#if status !== 'abgemeldet'}
									<button class="btn ghost" formaction="?/decline" disabled={saving.busy}>{going ? t.trips.signup.cancel : t.trips.signup.decline}</button>
								{/if}
							</div>
						</form>
					{/snippet}
					{#if status}
						<details class="ui-disclosure change" open={!!form?.error}>
							<summary>{t.trips.signup.update}</summary>
							{@render signupForm()}
						</details>
					{:else}
						{@render signupForm()}
					{/if}
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
							<Avatar name={child.name} size={36} />
							<span class="who">
								<span class="name">{child.name}</span>
								{#if child.status === 'angemeldet' || child.status === 'warteliste'}
									<span class="muted">{t.trips.parent.status[child.status]} · {child.confirmedAt ? t.trips.parent.confirmed(day(child.confirmedAt)) : t.trips.parent.waiting}</span>
								{:else}
									<span class="muted">{t.trips.parent.notSignedUp}</span>
								{/if}
							</span>
							{#if child.status === 'angemeldet' || child.status === 'warteliste'}
								<span class="row-actions">
									{#if !child.confirmedAt}
										<form method="POST" action="?/confirmChild" use:enhance={saving.submit()}>
											<input type="hidden" name="child" value={child.email} />
											<button class="btn small" disabled={saving.busy}><Icon name="check" size={14} />{t.trips.parent.confirm}</button>
										</form>
									{/if}
									<form method="POST" action="?/withdrawChild" use:enhance={saving.submit()}>
										<input type="hidden" name="child" value={child.email} />
										<button class="btn small ghost" disabled={saving.busy}>{t.trips.parent.withdraw}</button>
									</form>
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- What's settled for you (and your children): the bed, the rides, the fee. -->
		{#each data.arranged.filter((one) => one.room || one.rides.length || one.fee) as one (one.fuer)}
			<section class="ui-card section arranged">
				{#if data.arranged.length > 1 || one.fuer}<h2>{one.name}</h2>{/if}
				<dl>
					{#if one.room}
						<div>
							<dt><Icon name={one.room.kind === 'gastfamilie' ? 'home' : 'bed'} size={16} />{o.stays.yours}</dt>
							<dd>
								<strong>{one.room.name}</strong>
								{#if one.room.with.length}<span class="muted">{o.stays.with(one.room.with.join(', '))}</span>{/if}
								{#if one.room.note}<span class="muted pre">{one.room.note}</span>{/if}
							</dd>
						</div>
					{/if}
					{#each one.rides as ride (ride.leg)}
						<div>
							<dt><Icon name="bus" size={16} />{o.transport.yours(o.transport.legs[ride.leg])}</dt>
							<dd>
								<strong>{ride.name}</strong>
								{#each ride.pickups as pickup, i (i)}<span class="muted">{pickup.time ? `${pickup.time} ` : ''}{pickup.place}</span>{/each}
							</dd>
						</div>
					{/each}
					{#if one.fee}
						<div>
							<dt><Icon name="coins" size={16} />{o.costs.yours}</dt>
							<dd>
								<strong>{formatEuros(one.fee.amount, config.locale)}</strong>
								{#if one.fee.amount > 0}<span class:muted={!!one.fee.paidOn} class:open={!one.fee.paidOn}>{one.fee.paidOn ? o.costs.yourPaid(day(one.fee.paidOn)) : o.costs.yourOpen}</span>{/if}
							</dd>
						</div>
					{/if}
				</dl>
			</section>
		{/each}

		<!-- What there is to open: the plan, one's lists, and for those who read them, everyone's. -->
		{#if data.inside || data.myLists.length || data.listProgress?.length}
			<ul class="ui-list links">
				{#if data.inside}
					<li>
						<a href="/fahrten/{trip.id}/plan">
							<span class="tile"><Icon name="calendar" size={20} /></span>
							<span class="body"><strong>{t.trips.plan}</strong><span class="muted">{t.trips.planLead}</span></span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/if}
				<!-- The packing list: one's own progress, or a child's. -->
				{#if data.packingItems || data.organises}
					{#each data.arranged.length ? data.arranged : [{ fuer: null, name: '', packing: { packed: 0, of: data.packingItems } }] as one (one.fuer)}
						<li>
							<a href="/fahrten/{trip.id}/packliste{one.fuer ? `?fuer=${one.fuer}` : ''}">
								<span class="tile" class:todo={data.arranged.length > 0 && one.packing.of > 0 && one.packing.packed < one.packing.of}><Icon name="backpack" size={20} /></span>
								<span class="body">
									<strong>{one.fuer ? o.packing.forChild(one.name) : o.packing.title}</strong>
									{#if data.arranged.length && one.packing.of}
										<span class="progress">
											<span class="bar" aria-hidden="true"><span class:full={one.packing.packed === one.packing.of} style:width="{(one.packing.packed / one.packing.of) * 100}%"></span></span>
											<span class="muted">{o.packing.progress(one.packing.packed, one.packing.of)}</span>
										</span>
									{:else}
										<span class="muted">{o.packing.linkLead(one.packing.of)}</span>
									{/if}
								</span>
								<Icon name="chevron" size={16} />
							</a>
						</li>
					{/each}
				{/if}
				{#if data.organising}
					<li>
						<a href="/fahrten/{trip.id}/unterkunft">
							<span class="tile"><Icon name="bed" size={20} /></span>
							<span class="body"><strong>{o.stays.title}</strong><span class="muted">{o.stays.linkLead(data.organising.placed, data.organising.stays ? data.organising.going : 0)}</span></span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
					<li>
						<a href="/fahrten/{trip.id}/transport">
							<span class="tile"><Icon name="bus" size={20} /></span>
							<span class="body"><strong>{o.transport.title}</strong><span class="muted">{o.transport.linkLead(data.organising.vehicles)}</span></span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
					{#if data.organising.costs}
						<li>
							<a href="/fahrten/{trip.id}/kosten">
								<span class="tile" class:todo={data.organising.costs.unpaid > 0}><Icon name="coins" size={20} /></span>
								<span class="body"><strong>{o.costs.title}</strong><span class="muted">{o.costs.linkLead(data.organising.costs.unpaid, data.organising.costs.payers)}</span></span>
								<Icon name="chevron" size={16} />
							</a>
						</li>
					{/if}
				{/if}
				{#each data.myLists as lists (lists.fuer)}
					<li>
						<a href="/fahrten/{trip.id}/listen{lists.fuer ? `?fuer=${lists.fuer}` : ''}">
							<span class="tile" class:todo={lists.filled < lists.of}><Icon name="list" size={20} /></span>
							<span class="body">
								<strong>{lists.fuer ? t.trips.lists.titleFor(lists.name) : t.trips.lists.yours}</strong>
								<span class="progress">
									<span class="bar" aria-hidden="true"><span class:full={lists.filled === lists.of} style:width="{(lists.filled / lists.of) * 100}%"></span></span>
									<span class="muted">{t.trips.lists.progress(lists.filled, lists.of)}</span>
								</span>
							</span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/each}
				{#if data.listProgress?.length}
					<li>
						<a href="/fahrten/{trip.id}/auswertung">
							<span class="tile"><Icon name="table" size={20} /></span>
							<span class="body">
								<strong>{t.trips.lists.evaluate}</strong>
								<span class="progress">
									{#if listsTotal}<span class="bar" aria-hidden="true"><span class:full={!missingLists} style:width="{((listsTotal - missingLists) / listsTotal) * 100}%"></span></span>{/if}
									<span class="muted">{!listsTotal ? t.trips.lists.evaluateLead : missingLists ? t.trips.lists.progress(listsTotal - missingLists, listsTotal) : t.trips.lists.overview.complete}</span>
								</span>
							</span>
							<Icon name="chevron" size={16} />
						</a>
					</li>
				{/if}
			</ul>
		{/if}

		<!-- The concerts and rehearsals of the trip: they stay normal calendar dates and know their trip. -->
		{#if data.attached.length || data.organises}
			<section class="ui-card section">
				<header class="section-head">
					<h2>{t.trips.events.title}</h2>
					<p class="muted">{t.trips.events.lead}</p>
				</header>
				{#if data.attached.length}
					<ul class="events">
						{#each data.attached as event (event.id)}
							<li>
								<a href="/kalender/{event.id}" class:concert={event.type === 'konzert'}>
									<span class="tile"><Icon name={event.type === 'konzert' ? 'music' : 'calendar'} size={16} /></span>
									<span class="body">
										<span class="name">{event.title}</span>
										<span class="muted">{[day(event.day), event.start].filter(Boolean).join(' · ')}</span>
									</span>
									<Icon name="chevron" size={16} />
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">{t.trips.events.none}</p>
				{/if}
				{#if data.organises}
					<details class="ui-disclosure pick-events">
						<summary>{t.trips.events.choose}</summary>
						<p class="hint">{t.trips.events.pick}</p>
						{#if data.pickable.length}
							<form method="POST" action="?/events" use:enhance={saving.submit()}>
								{#each data.pickable as event (event.id)}
									<label class="check">
										<input type="checkbox" name="event" value={event.id} checked={event.attached} />
										<span class="name">{event.title}</span>
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
				<header class="section-head">
					<h2>{t.trips.participants.title}</h2>
					{#if data.overview}
						<p class="muted">
							{[
								t.trips.participants.signedUp(data.count),
								...(data.overview.waiting ? [t.trips.participants.waiting(data.overview.waiting)] : []),
								...(data.overview.cancelled ? [t.trips.participants.cancelled(data.overview.cancelled)] : [])
							].join(' · ')}
						</p>
					{:else}
						<p class="muted">{t.trips.participants.visible}</p>
					{/if}
				</header>
				{#if data.overview}
					<p class="roles">
						{#each TRIP_ROLES.filter((role) => data.overview?.byRole[role]) as role (role)}
							<span class="tag"><strong>{data.overview.byRole[role]}</strong>{t.trips.roles[role]}</span>
						{/each}
					</p>
				{/if}

				{#snippet people(list: typeof data.signedUp, kind: 'in' | 'waiting' | 'out')}
					<ul class="people" class:out={kind === 'out'}>
						{#each list as person (person.email)}
							<li>
								<Avatar name={person.name} size={36} />
								<span class="who">
									<span class="name">
										{person.name}
										{#if person.parentPending && kind !== 'out'}<span class="tag warn">{t.trips.participants.parentPending}</span>{/if}
									</span>
									<span class="muted">
										{person.roles.map((role) => t.trips.roles[role]).join(', ')}
										{#if person.arrival}· {t.trips.participants.arrives(day(person.arrival))}{/if}
										{#if person.departure}· {t.trips.participants.leaves(day(person.departure))}{/if}
									</span>
									{#if person.note}<span class="person-note">{person.note}</span>{/if}
								</span>
								{#if data.organises}
									<span class="row-actions">
										{#if kind === 'waiting'}
											<form method="POST" action="?/moveUp" use:enhance={saving.submit()}>
												<input type="hidden" name="email" value={person.email} />
												<button class="btn small secondary" disabled={saving.busy}>{t.trips.participants.moveUp}</button>
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
					<p class="empty">{t.trips.participants.none}</p>
				{/if}

				{#if data.overview}
					{#if data.waiting.length}
						<h3>{t.trips.participants.waitingList}</h3>
						{@render people(data.waiting, 'waiting')}
					{/if}
					{#if data.overview.awaitingParent.length}
						<h3>{t.trips.participants.awaitingParent}</h3>
						<p class="names">{#each data.overview.awaitingParent as name (name)}<span class="name-chip">{name}</span>{/each}</p>
					{/if}
					{#if data.overview.unanswered.length && data.open}
						<h3>{t.trips.participants.unanswered} <span class="count">{data.overview.unanswered.length}</span></h3>
						<p class="names">{#each data.overview.unanswered as name (name)}<span class="name-chip">{name}</span>{/each}</p>
					{/if}
					{#if data.cancelled.length}
						<h3>{t.trips.participants.cancelledList}</h3>
						{@render people(data.cancelled, 'out')}
					{/if}
				{/if}
			</section>
		{/if}
	</div>

	{#if data.organises}
		<details class="ui-card ui-disclosure edit" open={!!form?.editError}>
			<summary><Icon name="edit" size={16} />{t.trips.edit.open}</summary>
			<div class="edit-body">
				{#if form?.edited}<p class="msg ok" role="status">{t.trips.edit.saved}</p>{/if}
				<TripForm {trip} orchestras={data.orchestras} action="?/update" submit={t.trips.edit.save} error={form?.editError} />
				<form method="POST" action="?/remove" class="danger" onsubmit={confirm(t.trips.edit.removeConfirm(trip.title))}>
					<button class="btn ghost danger-btn"><Icon name="trash" size={16} />{t.trips.edit.remove}</button>
				</form>
			</div>
		</details>
	{/if}
</div>

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
		margin-bottom: var(--space-5);
	}

	.head.plain {
		display: grid;
		gap: var(--space-2);
	}

	.when {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.head.plain .when {
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	/* A small dot between the date, the length and the kind. */
	.sep {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.6;
	}

	.top-msg {
		margin-bottom: var(--space-4);
	}

	/* Phones: one column, the facts first, then your answer, then the rest.
	   Wide screens: what you do on the left, the facts and the route beside it. */
	.layout {
		display: grid;
		grid-template-areas: 'facts' 'where' 'main' 'edit';
		gap: var(--space-4);
		align-items: start;
	}

	.facts {
		grid-area: facts;
	}

	.where {
		grid-area: where;
	}

	.main {
		grid-area: main;
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}

	@media (min-width: 880px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 320px;
			grid-template-rows: auto 1fr auto;
			grid-template-areas: 'main facts' 'main where' 'edit .';
			gap: var(--space-4) var(--space-5);
		}

		.where {
			position: sticky;
			top: calc(var(--header-height) + var(--space-4));
		}
	}

	h2 {
		font-size: var(--text-lg);
	}

	.muted,
	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.hint {
		font-size: var(--text-xs);
	}

	/* The facts: a label over each value, two side by side on a phone. */
	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: var(--space-4) var(--space-5);
	}

	.facts > div {
		display: grid;
		align-content: start;
		gap: 2px;
		min-width: 0;
	}

	.facts dt {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.facts dd {
		margin: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.facts .sub {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.facts .sub.soon {
		color: var(--warn);
		font-weight: 600;
	}

	.bar {
		display: block;
		height: 6px;
		margin-top: var(--space-1);
		overflow: hidden;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
	}

	.bar > span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
		transition: width 0.4s var(--ease);
	}

	.bar > span.full {
		background: var(--ok);
	}

	/* The rule spans the card; the text keeps a readable line length. */
	.note {
		grid-column: 1 / -1;
		padding-right: max(0px, 100% - 65ch);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
		line-height: 1.55;
		white-space: pre-line;
	}

	/* The route: the places in order down a line, the globe above or beside them. */
	.where {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
	}

	/* The countdown: a large number over the route, like a departure board. */
	.countdown {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		grid-column: 1 / -1;
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--hairline);
		color: var(--text-muted);
		font-weight: 600;
	}

	.countdown strong {
		color: var(--accent);
		font-size: var(--text-4xl);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.02em;
	}

	.countdown span:only-child {
		color: var(--accent);
		font-size: var(--text-xl);
	}

	.globe-box {
		justify-self: center;
		width: min(200px, 70%);
	}

	/* Full width (one column, not too narrow): the globe beside the places. In the side column it sits above. */
	@media (min-width: 560px) and (max-width: 879px) {
		.where:has(.globe-box) {
			grid-template-columns: 160px 1fr;
			align-items: center;
		}


		.globe-box {
			width: 160px;
		}
	}

	.route {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.route li {
		position: relative;
		display: grid;
		gap: 2px;
		padding: var(--space-2) 0 var(--space-2) var(--space-5);
	}

	/* The line between the places, from one dot to the next. */
	.route li + li::before {
		content: '';
		position: absolute;
		top: calc(-1 * var(--space-2) - 2px);
		bottom: calc(100% - var(--space-4) - 4px);
		left: 5px;
		border-left: 2px dotted var(--border);
	}

	.dot {
		position: absolute;
		top: calc(var(--space-2) + 0.45em);
		left: 0;
		width: 12px;
		height: 12px;
		border: 2px solid var(--accent);
		border-radius: 50%;
		background: var(--surface);
		transition:
			background var(--fast) var(--ease),
			transform var(--fast) var(--ease);
	}

	.route li.on .dot {
		background: var(--danger);
		border-color: var(--danger);
		transform: scale(1.25);
	}

	/* The place itself is the button; the map link below it stays a link of its own. */
	.stop {
		display: grid;
		gap: 2px;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.stop:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
		border-radius: var(--radius-s);
	}

	.stop-name {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		line-height: 1.3;
	}

	.flag {
		flex: none;
		width: 20px;
		height: 15px;
		border-radius: var(--radius-hair);
		box-shadow: 0 0 0 1px var(--hairline);
		object-fit: cover;
	}

	.stop-foot {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin-top: 2px;
	}

	.stop-foot a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	/* Your answer. Answered, the card opens with a band in the answer's colour. */
	.answer {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
	}

	.answer h2 {
		font-size: var(--text-xl);
	}

	.status {
		--tone: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: calc(-1 * var(--space-2));
		padding: var(--space-3);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--tone) 12%, transparent);
		font-weight: 600;
	}

	.status.ok {
		--tone: var(--ok);
	}

	.status.warn {
		--tone: var(--warn);
	}

	.status-icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--tone);
		color: var(--surface);
	}

	.change > summary {
		color: var(--accent);
		font-size: var(--text-sm);
	}

	.change[open] > summary {
		margin-bottom: var(--space-3);
	}

	.signup {
		display: grid;
		gap: var(--space-5);
	}

	.pick {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.pick legend {
		margin-bottom: var(--space-2);
		padding: 0;
		font-size: var(--text-sm);
		font-weight: 650;
	}

	.pick .hint {
		margin-top: calc(-1 * var(--space-2));
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
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
		gap: 6px;
		min-height: 40px;
		padding: 0 var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		font-size: var(--text-sm);
		font-weight: 600;
		transition:
			background var(--fast) var(--ease),
			border-color var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	/* The tick shows only on chosen roles. */
	.chip span :global(svg) {
		display: none;
	}

	.chip:hover span {
		background: var(--surface-2);
	}

	.chip input:checked + span {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.chip input:checked + span :global(svg) {
		display: block;
	}

	.chip input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.chip input:disabled + span {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (pointer: coarse) {
		.chip span {
			min-height: var(--tap);
		}
	}

	.field .hint {
		font-weight: 400;
	}

	.actions,
	.row-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	/* What's settled for you: label on the left, the facts beside it. */
	.arranged dl {
		display: grid;
		gap: var(--space-3);
		margin: 0;
	}

	.arranged dl div {
		display: grid;
		grid-template-columns: minmax(130px, 200px) 1fr;
		gap: var(--space-1) var(--space-3);
	}

	.arranged dt {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.arranged dd {
		display: grid;
		gap: 2px;
		margin: 0;
	}

	.arranged .pre {
		white-space: pre-line;
	}

	.arranged .open {
		color: var(--warn);
		font-weight: 600;
	}

	@media (max-width: 520px) {
		.arranged dl div {
			grid-template-columns: 1fr;
		}
	}

	/* The plan and the lists: one inset list of things to open. */
	.links a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 64px;
		padding: var(--space-3) var(--space-4);
		color: inherit;
		transition: background var(--fast) var(--ease);
	}

	.links a:hover {
		background: var(--surface-2);
	}

	.links a > :global(svg:last-child) {
		flex: none;
		color: var(--text-muted);
	}

	.links .body {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
	}

	.tile {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.tile.todo {
		background: color-mix(in oklab, var(--warn) 15%, transparent);
		color: var(--warn);
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.progress .bar {
		flex: none;
		width: 64px;
		margin: 0;
	}

	.section {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-5);
	}

	.section-head {
		display: grid;
		gap: 2px;
	}

	.section h3 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.count {
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		letter-spacing: 0;
	}

	.empty {
		padding: var(--space-4);
		border: 1px dashed var(--border);
		border-radius: var(--radius-m);
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}

	.events {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.events li + li {
		border-top: 1px solid var(--hairline);
	}

	.events a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		color: inherit;
	}

	.events a > :global(svg:last-child) {
		color: var(--text-muted);
	}

	.events .tile {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-s);
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.events .concert .tile {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.events .body {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.name {
		font-weight: 600;
	}

	.pick-events > summary {
		color: var(--accent);
		font-size: var(--text-sm);
	}

	.pick-events form {
		display: grid;
		gap: var(--space-1);
		margin-top: var(--space-3);
	}

	.check {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-height: 40px;
	}

	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.roles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px var(--space-3);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.tag strong {
		font-variant-numeric: tabular-nums;
	}

	.tag.warn {
		padding: 1px var(--space-2);
		background: color-mix(in oklab, var(--warn) 15%, transparent);
		color: var(--warn);
		font-size: var(--text-2xs);
		font-weight: 650;
	}

	.people {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.people li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
	}

	.people li + li {
		border-top: 1px solid var(--hairline);
	}

	.people.out :global(.avatar) {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.people.out .name {
		color: var(--text-muted);
	}

	.who {
		display: grid;
		flex: 1;
		gap: 1px;
		min-width: 0;
	}

	.who .name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.people .row-actions {
		flex: none;
	}

	.person-note {
		margin-top: 2px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-s);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
		white-space: pre-line;
	}

	.names {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.name-chip {
		padding: 2px var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-pill);
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
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.icon-btn:hover {
		background: color-mix(in oklab, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.icon-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.edit {
		grid-area: edit;
		padding: var(--space-2) var(--space-5);
	}

	.edit > summary {
		color: var(--accent);
	}

	.edit-body {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-2) 0 var(--space-4);
	}

	.danger {
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
	}

	.danger-btn {
		color: var(--danger);
	}

	@media (max-width: 480px) {
		.answer,
		.section {
			padding: var(--space-4);
		}

		.facts,
		.where {
			padding: var(--space-4);
		}
	}
</style>

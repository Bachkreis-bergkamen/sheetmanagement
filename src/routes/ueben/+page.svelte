<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import DrillRound from '#lib/components/DrillRound.svelte';
	import DrillStaff from '#lib/components/DrillStaff.svelte';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import RhythmStaff from '#lib/components/RhythmStaff.svelte';
	import Title from '#lib/components/Title.svelte';
	import { EAR_ORDER, FLUENT_MS, interleave, KEY_ORDER, kindOf, notesOrder, playOrder, transOrder } from '#lib/practice/drills/decks.ts';
	import { isProfileId, PROFILE_IDS, profile, profileFor, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { clefLadder, UNLOCK_AT } from '#lib/practice/drills/levels.ts';
	import { RHYTHM_ORDER } from '#lib/practice/drills/rhythm.ts';
	import { addAnswer, DAILY_GOAL_MINUTES, dayKey, emptyData, MAX_UNSENT, streak, type DrillData } from '#lib/practice/drills/progress.ts';
	import { dayNumber, record, summary } from '#lib/practice/drills/scheduler.ts';
	import { clearDrills, loadDrills, saveDrills } from '#lib/practice/drills/store.ts';
	import { CLEFS, pitchOf, type Clef, type Pitch } from '#lib/practice/drills/theory.ts';

	let { data } = $props();
	const tx = t.drills;

	/** The member's own instrument, from "Mitglieder", the first one the drills know. */
	const own = $derived(data.instruments.map(profileFor).find((id): id is ProfileId => !!id) ?? 'treble');

	let drills = $state<DrillData>(emptyData());
	let ready = $state(false);
	let saved = $state(true);
	onMount(async () => {
		const loaded = await loadDrills(data.account);
		drills = loaded.data;
		saved = loaded.saved;
		ready = true;
		sendTime();
	});

	const instrument = $derived<ProfileId>(isProfileId(drills.settings.instrument) ? drills.settings.instrument : own);
	const prof = $derived(profile(instrument));
	/** The instrument's clefs as they open one after another (#300): bass, then tenor, then treble for a cello. */
	const ladder = $derived(clefLadder(prof, drills.items, drills.opened));
	/** One clef chosen by hand, or (none chosen) all the instrument's open ones. */
	const chosenClef = $derived<Clef | null>(drills.settings.clef && CLEFS.includes(drills.settings.clef) ? drills.settings.clef : null);
	const clefs = $derived<Clef[]>(chosenClef ? [chosenClef] : ladder.filter((step) => step.open).map((step) => step.clef));
	const sound = $derived(drills.settings.sound ?? true);

	function setting(change: Partial<DrillData['settings']>) {
		drills.settings = { ...drills.settings, ...change };
		persist();
	}

	function persist() {
		saveDrills(data.account, drills).then((ok) => (saved = ok));
	}

	type Kind = 'mix' | 'notes' | 'keys' | 'ear' | 'rhythm' | 'play' | 'trans';
	const orders = $derived.by<Record<Kind, string[]>>(() => {
		const notes = interleave(...clefs.map(notesOrder));
		return {
			mix: interleave(notes, KEY_ORDER, EAR_ORDER),
			notes,
			keys: KEY_ORDER,
			ear: EAR_ORDER,
			rhythm: RHYTHM_ORDER,
			play: interleave(...clefs.map((clef) => playOrder(instrument, clef))),
			trans: transOrder(instrument)
		};
	});

	const day = dayNumber();
	const standing = (order: string[]) => summary(order, drills.items, day, (id) => FLUENT_MS[kindOf(id)]);

	let playing = $state<Kind | null>(null);
	// A round or the overview starts at the top, where the staff is.
	$effect(() => {
		void playing;
		window.scrollTo({ top: 0 });
	});

	/** A clef that opened during the last round, to celebrate. */
	let unlocked = $state<Clef | null>(null);
	let openBefore: Clef[] = [];
	function start(kind: Kind) {
		openBefore = ladder.filter((step) => step.open).map((step) => step.clef);
		unlocked = null;
		playing = kind;
	}
	function exit() {
		playing = null;
		unlocked = ladder.find((step) => step.open && !openBefore.includes(step.clef))?.clef ?? null;
		sendTime();
	}

	/** `measure` is what counts for fluency: the time to answer, or for a rhythm how far the taps were off. */
	function onanswer(id: string, correct: boolean, ms: number, measure = ms) {
		drills.items[id] = record(drills.items[id], correct, measure, dayNumber(), FLUENT_MS[kindOf(id)]);
		drills.days = addAnswer(drills.days, dayKey(), correct, ms);
		// A clef that opens stays open.
		const opening = clefLadder(prof, drills.items, drills.opened).filter((step) => step.open && !drills.opened.includes(step.clef));
		if (opening.length) drills.opened = [...drills.opened, ...opening.map((step) => step.clef)];
		// Time for the practice tree, kept until sent; a question left open counts a minute at most.
		if (data.practising) drills.unsent = Math.min(MAX_UNSENT, drills.unsent + Math.min(ms, 60_000) / 1000);
		persist();
	}

	/**
	 * The time of the rounds to the member's practice time, so their tree grows with it: when a
	 * round ends and when the page opens (time kept while offline). Only with practice time on.
	 */
	async function sendTime() {
		const seconds = Math.round(drills.unsent);
		if (!data.practising || seconds < 1) return;
		try {
			const response = await fetch('/api/ueben/runde', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ seconds }),
				keepalive: true
			});
			// Counted, or practice time turned off meanwhile: either way nothing more to send.
			if (response.ok || response.status === 409) {
				drills.unsent = Math.max(0, drills.unsent - seconds);
				persist();
			}
		} catch {
			// Offline: kept for the next time.
		}
	}

	const todayMinutes = $derived(Math.floor((drills.days[dayKey()]?.ms ?? 0) / 60_000));
	const days = $derived(streak(drills.days));

	async function reset() {
		if (!confirm(tx.confirmReset)) return;
		await clearDrills(data.account);
		drills = emptyData();
	}

	const KINDS: { kind: Kind; icon: IconName }[] = [
		{ kind: 'mix', icon: 'sparkle' },
		{ kind: 'notes', icon: 'note' },
		{ kind: 'keys', icon: 'tag' },
		{ kind: 'ear', icon: 'headphones' },
		{ kind: 'rhythm', icon: 'activity' },
		{ kind: 'play', icon: 'gauge' },
		{ kind: 'trans', icon: 'refresh' }
	];
	/** A small picture for each card. */
	const PREVIEW: Record<Kind, { fifths?: number; notes?: Pitch[]; together?: boolean }> = {
		mix: { fifths: 2, notes: [pitchOf('A4')] },
		notes: { notes: [pitchOf('G4')] },
		keys: { fifths: -3 },
		ear: { notes: [pitchOf('E4'), pitchOf('B4')] },
		rhythm: {},
		play: { notes: [pitchOf('D5')] },
		trans: { notes: [pitchOf('C5')] }
	};
	/** The transposing drill only for instruments that transpose or read parts in other keys. */
	const kinds = $derived(KINDS.filter(({ kind }) => kind !== 'trans' || orders.trans.length));
	const steps = $derived(prof.clefs.length > 1 && !prof.together ? ladder : []);
</script>

<Title title={tx.title} />
<PageHeader title={tx.title} lead={tx.lead} />

{#if playing}
	<DrillRound
		order={orders[playing]}
		{clefs}
		{instrument}
		states={drills.items}
		{sound}
		title={tx.kinds[playing].title}
		tapOffset={drills.settings.tapOffset}
		{onanswer}
		oncalibrate={(tapOffset) => setting({ tapOffset })}
		onexit={exit}
	/>
{:else}
	<div class="hub">
		{#if unlocked}<p class="msg ok unlocked" role="status"><Icon name="sparkle" size={18} />{tx.newClef(tx.clefs[unlocked])}</p>{/if}

		<section class="ui-card setup" aria-label={tx.instrument}>
			<div class="fields">
				<label class="field">
					{tx.instrument}
					<select value={instrument} onchange={(event) => setting({ instrument: event.currentTarget.value as ProfileId, clef: undefined })}>
						{#each PROFILE_IDS as id (id)}<option value={id}>{tx.instruments[id]}</option>{/each}
					</select>
				</label>
				<label class="field">
					{tx.clef}
					<select value={chosenClef ?? ''} onchange={(event) => setting({ clef: (event.currentTarget.value || undefined) as Clef | undefined })}>
						<option value="">{tx.clefAuto(clefs.map((clef) => tx.clefs[clef]).join(', '))}</option>
						{#each CLEFS as each (each)}<option value={each}>{tx.clefs[each]}</option>{/each}
					</select>
				</label>
				<label class="check">
					<input type="checkbox" checked={sound} onchange={(event) => setting({ sound: event.currentTarget.checked })} />
					{tx.sound}
				</label>
			</div>
			{#if steps.length && !chosenClef}
				<ol class="ladder" aria-label={tx.ladder}>
					{#each steps as step, i (step.clef)}
						<li class:open={step.open}>
							<Icon name={step.open ? 'check' : 'clock'} size={16} />
							{#if step.open}
								<span>{tx.clefs[step.clef]}</span>
							{:else}
								<span>{tx.clefLocked(tx.clefs[step.clef], tx.clefs[steps[i - 1].clef], Math.min(steps[i - 1].mastered, UNLOCK_AT), UNLOCK_AT)}</span>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<section class="ui-card today" aria-label={tx.today(todayMinutes, DAILY_GOAL_MINUTES)}>
			<div class="goal">
				<span class="ring" style:--done="{Math.min(1, todayMinutes / DAILY_GOAL_MINUTES) * 100}%" aria-hidden="true"></span>
				<span>{tx.today(todayMinutes, DAILY_GOAL_MINUTES)}</span>
			</div>
			<div class="streak" title={tx.streakHint}>
				<Icon name="activity" size={18} />
				<span>{tx.streak(days)}</span>
			</div>
			{#if data.practising === true}
				<p class="hint tree">{tx.treeOn}</p>
			{:else if data.practising === false}
				<p class="hint tree"><a href="/profil">{tx.treeOff}</a></p>
			{/if}
		</section>

		<ul class="kinds">
			{#each kinds as { kind, icon } (kind)}
				{@const order = orders[kind]}
				{@const stand = standing(order)}
				<li class="ui-card kind">
					<div class="preview" aria-hidden="true">
						{#if kind === 'rhythm'}
							<RhythmStaff pattern="4 2 2 6 2" label="" />
						{:else}
							<DrillStaff clef={kind === 'trans' ? 'treble' : clefs[0]} fifths={PREVIEW[kind].fifths ?? 0} notes={PREVIEW[kind].notes} label="" />
						{/if}
					</div>
					<h2><Icon name={icon} size={18} />{tx.kinds[kind].title}</h2>
					<p class="lead">{tx.kinds[kind].lead}</p>
					{#if !order.length}
						<p class="hint">{tx.noPlay}</p>
					{:else}
						<p class="hint">
							{#if !ready}…{:else if stand.seen}{tx.mastered(stand.mastered, stand.total)}{#if stand.due}{' '}· {tx.due(stand.due)}{/if}{:else}{tx.fresh}{/if}
						</p>
						<div class="meter" aria-hidden="true"><span style:width="{(stand.mastered / stand.total) * 100}%"></span></div>
						<button type="button" class="btn" disabled={!ready} onclick={() => start(kind)}>{tx.start}</button>
					{/if}
				</li>
			{/each}
		</ul>

		<details class="ui-card how">
			<summary>{tx.how}</summary>
			<ul>
				{#each tx.howItems as item (item)}<li>{item}</li>{/each}
			</ul>
		</details>

		<p class="hint private"><Icon name="shield" size={16} />{tx.private}</p>
		{#if !saved}<p class="msg info">{tx.unsaved}</p>{/if}
		{#if ready && Object.keys(drills.items).length}
			<button type="button" class="btn ghost small reset" onclick={reset}><Icon name="trash" size={16} />{tx.reset}</button>
		{/if}
	</div>
{/if}

<style>
	.hub {
		display: grid;
		gap: var(--space-4);
	}

	.setup {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
	}

	.fields {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3) var(--space-4);
	}

	.ladder {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-3) 0 0;
		border-top: 1px solid var(--hairline);
		list-style: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.ladder li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.ladder li.open {
		color: var(--ok);
		font-weight: 600;
	}

	.tree {
		flex-basis: 100%;
	}

	.unlocked {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.setup select {
		min-width: 12rem;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		font-size: var(--text-sm);
	}

	.today {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.goal,
	.streak {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
	}

	.streak {
		color: var(--text-muted);
		font-weight: 500;
	}

	.ring {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: conic-gradient(var(--accent) var(--done), var(--surface-2) 0);
		mask: radial-gradient(circle, transparent 6px, #000 7px);
	}

	.kinds {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
		gap: var(--space-3);
		padding: 0;
		list-style: none;
	}

	.kind {
		display: grid;
		grid-template-rows: auto auto 1fr auto auto auto;
		gap: var(--space-2);
		padding: var(--space-4);
	}

	.preview {
		display: grid;
		align-items: center;
		min-height: 90px;
		max-width: 180px;
		color: var(--text-muted);
		opacity: 0.7;
	}

	.kind h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-lg);
	}

	.lead {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.meter {
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}

	.meter span {
		display: block;
		height: 100%;
		background: var(--ok);
	}

	.kind .btn {
		justify-self: start;
	}

	.how {
		padding: var(--space-3) var(--space-4);
	}

	.how summary {
		font-weight: 600;
		cursor: pointer;
	}

	.how ul {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding-left: var(--space-5);
		color: var(--text-muted);
	}

	.private {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.reset {
		justify-self: start;
	}
</style>

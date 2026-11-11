<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import DrillRound from '#lib/components/DrillRound.svelte';
	import DrillStaff from '#lib/components/DrillStaff.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';
	import { FLUENT_MS, interleave, KEY_ORDER, kindOf, notesOrder, playOrder } from '#lib/practice/drills/decks.ts';
	import { isProfileId, PROFILE_IDS, profile, profileFor, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { addAnswer, DAILY_GOAL_MINUTES, dayKey, emptyData, streak, type DrillData } from '#lib/practice/drills/progress.ts';
	import { dayNumber, record, summary } from '#lib/practice/drills/scheduler.ts';
	import { clearDrills, loadDrills, saveDrills } from '#lib/practice/drills/store.ts';
	import { CLEFS, pitchOf, type Clef } from '#lib/practice/drills/theory.ts';

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
	});

	const instrument = $derived<ProfileId>(isProfileId(drills.settings.instrument) ? drills.settings.instrument : own);
	const clefs = $derived(profile(instrument).clefs);
	const clef = $derived<Clef>(drills.settings.clef && CLEFS.includes(drills.settings.clef) ? drills.settings.clef : clefs[0]);
	const sound = $derived(drills.settings.sound ?? true);

	function setting(change: Partial<DrillData['settings']>) {
		drills.settings = { ...drills.settings, ...change };
		persist();
	}

	function persist() {
		saveDrills(data.account, drills).then((ok) => (saved = ok));
	}

	type Kind = 'mix' | 'notes' | 'keys' | 'play';
	const orders = $derived<Record<Kind, string[]>>({
		mix: interleave(notesOrder(clef), KEY_ORDER),
		notes: notesOrder(clef),
		keys: KEY_ORDER,
		play: playOrder(instrument, clef)
	});

	const day = dayNumber();
	const standing = (order: string[]) => summary(order, drills.items, day, (id) => FLUENT_MS[kindOf(id)]);

	let playing = $state<Kind | null>(null);
	// A round or the overview starts at the top, where the staff is.
	$effect(() => {
		void playing;
		window.scrollTo({ top: 0 });
	});

	function onanswer(id: string, correct: boolean, ms: number) {
		drills.items[id] = record(drills.items[id], correct, ms, dayNumber(), FLUENT_MS[kindOf(id)]);
		drills.days = addAnswer(drills.days, dayKey(), correct, ms);
		persist();
	}

	const todayMinutes = $derived(Math.floor((drills.days[dayKey()]?.ms ?? 0) / 60_000));
	const days = $derived(streak(drills.days));

	async function reset() {
		if (!confirm(tx.confirmReset)) return;
		await clearDrills(data.account);
		drills = emptyData();
	}

	const KINDS: { kind: Kind; icon: 'sparkle' | 'note' | 'tag' | 'headphones' }[] = [
		{ kind: 'mix', icon: 'sparkle' },
		{ kind: 'notes', icon: 'note' },
		{ kind: 'keys', icon: 'tag' },
		{ kind: 'play', icon: 'headphones' }
	];
	/** A small picture for each card. */
	const PREVIEW: Record<Kind, { fifths?: number; pitch?: ReturnType<typeof pitchOf> }> = {
		mix: { fifths: 2, pitch: pitchOf('A4') },
		notes: { pitch: pitchOf('G4') },
		keys: { fifths: -3 },
		play: { pitch: pitchOf('D5') }
	};
</script>

<Title title={tx.title} />
<PageHeader title={tx.title} lead={tx.lead} />

{#if playing}
	<DrillRound
		order={orders[playing]}
		{clef}
		{instrument}
		states={drills.items}
		{sound}
		title={tx.kinds[playing].title}
		{onanswer}
		onexit={() => (playing = null)}
	/>
{:else}
	<div class="hub">
		<section class="ui-card setup" aria-label={tx.instrument}>
			<label class="field">
				{tx.instrument}
				<select value={instrument} onchange={(event) => setting({ instrument: event.currentTarget.value as ProfileId, clef: undefined })}>
					{#each PROFILE_IDS as id (id)}<option value={id}>{tx.instruments[id]}</option>{/each}
				</select>
			</label>
			<label class="field">
				{tx.clef}
				<select value={clef} onchange={(event) => setting({ clef: event.currentTarget.value as Clef })}>
					{#each CLEFS as each (each)}<option value={each}>{tx.clefs[each]}</option>{/each}
				</select>
			</label>
			<label class="check">
				<input type="checkbox" checked={sound} onchange={(event) => setting({ sound: event.currentTarget.checked })} />
				{tx.sound}
			</label>
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
		</section>

		<ul class="kinds">
			{#each KINDS as { kind, icon } (kind)}
				{@const order = orders[kind]}
				{@const stand = standing(order)}
				<li class="ui-card kind">
					<div class="preview" aria-hidden="true">
						<DrillStaff clef={kind === 'play' && !clefs.includes(clef) ? clefs[0] : clef} fifths={PREVIEW[kind].fifths ?? 0} pitch={PREVIEW[kind].pitch ?? null} label="" />
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
						<button type="button" class="btn" disabled={!ready} onclick={() => (playing = kind)}>{tx.start}</button>
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
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3) var(--space-4);
		padding: var(--space-4);
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

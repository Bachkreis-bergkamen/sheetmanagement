<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import DrillRound from '#lib/components/DrillRound.svelte';
	import DrillStaff from '#lib/components/DrillStaff.svelte';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import PracticeTree from '#lib/components/PracticeTree.svelte';
	import { treeStage, type TreeStage } from '#lib/practice/practice.ts';
	import RhythmStaff from '#lib/components/RhythmStaff.svelte';
	import SightRound from '#lib/components/SightRound.svelte';
	import SightStaff from '#lib/components/SightStaff.svelte';
	import Title from '#lib/components/Title.svelte';
	import { EAR_ORDER, FLUENT_MS, interleave, KEY_ORDER, kindOf, notesOrder, playOrder, transOrder } from '#lib/practice/drills/decks.ts';
	import { isProfileId, PROFILE_IDS, profile, profileFor, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { clefLadder, UNLOCK_AT } from '#lib/practice/drills/levels.ts';
	import { PULSE_ORDER, RHYTHM_ORDER } from '#lib/practice/drills/rhythm.ts';
	import { scaleOrder } from '#lib/practice/drills/scales.ts';
	import { knownOf, newlyOpen, progression, STAGES, type DrillCard } from '#lib/practice/drills/progression.ts';
	import { firstLevel, makeMelody, MAX_LEVEL, seeded, type SightLevel } from '#lib/practice/drills/sight.ts';
	import { makeEntry, MAX_ENTRY_LEVEL, tuneOrder } from '#lib/practice/drills/together.ts';
	import { makePlacement, nextProbe, placementResult, progress as placementProgress, recordProbe, type Placement, type PlacementResult } from '#lib/practice/drills/placement.ts';
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
		// Progress from before progression: the drills practised then stay open.
		if (!drills.unlocked) {
			drills.unlocked = STAGES.flat().filter((card) =>
				card === 'sight' || card === 'entry' ? !!drills.settings[card] && !drills.settings.placed : Object.keys(drills.items).some((id) => cardOf(id) === card)
			);
		}
		ready = true;
		syncUnlocks();
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

	type Kind = 'mix' | 'notes' | 'keys' | 'ear' | 'rhythm' | 'pulse' | 'play' | 'scale' | 'sight' | 'entry' | 'tune' | 'trans';
	const orders = $derived.by<Record<Kind, string[]>>(() => {
		const notes = interleave(...clefs.map(notesOrder));
		return {
			mix: interleave(notes, KEY_ORDER, EAR_ORDER),
			notes,
			keys: KEY_ORDER,
			ear: EAR_ORDER,
			rhythm: RHYTHM_ORDER,
			pulse: PULSE_ORDER,
			play: interleave(...clefs.map((clef) => playOrder(instrument, clef))),
			scale: scaleOrder(instrument),
			// Sight-reading and entries have no items: every melody is new.
			sight: [],
			entry: [],
			tune: tuneOrder(instrument),
			trans: transOrder(instrument)
		};
	});

	const day = dayNumber();
	const standing = (order: string[]) => summary(order, drills.items, day, (id) => FLUENT_MS[kindOf(id)]);

	/** The drill card an item belongs to. */
	const cardOf = (id: string): DrillCard | null => {
		const kind = kindOf(id) as string;
		return (STAGES.flat() as string[]).includes(kind) ? (kind as DrillCard) : null;
	};

	/** Which drills are open (#300): each once what it builds on is known; once open, for good. */
	const cards = $derived(
		progression(
			{
				notes: knownOf(orders.notes, drills.items),
				keys: knownOf(KEY_ORDER, drills.items),
				rhythm: knownOf(RHYTHM_ORDER, drills.items),
				play: knownOf(orders.play, drills.items),
				ear: knownOf(EAR_ORDER, drills.items),
				sightLevel: drills.settings.sight?.[instrument]?.level ?? 1
			},
			drills.unlocked ?? [],
			() => false
		)
	);

	/** Drills just opened are kept open. */
	function syncUnlocks() {
		const fresh = newlyOpen(drills.unlocked ?? [], cards);
		if (fresh.length) {
			drills.unlocked = [...(drills.unlocked ?? []), ...fresh];
			persist();
		}
	}

	let playing = $state<Kind | null>(null);
	// A round or the overview starts at the top, where the staff is.
	$effect(() => {
		void playing;
		window.scrollTo({ top: 0 });
	});

	/** A clef, and drills, that opened during the last round or the placement test, to celebrate. */
	let unlocked = $state<Clef | null>(null);
	let freshCards = $state<DrillCard[]>([]);
	let openBefore: Clef[] = [];
	let cardsBefore: string[] = [];
	function remember() {
		openBefore = ladder.filter((step) => step.open).map((step) => step.clef);
		cardsBefore = [...(drills.unlocked ?? [])];
		unlocked = null;
		freshCards = [];
	}
	function announce() {
		unlocked = ladder.find((step) => step.open && !openBefore.includes(step.clef))?.clef ?? null;
		syncUnlocks();
		freshCards = newlyOpen(cardsBefore, cards).filter((card) => kinds.some((each) => each.kind === card));
	}
	function start(kind: Kind) {
		remember();
		playing = kind;
	}
	function exit() {
		playing = null;
		announce();
		sendTime();
	}

	/** `measure` is what counts for fluency: the time to answer, or for a rhythm how far the taps were off. */
	function onanswer(id: string, correct: boolean, ms: number, measure = ms) {
		drills.items[id] = record(drills.items[id], correct, measure, dayNumber(), FLUENT_MS[kindOf(id)]);
		practised(correct, ms);
	}

	/** The day's practice and the practice tree: every answer, and every melody read at sight. */
	function practised(correct: boolean, ms: number) {
		drills.days = addAnswer(drills.days, dayKey(), correct, ms);
		// A clef that opens stays open.
		const opening = clefLadder(prof, drills.items, drills.opened).filter((step) => step.open && !drills.opened.includes(step.clef));
		if (opening.length) drills.opened = [...drills.opened, ...opening.map((step) => step.clef)];
		// Time for the practice tree, kept until sent; a question left open counts a minute at most.
		if (data.practising) drills.unsent = Math.min(MAX_UNSENT, drills.unsent + Math.min(ms, 60_000) / 1000);
		persist();
		syncUnlocks();
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
				if (response.ok) sent += seconds;
				persist();
			}
		} catch {
			// Offline: kept for the next time.
		}
	}

	const todayMinutes = $derived(Math.floor((drills.days[dayKey()]?.ms ?? 0) / 60_000));
	const days = $derived(streak(drills.days));

	// The placement test (#300): offered on first use, to be taken again any time.
	// Raw: the test changes it in place, and the progress bar has its own state.
	let placement = $state.raw<Placement | null>(null);
	let testing = $state(false);
	let testProgress = $state(0);
	let placed = $state<PlacementResult | null>(null);
	const offerPlacement = $derived(ready && !Object.keys(drills.items).length && !drills.settings.placed);

	function startPlacement() {
		remember();
		placement = makePlacement(prof);
		testProgress = 0;
		placed = null;
		testing = true;
	}

	/**
	 * What the test found into the member's progress: known items they haven't met yet (never
	 * over progress they have), clefs to open, and where sight-reading and entries start (only if
	 * not started yet).
	 */
	function finishPlacement() {
		if (!placement) return;
		const result = placementResult(placement, dayNumber());
		for (const [id, state] of Object.entries(result.states)) drills.items[id] ??= state;
		drills.opened = [...new Set([...drills.opened, ...result.opened])];
		const level = (value: number) => ({ level: value, good: 0, poor: 0 });
		drills.settings = {
			...drills.settings,
			placed: dayKey(),
			sight: { ...drills.settings.sight, [instrument]: drills.settings.sight?.[instrument] ?? level(result.sightLevel) },
			entry: { ...drills.settings.entry, [instrument]: drills.settings.entry?.[instrument] ?? level(result.entryLevel) }
		};
		persist();
		placed = result;
		testing = false;
		placement = null;
		announce();
		sendTime();
	}

	/**
	 * The practice tree as it stands: the total from the server, with what this visit has sent
	 * since and what's still waiting to be sent, so it grows as the member practises.
	 */
	let sent = $state(0);
	const tree = $derived(treeStage((data.treeSeconds ?? 0) + sent + (data.practising ? drills.unsent : 0)));
	const nextTree = $derived(treeStage(tree.next));
	const treeName = (stage: TreeStage) => (stage.kind === 'tree' ? t.practice.tree.tree(stage.age) : t.practice.tree[stage.kind]);
	const treeLeft = $derived(Math.max(0, tree.next - ((data.treeSeconds ?? 0) + sent + (data.practising ? drills.unsent : 0))));

	async function reset() {
		if (!confirm(tx.confirmReset)) return;
		await clearDrills(data.account);
		drills = { ...emptyData(), unlocked: [] };
		syncUnlocks();
	}

	/**
	 * The instrument chosen for the member (their first in the members' list) is said once, with
	 * their other instruments, and changing it is a small option, not the first thing on the page.
	 */
	const others = $derived(
		[...new Set(data.instruments.map(profileFor).filter((id): id is ProfileId => !!id))].filter((id) => id !== instrument)
	);
	const announceInstrument = $derived(ready && !drills.settings.instrument && drills.settings.announced !== instrument);
	let changing = $state(false);

	const KINDS: { kind: Kind; icon: IconName }[] = [
		{ kind: 'mix', icon: 'sparkle' },
		{ kind: 'notes', icon: 'note' },
		{ kind: 'keys', icon: 'tag' },
		{ kind: 'ear', icon: 'headphones' },
		{ kind: 'rhythm', icon: 'activity' },
		{ kind: 'pulse', icon: 'clock' },
		{ kind: 'play', icon: 'gauge' },
		{ kind: 'scale', icon: 'music' },
		{ kind: 'sight', icon: 'eye' },
		{ kind: 'entry', icon: 'users' },
		{ kind: 'tune', icon: 'sliders' },
		{ kind: 'trans', icon: 'refresh' }
	];
	/** A small picture for each card. */
	const PREVIEW: Record<Kind, { fifths?: number; notes?: Pitch[]; together?: boolean }> = {
		mix: { fifths: 2, notes: [pitchOf('A4')] },
		notes: { notes: [pitchOf('G4')] },
		keys: { fifths: -3 },
		ear: { notes: [pitchOf('E4'), pitchOf('B4')] },
		rhythm: {},
		pulse: {},
		sight: {},
		entry: {},
		tune: { notes: [pitchOf('C4'), pitchOf('E4'), pitchOf('G4')], together: true },
		play: { notes: [pitchOf('D5')] },
		scale: { fifths: 1, notes: [pitchOf('G4'), pitchOf('A4'), pitchOf('B4')] },
		trans: { notes: [pitchOf('C5')] }
	};
	/** The transposing drill only for instruments that transpose or read parts in other keys; scales and sight-reading only for those that play them. */
	const kinds = $derived(
		KINDS.filter(({ kind }) =>
			kind === 'sight' || kind === 'entry' ? !!sightPreview : (kind !== 'trans' && kind !== 'scale' && kind !== 'tune') || orders[kind].length
		)
	);
	const sightLevel = $derived<SightLevel>(drills.settings.sight?.[instrument] ?? firstLevel());
	const entryLevel = $derived<SightLevel>(drills.settings.entry?.[instrument] ?? firstLevel());
	const entryPreview = $derived(instrument === 'timpani' ? null : makeEntry(instrument, prof.clefs[0], 3, seeded(4)));
	/** A small melody of the member's level for the card, the same one each visit. */
	const sightPreview = $derived(instrument === 'timpani' ? null : makeMelody(instrument, prof.clefs[0], 1, seeded(3)))
	const steps = $derived(prof.clefs.length > 1 && !prof.together ? ladder : []);
</script>

<Title title={tx.title} />
<PageHeader title={tx.title} lead={tx.lead} />

{#if testing && placement}
	{@const test = placement}
	<DrillRound
		order={[]}
		clefs={[prof.clefs[0]]}
		{instrument}
		states={drills.items}
		{sound}
		title={tx.placement.title}
		tapOffset={drills.settings.tapOffset}
		settings={drills.settings}
		test={() => nextProbe(test)}
		progress={testProgress}
		onanswer={(id, correct, ms) => {
			recordProbe(test, id, correct, ms);
			testProgress = placementProgress(test);
			practised(correct, ms);
		}}
		oncalibrate={() => {}}
		onsetting={setting}
		onfinish={finishPlacement}
		onexit={() => {
			testing = false;
			placement = null;
		}}
	/>
{:else if playing === 'sight' || playing === 'entry'}
	{@const entry = playing === 'entry'}
	<SightRound
		mode={entry ? 'entry' : 'sight'}
		duet={!!drills.settings.duet}
		{instrument}
		{clefs}
		level={entry ? drills.settings.entry?.[instrument] : drills.settings.sight?.[instrument]}
		readAhead={!!drills.settings.readAhead}
		title={tx.kinds[playing].title}
		onlevel={(state) => setting(entry ? { entry: { ...drills.settings.entry, [instrument]: state } } : { sight: { ...drills.settings.sight, [instrument]: state } })}
		onreadahead={(readAhead) => setting({ readAhead })}
		onduet={(duet) => setting({ duet })}
		onpractice={(ms, good) => practised(good, ms)}
		onexit={exit}
	/>
{:else if playing}
	<DrillRound
		order={orders[playing]}
		{clefs}
		{instrument}
		states={drills.items}
		{sound}
		title={tx.kinds[playing].title}
		tapOffset={drills.settings.tapOffset}
		settings={drills.settings}
		{onanswer}
		oncalibrate={(tapOffset) => setting({ tapOffset })}
		onsetting={setting}
		onexit={exit}
	/>
{:else}
	<div class="hub">
		{#if unlocked}<p class="msg ok unlocked" role="status"><Icon name="sparkle" size={18} />{tx.newClef(tx.clefs[unlocked])}</p>{/if}
		{#if freshCards.length}
			<p class="msg ok unlocked" role="status">
				<Icon name="sparkle" size={18} />{tx.newDrills(freshCards.map((card) => tx.kinds[card].title))}
			</p>
		{/if}

		{#if announceInstrument}
			<section class="ui-card chosen" aria-labelledby="chosen-title">
				<h2 id="chosen-title"><Icon name="music" size={18} />{own === 'treble' ? tx.chosenNone : tx.chosen(tx.instruments[instrument])}</h2>
				<p class="lead">
					{own === 'treble' ? tx.chosenNoneLead : tx.chosenLead(clefs.map((clef) => tx.clefs[clef]).join(', '))}
					{#if others.length}{' '}{tx.chosenOthers(others.map((id) => tx.instruments[id]).join(', '))}{/if}
				</p>
				<div class="row">
					<button type="button" class="btn" onclick={() => setting({ announced: instrument })}>{tx.chosenOk}</button>
					<button
						type="button"
						class="btn ghost"
						onclick={() => {
							setting({ announced: instrument });
							changing = true;
						}}>{tx.change}</button
					>
				</div>
			</section>
		{/if}

		{#if offerPlacement}
			<section class="ui-card placement" aria-labelledby="placement-title">
				<h2 id="placement-title"><Icon name="flag" size={18} />{tx.placement.offer}</h2>
				<p class="lead">{tx.placement.offerLead}</p>
				<div class="row">
					<button type="button" class="btn" onclick={startPlacement}>{tx.placement.start}</button>
					<button type="button" class="btn ghost" onclick={() => setting({ placed: 'skipped' })}>{tx.placement.skip}</button>
				</div>
			</section>
		{/if}

		{#if placed}
			<section class="ui-card placement" aria-labelledby="placed-title" role="status">
				<h2 id="placed-title"><Icon name="check" size={18} />{tx.placement.done}</h2>
				<ul class="found">
					{#each placed.skills as { skill, passed } (skill.kind === 'notes' ? skill.clef : skill.kind)}
						<li>
							<strong>{skill.kind === 'notes' ? tx.clefs[skill.clef] : skill.kind === 'keys' ? tx.kinds.keys.title : tx.kinds.ear.title}:</strong>
							{passed ? tx.placement.bands[skill.kind][passed - 1] : tx.placement.fromStart}
						</li>
					{/each}
					<li><strong>{tx.kinds.sight.title}:</strong> {tx.level(placed.sightLevel, MAX_LEVEL)}</li>
				</ul>
				<p class="lead">{tx.placement.after}</p>
				<button type="button" class="btn ghost small" onclick={() => (placed = null)}>{tx.placement.close}</button>
			</section>
		{/if}

		<section class="ui-card setup" aria-label={tx.instrument}>
			<div class="top">
				<div class="current">
					<p class="playing">
						<Icon name="music" size={18} />
						<strong>{tx.instruments[instrument]}</strong>
						<span class="muted">· {clefs.map((clef) => tx.clefs[clef]).join(', ')}{chosenClef ? '' : ` (${tx.auto})`}</span>
						<button type="button" class="link" aria-expanded={changing} onclick={() => (changing = !changing)}>{tx.change}</button>
					</p>
					{#if changing}
						<div class="fields">
							<label class="field">
								{tx.instrument}
								<select
									value={instrument}
									onchange={(event) => setting({ instrument: event.currentTarget.value as ProfileId, clef: undefined, announced: event.currentTarget.value })}
								>
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
						<p class="hint">{tx.changeHint}</p>
					{/if}
				</div>
				{#if data.practising !== null}
					<!-- The practice tree, to the tree on the profile. -->
					<a class="tree-link" href="/profil#probenzeit" aria-label={tx.treeLink}>
						<span class="tree-picture"><PracticeTree stage={tree} /></span>
						<span class="tree-text">
							<span class="ui-label">{tx.treeTitle}</span>
							{#if data.practising}
								<strong>{treeName(tree)}</strong>
								<span class="tree-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(tree.progress * 100)}>
									<span style:width="{tree.progress * 100}%"></span>
								</span>
								<small>{tx.treeNext(t.practice.duration(treeLeft), treeName(nextTree))}</small>
							{:else}
								<strong>{tx.treeStart}</strong>
							{/if}
						</span>
					</a>
				{/if}
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

		{#each STAGES as stage, number (number)}
			{@const shown = kinds.filter(({ kind }) => (stage as string[]).includes(kind))}
			{@const openCount = shown.filter(({ kind }) => cards[kind as DrillCard].open).length}
			{#if shown.length}
				<section class="stage" class:closed={!openCount} aria-labelledby="stage-{number}">
					<h2 class="stage-title" id="stage-{number}">
						<span class="step">{number + 1}</span>{tx.stages[number]}
						<small>{tx.stageOpen(openCount, shown.length)}</small>
					</h2>
					<ul class="kinds">
						{#each shown as { kind, icon } (kind)}
							{@const order = orders[kind]}
							{@const stand = standing(order)}
							{@const card = cards[kind as DrillCard]}
							<li class="ui-card kind" class:locked={!card.open}>
								{#if !card.open}
									<!-- A big padlock in the top half of the card, where the picture would be: still locked. -->
									<span class="padlock" role="img" aria-label={tx.locked}><Icon name="lock" size={120} /></span>
								{:else}
								<div class="preview" aria-hidden="true">
									{#if kind === 'rhythm'}
										<RhythmStaff pattern="4 2 2 6 2" label="" />
									{:else if kind === 'pulse'}
										<RhythmStaff pattern="4 4 4 4" label="" />
									{:else if kind === 'sight' && sightPreview}
										<SightStaff melody={sightPreview} preview label="" />
									{:else if kind === 'entry' && entryPreview}
										<SightStaff melody={entryPreview} preview label="" />
									{:else}
										<DrillStaff
											clef={kind === 'trans' || kind === 'scale' ? 'treble' : clefs[0]}
											fifths={PREVIEW[kind].fifths ?? 0}
											notes={PREVIEW[kind].notes}
											together={PREVIEW[kind].together}
											spacing={kind === 'scale' ? 30 : 46}
											label=""
										/>
									{/if}
								</div>
								{/if}
								<h3>
									<Icon name={icon} size={18} />{tx.kinds[kind].title}
									{#if card.open && number > 0 && !stand.seen && !(kind === 'sight' && drills.settings.sight?.[instrument]) && !(kind === 'entry' && drills.settings.entry?.[instrument])}<span class="new">{tx.new}</span>{/if}
								</h3>
								<p class="lead">{tx.kinds[kind].lead}</p>
								{#if !card.open}
									<p class="hint">{tx.lockedUntil}</p>
									<ul class="needs">
										{#each card.needs as need (need.of)}
											<li>
												<span>{tx.need(need.of, need.count, need.have)}</span>
												<span class="meter" aria-hidden="true"><span style:width="{(need.have / need.count) * 100}%"></span></span>
											</li>
										{/each}
									</ul>
								{:else if kind === 'sight' || kind === 'entry'}
									{@const [at, of] = kind === 'sight' ? [sightLevel.level, MAX_LEVEL] : [entryLevel.level, MAX_ENTRY_LEVEL]}
									<p class="hint">{tx.level(at, of)}</p>
									<div class="meter" aria-hidden="true"><span style:width="{(at / of) * 100}%"></span></div>
									<button type="button" class="btn" disabled={!ready} onclick={() => start(kind)}>{tx.start}</button>
								{:else if !order.length}
									<p class="hint">{tx.noPlay}</p>
								{:else}
									<p class="hint">
										{#if !ready}…{:else if stand.seen}{tx.mastered(stand.mastered, stand.total)}{#if stand.due}{' '}· {tx.due(stand.due)}{/if}{#if stand.known}{' '}· {tx.known(stand.known)}{/if}{:else}{tx.fresh}{/if}
									</p>
									<div class="meter" aria-hidden="true"><span style:width="{(stand.mastered / stand.total) * 100}%"></span></div>
									<button type="button" class="btn" disabled={!ready} onclick={() => start(kind)}>{tx.start}</button>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}

		<details class="ui-card how">
			<summary>{tx.how}</summary>
			<ul>
				{#each tx.howItems as item (item)}<li>{item}</li>{/each}
			</ul>
		</details>

		<p class="hint private"><Icon name="shield" size={16} />{tx.private}</p>
		{#if !saved}<p class="msg info">{tx.unsaved}</p>{/if}
		<div class="row">
			{#if ready && !offerPlacement}
				<button type="button" class="btn ghost small" onclick={startPlacement}><Icon name="flag" size={16} />{tx.placement.again}</button>
			{/if}
			{#if ready && Object.keys(drills.items).length}
				<button type="button" class="btn ghost small" onclick={reset}><Icon name="trash" size={16} />{tx.reset}</button>
			{/if}
		</div>
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

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3) var(--space-4);
	}

	.tree-link {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		color: inherit;
		text-decoration: none;
		transition: border-color 0.15s;
	}

	.tree-link:hover {
		border-color: var(--accent);
	}

	.tree-picture {
		display: block;
		width: 80px;
	}

	.tree-text {
		display: grid;
		gap: 2px;
		min-width: 9rem;
	}

	.tree-text small {
		color: var(--text-muted);
		font-size: var(--text-2xs);
	}

	.tree-bar {
		display: block;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}

	.tree-bar span {
		display: block;
		height: 100%;
		background: var(--ok);
		transition: width 0.3s;
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

	.chosen {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-left: 3px solid var(--accent);
	}

	.chosen h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-lg);
	}

	.current {
		display: grid;
		flex: 1 1 22rem;
		gap: var(--space-3);
		align-content: start;
	}

	.playing {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.muted {
		color: var(--text-muted);
	}

	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: underline;
		cursor: pointer;
	}

	.stage {
		display: grid;
		gap: var(--space-3);
	}

	.stage-title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-lg);
	}

	.stage-title small {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.step {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent, #fff);
		font-size: var(--text-sm);
	}

	.stage.closed .step {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.kind.locked {
		background: var(--surface-2);
	}

	.kind.locked .preview,
	.kind.locked .lead {
		opacity: 0.55;
	}

	.kind.locked h3 {
		color: var(--text-muted);
	}

	.padlock {
		display: grid;
		place-items: center;
		min-height: 170px;
		margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-4)) 0;
		border-radius: inherit;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		background: color-mix(in oklab, var(--hairline) 45%, var(--surface-2));
		color: var(--text-muted);
	}

	.padlock :global(svg) {
		width: min(55%, 140px);
		height: auto;
	}

	.needs {
		display: grid;
		gap: var(--space-2);
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}

	.needs li {
		display: grid;
		gap: 4px;
	}

	.needs .meter {
		background: var(--hairline);
	}

	.new {
		padding: 1px var(--space-2);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-2xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.kind h3 {
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

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.placement {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-left: 3px solid var(--accent);
	}

	.placement h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-lg);
	}

	.placement .btn.small {
		justify-self: start;
	}

	.found {
		display: grid;
		gap: var(--space-1);
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}
</style>

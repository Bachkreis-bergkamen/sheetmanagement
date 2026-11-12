<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import BadgeMedal from '#lib/components/BadgeMedal.svelte';
	import Conductor from '#lib/components/Conductor.svelte';
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
	import { EAR_DECK, EAR_ORDER, FLUENT_MS, interleave, KEY_ORDER, kindOf, notesOrder, playOrder, transOrder } from '#lib/practice/drills/decks.ts';
	import { isProfileId, PROFILE_IDS, profile, profileFor, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { clefLadder, UNLOCK_AT } from '#lib/practice/drills/levels.ts';
	import { PULSE_ORDER, RHYTHM_ORDER } from '#lib/practice/drills/rhythm.ts';
	import { scaleOrder } from '#lib/practice/drills/scales.ts';
	import { knownOf, newlyOpen, progression, STAGES, type DrillCard } from '#lib/practice/drills/progression.ts';
	import { firstLevel, makeMelody, MAX_LEVEL, seeded, type SightLevel } from '#lib/practice/drills/sight.ts';
	import { makeEntry, MAX_ENTRY_LEVEL, tuneOrder } from '#lib/practice/drills/together.ts';
	import { makePlacement, nextProbe, placementResult, progress as placementProgress, recordProbe, type Placement, type PlacementResult } from '#lib/practice/drills/placement.ts';
	import { badgeProgress, badgesFor, newBadges, type Badge, type BadgeGroup } from '#lib/practice/drills/badges.ts';
	import { addAnswer, DAILY_GOAL_MINUTES, dayKey, emptyData, history, MAX_UNSENT, REFLECTION_MAX, streak, type DrillData } from '#lib/practice/drills/progress.ts';
	import PracticeHistory from '#lib/components/PracticeHistory.svelte';
	import DrillSharing from '#lib/components/DrillSharing.svelte';
	import { invalidateAll } from '$app/navigation';
	import { sharesAny, summaryRows, type Sharing } from '#lib/practice/drills/sharing.ts';
	import { dayNumber, record, summary } from '#lib/practice/drills/scheduler.ts';
	import { clearDrills, loadDrills, saveDrills } from '#lib/practice/drills/store.ts';
	import { alterInKey, CLEFS, pitchAt, type Clef, type Pitch } from '#lib/practice/drills/theory.ts';

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
		syncBadges();
		sendTime();
		sendDays();
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
			mix: interleave(notes, KEY_ORDER, EAR_DECK),
			notes,
			keys: KEY_ORDER,
			ear: EAR_DECK,
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

	/** Badges (#300): what this instrument offers, and those reached now kept for good with the day. */
	const badges = $derived(badgesFor(instrument));
	function syncBadges() {
		const fresh = newBadges(badges, drills, instrument, streak(drills.days));
		if (!fresh.length) return;
		const today = dayKey();
		drills.badges = { ...drills.badges, ...Object.fromEntries(fresh.map((id) => [id, today])) };
		persist();
	}

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
	let badgesBefore: string[] = [];
	let freshBadges = $state<Badge[]>([]);
	function remember() {
		badgesBefore = Object.keys(drills.badges ?? {});
		freshBadges = [];
		openBefore = ladder.filter((step) => step.open).map((step) => step.clef);
		cardsBefore = [...(drills.unlocked ?? [])];
		unlocked = null;
		freshCards = [];
	}
	function announce() {
		unlocked = ladder.find((step) => step.open && !openBefore.includes(step.clef))?.clef ?? null;
		syncUnlocks();
		freshCards = newlyOpen(cardsBefore, cards).filter((card) => kinds.some((each) => each.kind === card));
		syncBadges();
		freshBadges = badges.filter((badge) => drills.badges?.[badge.id] && !badgesBefore.includes(badge.id));
	}
	function start(kind: Kind) {
		remember();
		playing = kind;
	}
	function exit() {
		playing = null;
		announce();
		sendTime();
		sendDays();
	}

	/** `measure` is what counts for fluency: the time to answer, or for a rhythm how far the taps were off. */
	function onanswer(id: string, correct: boolean, ms: number, measure = ms) {
		drills.items[id] = record(drills.items[id], correct, measure, dayNumber(), FLUENT_MS[kindOf(id)]);
		practised(correct, ms, kindOf(id));
	}

	/** The day's practice and the practice tree: every answer, and every melody read at sight. */
	function practised(correct: boolean, ms: number, skill: string) {
		drills.days = addAnswer(drills.days, dayKey(), correct, ms, skill);
		// A clef that opens stays open.
		const opening = clefLadder(prof, drills.items, drills.opened).filter((step) => step.open && !drills.opened.includes(step.clef));
		if (opening.length) drills.opened = [...drills.opened, ...opening.map((step) => step.clef)];
		// Time for the practice tree, kept until sent; a question left open counts a minute at most.
		if (data.practising) drills.unsent = Math.min(MAX_UNSENT, drills.unsent + Math.min(ms, 60_000) / 1000);
		persist();
		syncUnlocks();
		syncBadges();
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

	/**
	 * What the member shares (#300), and the summary sent when a round ends and the page opens:
	 * the last four weeks per day and skill, replacing what was sent before. Only while sharing.
	 */
	// Set here as it changes, until the next load brings the same back.
	let sharing = $derived(data.sharing);
	async function sendDays() {
		if (!sharesAny(sharing?.chosen)) return;
		try {
			const response = await fetch('/api/ueben/tage', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ rows: summaryRows(drills.days, dayKey()) }),
				keepalive: true
			});
			if (response.status === 409 && sharing) sharing = { ...sharing, chosen: null };
		} catch {
			// Offline: sent with the next round.
		}
	}
	async function share(next: Sharing) {
		const response = await fetch('/api/ueben/teilen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
		if (!response.ok) throw new Error(String(response.status));
		sharing = await response.json();
		await sendDays();
		// The board shows once the member is on it.
		await invalidateAll();
	}

	/** The last two weeks, for the member's own view of how it's going. */
	const lastDays = $derived(history(drills.days));
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
		sendDays();
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

	const bx = tx.badges;
	/** A badge's name, from what it stands for. */
	function badgeName(badge: Badge): string {
		const kind = badge.kind;
		switch (kind.type) {
			case 'staff':
				return bx.staff(tx.clefs[kind.clef]);
			case 'ledger':
				return bx.ledger(tx.clefs[kind.clef]);
			case 'keys':
				return bx.keys[kind.set];
			case 'ear':
				return bx.ear(kind.harmonic);
			case 'trans':
				return bx.trans(kind.parts);
			case 'sight':
				return bx.sight(kind.level);
			case 'streak':
				return bx.streak(kind.days);
			case 'scales':
				return bx.scales(kind.octaves);
			default:
				return bx[kind.type];
		}
	}
	const BADGE_GROUPS: BadgeGroup[] = ['read', 'hear', 'play', 'steady'];
	const earnedCount = $derived(badges.filter((badge) => drills.badges?.[badge.id]).length);
	const dateOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

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
	/**
	 * A small picture for each card, as staff positions (0 the bottom line, 8 the top), so the
	 * notes sit on the staff in whichever clef is shown; spelt in the key, as the drill would.
	 */
	const PREVIEW: Record<Kind, { fifths?: number; positions?: number[]; together?: boolean }> = {
		mix: { fifths: 2, positions: [3] },
		notes: { positions: [2] },
		keys: { fifths: -3 },
		ear: { positions: [1, 5] },
		rhythm: {},
		pulse: {},
		sight: {},
		entry: {},
		tune: { positions: [1, 3, 5], together: true },
		play: { positions: [5] },
		scale: { fifths: 1, positions: [2, 3, 4] },
		trans: { positions: [4] }
	};
	/** Transposing is read in treble clef; every other picture in the clef the member reads first. */
	const previewClef = (kind: Kind): Clef => (kind === 'trans' ? 'treble' : clefs[0]);
	function previewNotes(kind: Kind): Pitch[] {
		const { positions = [], fifths = 0 } = PREVIEW[kind];
		return positions.map((position) => {
			const pitch = pitchAt(previewClef(kind), position);
			return { ...pitch, alter: alterInKey(pitch.step, fifths) };
		});
	}
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

	/** Each stage with its drills for this instrument and how many are open, for the strip and the headings. */
	const stageList = $derived(
		STAGES.map((stage, number) => {
			const shown = kinds.filter(({ kind }) => (stage as string[]).includes(kind));
			return { number, shown, open: shown.filter(({ kind }) => cards[kind as DrillCard].open).length };
		}).filter((stage) => stage.shown.length)
	);
	/** The stage the member is working in: the last one with a drill open. */
	const current = $derived(stageList.reduce((at, stage) => (stage.open ? stage.number : at), 0));
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
			practised(correct, ms, kindOf(id));
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
		onpractice={(ms, good) => practised(good, ms, entry ? 'entry' : 'sight')}
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
		reflect={playing === 'mix'
			? {
					last: drills.reflection ?? null,
					onsave: (text) => {
						drills.reflection = { day: dayKey(), text: text.trim().slice(0, REFLECTION_MAX) };
						persist();
					}
				}
			: undefined}
		onexit={exit}
	/>
{:else}
	<div class="hub">
		{#if unlocked}<p class="msg ok unlocked" role="status"><Icon name="sparkle" size={18} />{tx.newClef(tx.clefs[unlocked])}</p>{/if}
		{#if freshBadges.length}
			<section class="ui-card celebrate" role="status">
				<div class="celebrate-medals">
					{#each freshBadges as badge (badge.id)}<BadgeMedal {badge} earned fresh size={64} />{/each}
				</div>
				<p>{bx.earned(freshBadges.map(badgeName))}</p>
			</section>
		{/if}
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

		<section class="ui-card status" aria-label={tx.progress}>
			<div class="standing">
				{#if data.practising !== null}
					<!-- The practice tree, to the tree on the profile. -->
					<a class="tree-link" href="/profil#probenzeit" aria-label={tx.treeLink}>
						<span class="tree-picture"><PracticeTree stage={tree} /></span>
					</a>
				{/if}
				<div class="standing-text">
					{#if data.practising !== null}
						<span class="ui-label">{tx.treeTitle}</span>
						{#if data.practising}
							<strong class="tree-name">{treeName(tree)}</strong>
							<span class="tree-bar" role="progressbar" aria-label={tx.treeTitle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(tree.progress * 100)}>
								<span style:width="{tree.progress * 100}%"></span>
							</span>
							<small>{tx.treeNext(t.practice.duration(treeLeft), treeName(nextTree))}</small>
						{:else}
							<strong class="tree-name">{tx.treeStart}</strong>
							{#if data.practising === false}<a class="tree-on" href="/profil">{tx.treeOff}</a>{/if}
						{/if}
					{/if}
					<p class="today">
						<span class="goal">
							<span class="ring" style:--done="{Math.min(1, todayMinutes / DAILY_GOAL_MINUTES) * 100}%" aria-hidden="true"></span>
							{tx.today(todayMinutes, DAILY_GOAL_MINUTES)}
						</span>
						<span class="streak" title={tx.streakHint}>{tx.streak(days)}</span>
					</p>
				</div>
			</div>
			{#if lastDays.some((day) => day.answers > 0)}<PracticeHistory days={lastDays} goal={DAILY_GOAL_MINUTES} />{/if}

			<ol class="strip" aria-label={tx.stagesLabel}>
				{#each stageList as stage (stage.number)}
					<li class:done={stage.open === stage.shown.length} class:here={stage.number === current}>
						<a href="#stage-{stage.number}" aria-current={stage.number === current ? 'step' : undefined}>
							<span class="pips" aria-hidden="true">
								{#each stage.shown as { kind } (kind)}<span class:open={cards[kind as DrillCard].open}></span>{/each}
							</span>
							<span class="strip-name"><span class="strip-number">{stage.number + 1}</span> {tx.stages[stage.number]}</span>
							<span class="sr-only">{tx.stageOpen(stage.open, stage.shown.length)}</span>
						</a>
					</li>
				{/each}
			</ol>

			<div class="setup">
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

		{#each stageList as { number, shown, open: openCount } (number)}
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
								<!-- The drill's music on its own sheet; still locked, it shows dimmed with a small lock. -->
								<div class="preview" aria-hidden="true">
									{#if kind === 'rhythm'}
										<RhythmStaff pattern="4 2 2 6 2" label="" />
									{:else if kind === 'pulse'}
										<Conductor meter={4} start={null} beatMs={600} />
									{:else if kind === 'sight' && sightPreview}
										<SightStaff melody={sightPreview} preview label="" />
									{:else if kind === 'entry' && entryPreview}
										<SightStaff melody={entryPreview} preview label="" />
									{:else}
										<DrillStaff
											clef={previewClef(kind)}
											fifths={PREVIEW[kind].fifths ?? 0}
											notes={previewNotes(kind)}
											together={PREVIEW[kind].together}
											spacing={kind === 'scale' ? 30 : 46}
											label=""
										/>
									{/if}
									{#if !card.open}<span class="lock-badge"><Icon name="lock" size={16} /></span>{/if}
								</div>
								<div class="body">
									<h3>
										<Icon name={icon} size={18} />{tx.kinds[kind].title}{#if !card.open}<span class="sr-only">, {tx.locked}</span>{/if}
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
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}

		{#if ready && sharing}
			<DrillSharing {sharing} board={data.board} onchange={share} />
		{/if}

		{#if ready}
			<details class="ui-card badges" open={freshBadges.length > 0}>
				<summary>
					<Icon name="sparkle" size={18} /><span>{bx.title}</span><span class="badge-count">{bx.count(earnedCount, badges.length)}</span>
				</summary>
				<p class="hint">{bx.lead}</p>
				{#each BADGE_GROUPS as group (group)}
					{@const list = badges.filter((badge) => badge.group === group)}
					{#if list.length}
						<h3>{bx.groups[group]}</h3>
						<ul class="badge-list">
							{#each list as badge (badge.id)}
								{@const day = drills.badges?.[badge.id]}
								{@const have = day ? badge.need : badgeProgress(badge, drills, instrument, days)}
								<li class="badge" class:earned={!!day} class:fresh={freshBadges.includes(badge)}>
									<BadgeMedal {badge} earned={!!day} progress={have} fresh={freshBadges.includes(badge)} size={52} />
									<span class="badge-text">
										<strong>{badgeName(badge)}</strong>
										<span class="hint">{day ? bx.since(dateOf(day)) : bx.progress(have, badge.need)}</span>
										{#if !day}<span class="meter" aria-hidden="true"><span style:width="{(have / badge.need) * 100}%"></span></span>{/if}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				{/each}
			</details>
		{/if}

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
		gap: var(--space-5);
	}

	/* One card for where the member stands: the tree and today, the stages, the instrument. */
	.status {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-5);
	}

	.standing {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.tree-link {
		flex: none;
		display: block;
		width: 96px;
		padding: var(--space-1);
		border-radius: var(--radius-m);
		background: var(--surface-2);
		transition: background-color 0.15s var(--ease);
	}

	.tree-link:hover {
		background: var(--accent-soft);
	}

	.tree-picture {
		display: block;
	}

	.standing-text {
		display: grid;
		flex: 1;
		gap: var(--space-1);
		min-width: 0;
	}

	.standing-text :global(.ui-label) {
		margin: 0;
	}

	.tree-name {
		font-size: var(--text-xl);
		line-height: 1.2;
	}

	.standing-text small {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.tree-on {
		font-size: var(--text-xs);
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
		border-radius: inherit;
		background: var(--ok);
		transition: width 0.3s var(--ease);
	}

	.today {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-4);
		margin-top: var(--space-1);
		font-size: var(--text-sm);
	}

	.goal {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
	}

	.streak {
		color: var(--text-muted);
	}

	.ring {
		flex: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: conic-gradient(var(--accent) var(--done), var(--surface-2) 0);
		mask: radial-gradient(circle, transparent 5px, #000 6px);
	}

	/* The stages as a strip: a pip per drill, filled once it's open. */
	.strip {
		display: grid;
		grid-auto-columns: 1fr;
		grid-auto-flow: column;
		gap: var(--space-2);
		padding: var(--space-4) 0 0;
		border-top: 1px solid var(--hairline);
		list-style: none;
	}

	.strip a {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		height: 100%;
		min-height: var(--tap, 44px);
		padding: var(--space-2);
		border-radius: var(--radius-control);
		color: var(--text-muted);
		text-decoration: none;
		transition: background-color 0.15s var(--ease);
	}

	.strip a:hover {
		background: var(--surface-2);
	}

	.strip .here a {
		background: var(--accent-soft);
		color: var(--text);
	}

	.pips {
		display: flex;
		gap: 3px;
	}

	.pips span {
		flex: 1;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		box-shadow: inset 0 0 0 1px var(--hairline);
	}

	.pips span.open {
		background: var(--accent);
		box-shadow: none;
	}

	.strip .done .pips span.open {
		background: var(--ok);
	}

	.strip-name {
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1.25;
	}

	.strip-number {
		font-variant-numeric: tabular-nums;
	}

	.setup {
		display: grid;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}

	.current {
		display: grid;
		gap: var(--space-3);
	}

	.playing {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-md);
	}

	.muted {
		color: var(--text-muted);
	}

	.link {
		min-height: 32px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: underline;
		text-underline-offset: 0.2em;
		cursor: pointer;
	}

	.fields {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-3) var(--space-4);
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

	.ladder {
		display: grid;
		gap: var(--space-1);
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

	.unlocked {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* Offers above the progress: a soft tint, not a stripe. */
	.chosen,
	.placement {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		background: color-mix(in oklab, var(--accent-soft) 60%, var(--surface));
	}

	.chosen h2,
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

	.stage {
		display: grid;
		gap: var(--space-3);
		scroll-margin-top: calc(60px + var(--space-4));
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
		color: var(--accent-contrast);
		font-size: var(--text-sm);
	}

	.stage.closed .step {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.kinds {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
		gap: var(--space-3);
		padding: 0;
		list-style: none;
	}

	/* A drill: its music on a sheet of its own, then what it is and where you stand. */
	.kind {
		display: grid;
		grid-template-rows: auto 1fr;
		gap: var(--space-3);
		padding: var(--space-3);
	}

	.preview {
		position: relative;
		display: grid;
		align-items: center;
		height: 112px;
		padding: 0 var(--space-3);
		border-radius: var(--radius-m);
		background: var(--bg);
		color: var(--text);
		overflow: hidden;
	}

	.preview :global(svg) {
		max-height: 104px;
	}

	.preview :global(.conductor) {
		width: 100%;
		max-width: 130px;
		margin-inline: auto;
	}

	.body {
		display: grid;
		grid-template-rows: auto auto 1fr auto auto auto;
		gap: var(--space-2);
		padding: 0 var(--space-1) var(--space-1);
	}

	.kind h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-lg);
	}

	.kind .btn {
		justify-self: start;
		min-width: 6rem;
		margin-top: var(--space-1);
	}

	/* Still locked: the music shows, faint, with a small lock on its sheet. */
	.kind.locked {
		background: var(--surface-2);
		box-shadow: none;
	}

	.kind.locked .preview {
		background: color-mix(in oklab, var(--surface) 55%, var(--surface-2));
	}

	.kind.locked .preview :global(svg) {
		opacity: 0.32;
	}

	.lock-badge {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--surface);
		color: var(--text-muted);
		box-shadow: inset 0 0 0 1px var(--hairline);
	}

	.kind.locked h3 {
		color: var(--text-muted);
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

	.lead,
	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.meter {
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}

	.meter span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--ok);
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
		gap: var(--space-1);
	}

	.needs .meter {
		background: var(--hairline);
	}

	/* Phones: the sheet beside the words, so twelve drills don't run to six screens. */
	@media (max-width: 560px) {
		.status {
			padding: var(--space-4);
		}

		.tree-link {
			width: 84px;
		}

		.strip {
			gap: var(--space-1);
		}

		.strip a {
			padding: var(--space-2) var(--space-1);
		}

		.kind {
			grid-template-columns: 118px 1fr;
			grid-template-rows: auto;
			align-items: start;
		}

		.preview {
			height: 104px;
			padding: 0 var(--space-1);
		}

		.preview :global(svg) {
			max-height: 100px;
		}

		.lock-badge {
			top: var(--space-1);
			right: var(--space-1);
			width: 26px;
			height: 26px;
		}

		.body {
			grid-template-rows: none;
			padding: 0;
		}

		.kind h3 {
			font-size: var(--text-base);
		}
	}

	.how {
		padding: var(--space-3) var(--space-4);
	}

	.badges {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
	}

	.badges summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		font-weight: 600;
		cursor: pointer;
	}

	.badge-count {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.badges h3 {
		margin-top: var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.badge-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: 0;
		list-style: none;
	}

	.badge {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
	}

	.badge-text {
		display: grid;
		flex: 1;
		gap: 2px;
		min-width: 0;
		font-size: var(--text-sm);
	}

	.badge-text .hint {
		font-size: var(--text-2xs);
	}

	.badge .meter {
		margin-top: var(--space-1);
	}

	.badge.earned {
		border-color: color-mix(in oklab, var(--ok) 45%, var(--hairline));
		background: color-mix(in oklab, var(--ok) 5%, var(--surface));
	}

	.celebrate {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-4);
		text-align: center;
		font-weight: 600;
	}

	.celebrate-medals {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-3);
	}

	.badge:not(.earned) strong {
		color: var(--text-muted);
		font-weight: 500;
	}

	.badge.fresh {
		box-shadow: 0 0 0 2px var(--ok);
	}

	@media (prefers-reduced-motion: no-preference) {
		.badge.earned:hover :global(.medal) {
			transform: rotate(-6deg) scale(1.06);
		}

		.badge :global(.medal) {
			transition: transform 0.25s ease;
		}
	}

	.how summary {
		min-height: 32px;
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
</style>

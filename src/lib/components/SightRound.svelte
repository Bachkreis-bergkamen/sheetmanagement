<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { noteFrequency, tempoName } from '#lib/practice/audio.ts';
	import { profile, type ProfileId } from '#lib/practice/drills/instruments.ts';
	import { segment, type Reading } from '#lib/practice/drills/scales.ts';
	import {
		beatMs,
		compass,
		expectedNotes,
		firstLevel,
		GOOD,
		judgeSight,
		lookOut,
		makeMelody,
		MAX_LEVEL,
		nextLevel,
		SIGHT_ROUND,
		type Melody,
		type SightLevel,
		type SightVerdict
	} from '#lib/practice/drills/sight.ts';
	import { listenToPitch, playBar, playMelody, rememberedA4, type MicProblem, type PlayedBar } from '#lib/practice/drills/sound.ts';
	import { judgeEntry, makeEntry, MAX_ENTRY_LEVEL, secondVoice, type EntryVerdict } from '#lib/practice/drills/together.ts';
	import { midiOf, tonic, type Clef, type Pitch } from '#lib/practice/drills/theory.ts';
	import Conductor from './Conductor.svelte';
	import SightStaff from './SightStaff.svelte';

	/**
	 * A round of sight-reading (#315, phase 3): five melodies, each new. A short look first, with
	 * what to check (key, time, highest and lowest note, the tricky spots), then a count-in and one
	 * take with the metronome and a cursor, without stopping; then each note marked. The level
	 * follows the takes. Without a microphone the take still runs, and the player says how it went.
	 *
	 * `mode` "entry" (#315, phase 4): the melody comes after bars of rest, counted while a second
	 * voice plays and a conductor beats time, and coming in on time counts as much as the notes.
	 * With `duet` a second voice plays under ordinary sight-reading too.
	 */
	let {
		mode = 'sight',
		duet = false,
		instrument,
		clefs,
		level: startLevel,
		readAhead,
		title,
		onlevel,
		onreadahead,
		onduet = () => {},
		onpractice,
		onexit
	}: {
		mode?: 'sight' | 'entry';
		duet?: boolean;
		onduet?: (on: boolean) => void;
		instrument: ProfileId;
		clefs: Clef[];
		level: SightLevel | undefined;
		readAhead: boolean;
		title: string;
		onlevel: (level: SightLevel) => void;
		onreadahead: (on: boolean) => void;
		/** Time spent on a melody, and whether it went well, for the day's practice. */
		onpractice: (ms: number, good: boolean) => void;
		onexit: () => void;
	} = $props();

	const tx = t.drills;
	const a4 = rememberedA4();
	const transposition = $derived(profile(instrument).transposition);

	// svelte-ignore state_referenced_locally
	let level = $state<SightLevel>(startLevel ?? firstLevel());
	let count = $state(0);
	let melody = $state<Melody | null>(null);
	let phase = $state<'prep' | 'count' | 'play' | 'result' | 'done'>('prep');
	let prepLeft = $state(0);
	let countBeat = $state(0);
	let now = $state<number | null>(null);
	let hidden = $state<number[]>([]);
	let verdict = $state<SightVerdict | EntryVerdict | null>(null);
	const maxLevel = $derived(mode === 'entry' ? MAX_ENTRY_LEVEL : MAX_LEVEL);
	/** When the take's first beat is heard, for the conductor; null between takes. */
	let conductorStart = $state<number | null>(null);
	/** The second voice's notes, so the microphone hearing them through the speaker doesn't count. */
	let voiceNotes = new Set<number>();
	let change = $state<-1 | 0 | 1>(0);
	let scores = $state<number[]>([]);
	let shownAt = 0;

	let stopMic: (() => void) | null = null;
	let micProblem = $state<MicProblem | null>(null);
	let readings: Reading[] = [];
	let start = 0;
	let bar: PlayedBar | null = null;
	let ticker: ReturnType<typeof setInterval> | undefined;
	let prepTimer: ReturnType<typeof setInterval> | undefined;
	let stopPlayback: (() => void) | null = null;

	const noteLabel = (pitch: Pitch) => `${tx.noteName(pitch.step, pitch.alter)}${pitch.octave}`;
	const keyLabel = (m: Melody) => {
		const key = tonic(m.fifths, m.mode);
		return tx.keyName(tx.noteName(key.step, key.alter), m.mode);
	};

	/** The instrument's clefs it has a range in, one at random: a cellist meets tenor clef too, once it's open. */
	function nextMelody() {
		stopPlayback?.();
		verdict = null;
		change = 0;
		now = null;
		hidden = [];
		if (count >= SIGHT_ROUND) {
			finishRound();
			return;
		}
		const usable = clefs.filter((clef) => profile(instrument).range[clef]);
		const clef = usable[Math.floor(Math.random() * usable.length)] ?? profile(instrument).clefs[0];
		const make = (each: Clef) => (mode === 'entry' ? makeEntry(instrument, each, level.level) : makeMelody(instrument, each, level.level));
		melody = make(clef) ?? make(profile(instrument).clefs[0]);
		if (!melody) {
			finishRound();
			return;
		}
		count++;
		phase = 'prep';
		shownAt = performance.now();
		// A look of a few seconds a bar: enough to find the key, the time and the tricky spots.
		prepLeft = Math.min(30, 8 + melody.bars * 4);
		clearInterval(prepTimer);
		prepTimer = setInterval(() => {
			prepLeft = Math.max(0, prepLeft - 1);
			if (!prepLeft) clearInterval(prepTimer);
		}, 1000);
	}

	/** Microphone on (kept for the round), count-in, and the take. */
	async function play() {
		if (!melody || phase !== 'prep') return;
		const m = melody;
		clearInterval(prepTimer);
		if (!stopMic && micProblem === null) {
			try {
				stopMic = await listenToPitch((frequency, time) => {
					if (phase === 'count' || phase === 'play') readings.push({ time, frequency });
				});
			} catch (problem) {
				micProblem = problem as MicProblem;
			}
		}
		readings = [];
		phase = 'count';
		const beat = beatMs(m.bpm);
		const sixteenthMs = beat / 4;
		const voices = mode === 'entry' || duet ? secondVoice(m, transposition) : [];
		voiceNotes = new Set(voices.map((voice) => voice.midi));
		bar = await playBar({
			bpm: m.bpm,
			countIn: m.meter,
			beats: m.bars * m.meter,
			meter: m.meter,
			voices: voices.map((voice) => ({ frequency: frequencyOf(voice.midi), at: voice.at * sixteenthMs, seconds: (voice.len * sixteenthMs) / 1000 }))
		});
		start = bar?.start ?? performance.now() + m.meter * beat;
		// The conductor beats the count-in too: from a bar before the first.
		conductorStart = start - m.meter * beat;
		const end = (m.bars * m.meter + 0.8) * beat;
		const barLength = m.meter * 4;
		ticker = setInterval(() => {
			const elapsed = performance.now() - start;
			if (elapsed < 0) {
				countBeat = m.meter - Math.floor(-elapsed / beat);
				return;
			}
			phase = 'play';
			const sixteenth = elapsed / (beat / 4);
			const playing = m.notes.findIndex((note) => sixteenth >= note.at && sixteenth < note.at + note.len);
			now = playing >= 0 ? playing : null;
			// Reading ahead: each bar goes a beat before it's played, so it must have been read already.
			if (readAhead) hidden = Array.from({ length: m.bars }, (_, b) => b).filter((b) => sixteenth >= b * barLength - 4);
			if (elapsed >= end) finishTake(m);
		}, 40);
	}

	function stopTake() {
		clearInterval(ticker);
		bar?.stop();
		bar = null;
		conductorStart = null;
	}

	function finishTake(m: Melody) {
		stopTake();
		now = null;
		hidden = [];
		phase = 'result';
		if (micProblem) return;
		const beat = beatMs(m.bpm);
		const played = segment(
			readings.filter((reading) => reading.time >= start - beat / 2),
			a4
		);
		const cheap = (midi: number) => voiceNotes.has(midi);
		const expected = expectedNotes(m, transposition);
		verdict = mode === 'entry' ? judgeEntry(expected, played, start, m.bpm, cheap) : judgeSight(expected, played, start, m.bpm, cheap);
		rate(verdict.score);
	}

	/** A take's score into the level, the day's practice and the round's summary. */
	function rate(score: number) {
		const next = nextLevel(level, score, maxLevel);
		change = next.change;
		level = { level: next.level, good: next.good, poor: next.poor };
		onlevel(level);
		onpractice(performance.now() - shownAt, score >= GOOD);
		scores = [...scores, score];
	}

	/** Without a microphone: how it went, in the player's own words. */
	function selfRate(score: number) {
		if (verdict || phase !== 'result' || scores.length >= count) return;
		rate(score);
	}

	function finishRound() {
		phase = 'done';
		melody = null;
		stopTake();
		stopMic?.();
		stopMic = null;
	}

	function listen() {
		if (!melody) return;
		stopPlayback?.();
		const sixteenth = beatMs(melody.bpm) / 4 / 1000;
		// From the first note: the rests before an entry aren't worth waiting through to hear it.
		const from = melody.notes.find((note) => note.pitch)?.at ?? 0;
		stopPlayback = playMelody(
			melody.notes
				.filter((note) => note.pitch)
				.map((note) => ({ frequency: frequencyOf(midiOf(note.pitch!) + transposition), at: (note.at - from) * sixteenth, seconds: note.len * sixteenth }))
		);
	}

	const frequencyOf = (midi: number) => noteFrequency(((midi % 12) + 12) % 12, Math.floor(midi / 12) - 1, a4);

	/** Where an entry comes in: after how many bars of rest, on which beat. */
	const entryAt = $derived.by(() => {
		if (!melody?.lead) return null;
		const first = melody.notes.find((note) => note.pitch)!;
		const barLength = melody.meter * 4;
		return { bars: melody.lead, beat: (first.at % barLength) / 4 + 1 };
	});
	const entryVerdict = $derived(verdict && 'onTime' in verdict ? verdict : null);

	const marks = $derived(
		verdict?.marks.map((mark) => (mark.state !== 'right' ? ('wrong' as const) : mark.timing === 'ok' ? ('right' as const) : ('off' as const))) ?? []
	);
	const captions = $derived(
		verdict?.marks.map((mark) =>
			mark.state === 'missed' ? '–' : mark.state === 'wrong' ? t.practice.tuner.notes[((mark.midi % 12) + 12) % 12] : mark.timing === 'ok' ? '' : tx.timing[mark.timing]
		) ?? []
	);
	const look = $derived(melody ? lookOut(melody) : {});
	const range = $derived(melody ? compass(melody) : null);
	const average = $derived(scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0);

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey || (event.key !== ' ' && event.key !== 'Enter')) return;
		if ((event.target as HTMLElement)?.closest('button, select, input')) return;
		if (phase === 'prep') {
			event.preventDefault();
			play();
		} else if (phase === 'result' && (verdict || scores.length >= count)) {
			event.preventDefault();
			nextMelody();
		}
	}

	nextMelody();
	$effect(() => () => {
		clearInterval(prepTimer);
		stopTake();
		stopMic?.();
		stopPlayback?.();
	});
</script>

<svelte:window {onkeydown} />

<section class="round ui-card" aria-labelledby="sight-title">
	<header class="top">
		<h2 id="sight-title">{title}</h2>
		{#if phase !== 'done'}<span class="count">{tx.question(count, SIGHT_ROUND)} · {tx.level(level.level, maxLevel)}</span>{/if}
		<button type="button" class="btn ghost small" onclick={onexit}>{phase === 'done' ? tx.back : tx.stop}</button>
	</header>

	{#if melody && phase !== 'done'}
		<SightStaff {melody} {marks} {captions} {now} {hidden} label={keyLabel(melody)} />

		<div class="below" aria-live="polite">
			{#if phase === 'prep'}
				<ul class="look">
					{#if entryAt}<li><strong>{tx.lookEntry(entryAt.bars, entryAt.beat)}</strong></li>{/if}
					<li>{tx.lookKey(keyLabel(melody), tx.accidentals(Math.abs(melody.fifths), melody.fifths > 0))}</li>
					<li>{tx.lookTime(melody.meter, tempoName(melody.bpm), melody.bpm)}</li>
					{#if range}<li>{tx.lookRange(noteLabel(range.low), noteLabel(range.high))}</li>{/if}
					{#if look.shortest}<li>{tx.lookShort(look.shortest.len, look.shortest.bar)}</li>{/if}
					{#if look.accidental}<li>{tx.lookAccidental(look.accidental)}</li>{/if}
					{#if look.leap}<li>{tx.lookLeap(tx.intervalSteps[look.leap.steps] ?? '', look.leap.bar)}</li>{/if}
				</ul>
				<p class="hint">{prepLeft ? tx.prepLeft(prepLeft) : tx.prepDone}</p>
				<div class="row">
					<button type="button" class="btn" class:pulse={!prepLeft} onclick={play}>{tx.sightStart}</button>
				</div>
				{#if mode === 'sight'}
					<label class="check">
						<input type="checkbox" checked={duet} onchange={(event) => onduet(event.currentTarget.checked)} />
						{tx.duet}
					</label>
				{/if}
				{#if mode === 'sight' && level.level >= 4}
					<label class="check">
						<input type="checkbox" checked={readAhead} onchange={(event) => onreadahead(event.currentTarget.checked)} />
						{tx.readAhead}
					</label>
				{/if}
				<p class="hint">{tx.keepGoing}</p>
			{:else if phase === 'count' || phase === 'play'}
				{#if mode === 'entry'}<Conductor meter={melody.meter} start={conductorStart} beatMs={beatMs(melody.bpm)} />{/if}
				{#if phase === 'count'}
					<p class="status" role="status">{tx.countIn} {countBeat || ''}</p>
				{:else}
					<p class="status" role="status"><span class="mic live" aria-hidden="true"></span>{mode === 'entry' ? tx.countRests : tx.keepGoingNow}</p>
				{/if}
			{/if}
			{#if phase === 'play'}
				{@const m = melody}
				<button type="button" class="btn ghost small" onclick={() => finishTake(m)}>{tx.doneTake}</button>
			{:else if phase === 'result'}
				{#if entryVerdict}
					<p class="feedback" class:ok={entryVerdict.onTime}>
						{entryVerdict.onTime ? tx.entryOnTime : entryVerdict.entry === null ? tx.entryMissed : tx.entryOff(entryVerdict.entry)}
					</p>
				{/if}
				{#if verdict}
					<p class="feedback" class:ok={verdict.score >= GOOD}>{tx.sightResult(verdict.right, verdict.inTime, verdict.total)}</p>
					{#if !verdict.keptGoing}<p class="hint">{tx.stoppedEarly}</p>{/if}
				{:else if scores.length < count}
					<p class="feedback ok">{tx.howWasIt}</p>
					<div class="row">
						<button type="button" class="btn ghost" onclick={() => selfRate(1)}>{tx.selfGood}</button>
						<button type="button" class="btn ghost" onclick={() => selfRate(0.75)}>{tx.selfOkay}</button>
						<button type="button" class="btn ghost" onclick={() => selfRate(0.4)}>{tx.selfHard}</button>
					</div>
				{/if}
				{#if change}<p class="msg {change > 0 ? 'ok' : 'info'}">{change > 0 ? tx.levelUp(level.level) : tx.levelDown(level.level)}</p>{/if}
				{#if verdict || scores.length >= count}
					<div class="row">
						<button type="button" class="btn ghost small" onclick={listen}>{tx.listen}</button>
						<button type="button" class="btn" onclick={nextMelody}>{tx.next}</button>
					</div>
				{/if}
			{/if}
			{#if micProblem && phase !== 'result'}<p class="msg info">{micProblem === 'insecure' ? t.practice.tuner.insecure : tx.noMicSight}</p>{/if}
		</div>
	{:else if phase === 'done'}
		<div class="done">
			<p class="big">{tx.done}</p>
			<ul class="facts">
				{#if scores.length}<li><strong>{tx.sightAverage(Math.round(average * 100))}</strong></li>{/if}
				<li>{tx.level(level.level, maxLevel)}</li>
			</ul>
			<div class="row">
				<button type="button" class="btn ghost" onclick={onexit}>{tx.back}</button>
				<button
					type="button"
					class="btn"
					onclick={() => {
						count = 0;
						scores = [];
						nextMelody();
					}}>{tx.again}</button
				>
			</div>
		</div>
	{/if}
</section>

<style>
	.round {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}

	.top h2 {
		flex: 1;
		font-size: var(--text-lg);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.below {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		min-height: 120px;
		text-align: center;
	}

	.look {
		display: grid;
		gap: var(--space-1);
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
	}

	.pulse {
		animation: pulse 1.6s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 6px var(--accent-soft);
		}
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		font-size: var(--text-sm);
	}

	.status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.mic {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--danger);
		animation: live 1.4s ease-in-out infinite;
	}

	@keyframes live {
		50% {
			opacity: 0.35;
		}
	}

	.feedback {
		color: var(--danger);
		font-weight: 600;
	}

	.feedback.ok {
		color: var(--ok);
	}

	.done {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	.big {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}

	.facts {
		display: grid;
		gap: var(--space-1);
		padding: 0;
		list-style: none;
		color: var(--text-muted);
	}

	.facts strong {
		color: var(--text);
	}
</style>

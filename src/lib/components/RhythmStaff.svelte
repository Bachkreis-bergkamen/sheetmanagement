<script lang="ts">
	import { BAR, parsePattern } from '#lib/practice/drills/rhythm.ts';

	/**
	 * One bar of rhythm for the tapping drill (#300) on a single line, as percussion is written:
	 * 4/4, note heads with stems, eighths and sixteenths beamed by the beat, rests. Drawn in SVG in
	 * the text colour like DrillStaff. After an answer, `marks` colours each note (right, or wrong
	 * when it wasn't tapped in time) and `taps` shows where the taps fell, in sixteenths.
	 */
	let {
		pattern,
		marks = [],
		taps = [],
		label
	}: { pattern: string; marks?: ('right' | 'wrong' | null)[]; taps?: number[]; label: string } = $props();

	const LINE = 60;
	const STEM = 34;
	const X0 = 52;
	const UNIT = 18;
	const width = X0 + BAR * UNIT + 16;
	const xAt = (at: number) => X0 + at * UNIT + 8;

	const events = $derived(parsePattern(pattern) ?? []);
	/** The notes (not rests), each with its mark and where its stem is. */
	const notes = $derived(
		events
			.filter((event) => !event.rest)
			.map((event, i) => ({ ...event, x: xAt(event.at), stemX: xAt(event.at) + 5.6, mark: marks[i] ?? null }))
	);
	type Placed = (typeof notes)[number];
	/** Notes shorter than a quarter within one beat: beamed when two or more, else flagged. */
	const groups = $derived.by(() => {
		const byBeat = new Map<number, Placed[]>();
		for (const note of notes) {
			const beat = Math.floor(note.at / 4);
			if (note.len >= 4 || note.at + note.len > (beat + 1) * 4) continue;
			byBeat.set(beat, [...(byBeat.get(beat) ?? []), note]);
		}
		return [...byBeat.values()];
	});
	const beamed = $derived(groups.filter((group) => group.length > 1));
	const flagged = $derived(groups.filter((group) => group.length === 1).map((group) => group[0]));
	const sixteenth = (note: Placed | undefined) => note?.len === 1;
	/** Second beams: across neighbouring sixteenths, or a stub towards the group for one alone. */
	const secondBeams = (group: Placed[]) => {
		const beams: [number, number][] = [];
		group.forEach((note, i) => {
			if (!sixteenth(note)) return;
			if (sixteenth(group[i + 1])) beams.push([note.stemX, group[i + 1].stemX]);
			else if (!sixteenth(group[i - 1])) beams.push(i === group.length - 1 ? [note.stemX - 8, note.stemX] : [note.stemX, note.stemX + 8]);
		});
		return beams;
	};
	const hollow = (len: number) => len >= 8;
	const dotted = (len: number) => len === 3 || len === 6 || len === 12;
</script>

<svg class="rhythm" viewBox="0 0 {width} 100" role="img" aria-label={label}>
	<line x1="2" x2={width - 2} y1={LINE} y2={LINE} class="line" />
	<line x1={width - 3} x2={width - 3} y1={LINE - 12} y2={LINE + 12} class="line bar" />
	<g class="time">
		<text x="22" y={LINE - 3} text-anchor="middle">4</text>
		<text x="22" y={LINE + 19} text-anchor="middle">4</text>
	</g>
	{#each [1, 2, 3] as beat (beat)}
		<line x1={X0 + beat * 4 * UNIT} x2={X0 + beat * 4 * UNIT} y1={LINE + 16} y2={LINE + 20} class="line tick" />
	{/each}

	{#each events.filter((event) => event.rest) as rest (rest.at)}
		<g transform="translate({xAt(rest.at)} {LINE})" class="rest">
			{#if rest.len === 4}
				<path d="M-2 -15 L4 -8 L-1 -2 L4 5 C-2 2 -4 8 1 12" class="pen" />
			{:else if rest.len === 2}
				<circle cx="-2" cy="-7" r="2.6" />
				<path d="M-2 -5 C1 -4 3 -6 4.5 -8 L-1 9" class="pen thin" />
			{:else}
				<rect x="-5" y={rest.len >= 8 ? -5 : 0} width="10" height="5" />
			{/if}
		</g>
	{/each}

	{#each notes as note (note.at)}
		<g class="note" class:right={note.mark === 'right'} class:wrong={note.mark === 'wrong'}>
			<ellipse cx={note.x} cy={LINE} rx="6.4" ry="4.4" transform="rotate(-20 {note.x} {LINE})" class:hollow={hollow(note.len)} />
			{#if note.len < 16}<line x1={note.stemX} x2={note.stemX} y1={LINE - 1} y2={LINE - STEM} class="stem" />{/if}
			{#if dotted(note.len)}<circle cx={note.x + 11} cy={LINE - 3} r="2" />{/if}
		</g>
	{/each}

	{#each flagged as note (note.at)}
		<g class="note" class:right={note.mark === 'right'} class:wrong={note.mark === 'wrong'}>
			<path d="M{note.stemX} {LINE - STEM} c1 8 10 10 8 22" class="pen thin" />
			{#if note.len === 1}<path d="M{note.stemX} {LINE - STEM + 7} c1 8 10 10 8 22" class="pen thin" />{/if}
		</g>
	{/each}

	{#each beamed as group (group[0].at)}
		<g class="beam">
			<rect x={group[0].stemX - 0.6} y={LINE - STEM} width={group[group.length - 1].stemX - group[0].stemX + 1.2} height="4.6" />
			{#each secondBeams(group) as [from, to] (from)}
				<rect x={from - 0.6} y={LINE - STEM + 7.5} width={to - from + 1.2} height="4.6" />
			{/each}
		</g>
	{/each}

	{#each taps as tap, i (i)}
		<path d="M{xAt(tap)} {LINE + 24} l-4 7 h8 z" class="tap" />
	{/each}
</svg>

<style>
	.rhythm {
		display: block;
		width: 100%;
		max-width: 480px;
		height: auto;
		margin-inline: auto;
		color: var(--text);
		fill: currentColor;
	}

	.line {
		stroke: currentColor;
		stroke-width: 1.2;
		opacity: 0.85;
	}

	.line.bar {
		stroke-width: 1.6;
	}

	.tick {
		opacity: 0.35;
	}

	.time text {
		font-family: var(--font-display, serif);
		font-size: 21px;
		font-weight: 700;
	}

	.stem {
		stroke: currentColor;
		stroke-width: 1.5;
	}

	.hollow {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
	}

	.pen {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.pen.thin {
		stroke-width: 1.8;
	}

	.note {
		transition: color 0.2s;
	}

	.note.right {
		color: var(--ok);
	}

	.note.wrong {
		color: var(--danger);
	}

	.tap {
		fill: var(--accent);
		opacity: 0.8;
	}
</style>

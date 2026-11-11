<script lang="ts">
	import type { Melody } from '#lib/practice/drills/sight.ts';
	import { alterInKey, diatonic, keySignature, ledgerLines, SIGNATURE_POSITIONS, staffPosition } from '#lib/practice/drills/theory.ts';
	import StaffAccidental from './staff/StaffAccidental.svelte';
	import StaffClef from './staff/StaffClef.svelte';
	import TempoMark from './staff/TempoMark.svelte';

	/**
	 * A melody for sight-reading (#315), two bars to a line: clef and key signature on every line,
	 * the time signature on the first, notes spaced by their length, beamed by the beat, stems up
	 * below the middle line and down above it. Drawn in SVG in the text colour like DrillStaff.
	 * `now` is the note being played (an index into `melody.notes`); `hidden` bars are blanked out
	 * (reading ahead); `marks` and `captions` are per sounding note, after a take.
	 */
	type Mark = 'right' | 'wrong' | 'off' | null;
	let {
		melody,
		marks = [],
		captions = [],
		now = null,
		hidden = [],
		label
	}: { melody: Melody; marks?: Mark[]; captions?: string[]; now?: number | null; hidden?: number[]; label: string } = $props();

	const BASE = 90;
	const y = (position: number) => BASE - position * 5;
	const STEM = 35;
	const PER_LINE = 2;
	/** Room a note takes by its length, before the next one. */
	const room = (len: number) => 12 + len * 6.5;
	const signature = $derived(keySignature(melody.fifths));
	const signatureAt = $derived(SIGNATURE_POSITIONS[melody.clef][melody.fifths >= 0 ? 'sharps' : 'flats']);
	const bodyStart = (line: number) => 44 + signature.length * 10 + (line === 0 ? 32 : 8);

	interface Placed {
		index: number;
		/** Index among the sounding notes, for marks and captions; -1 for a rest. */
		sounding: number;
		at: number;
		len: number;
		rest: boolean;
		x: number;
		position: number;
		accidental: number | null;
		bar: number;
	}

	const layout = $derived.by(() => {
		const barLength = melody.meter * 4;
		const bars: { notes: Placed[]; width: number }[] = [];
		let sounding = 0;
		for (let bar = 0; bar < melody.bars; bar++) {
			// Accidentals hold to the end of the bar; the key signature otherwise.
			const shown = new Map<number, number>();
			const notes: Placed[] = [];
			let x = 12;
			melody.notes.forEach((note, index) => {
				if (note.at < bar * barLength || note.at >= (bar + 1) * barLength) return;
				let accidental: number | null = null;
				let position = 4;
				if (note.pitch) {
					const at = diatonic(note.pitch);
					const current = shown.get(at) ?? alterInKey(note.pitch.step, melody.fifths);
					if (note.pitch.alter !== current) {
						accidental = note.pitch.alter;
						shown.set(at, note.pitch.alter);
						x += 11;
					}
					position = staffPosition(melody.clef, note.pitch);
				}
				notes.push({ index, sounding: note.pitch ? sounding++ : -1, at: note.at, len: note.len, rest: note.rest, x, position, accidental, bar });
				x += room(note.len);
			});
			bars.push({ notes, width: x });
		}
		const lines: { bars: typeof bars; start: number; content: number }[] = [];
		for (let i = 0; i < bars.length; i += PER_LINE) {
			const some = bars.slice(i, i + PER_LINE);
			lines.push({ bars: some, start: bodyStart(lines.length), content: some.reduce((sum, bar) => sum + bar.width, 0) });
		}
		// Every line as wide as the widest, its notes spread out to fill it.
		const width = Math.max(...lines.map((line) => line.start + line.content)) + 8;
		return lines.map((line, number) => {
			const stretch = (width - 8 - line.start) / line.content;
			let left = line.start;
			const placedBars = line.bars.map((bar) => {
				const from = left;
				left += bar.width * stretch;
				return { from, to: left, notes: bar.notes.map((note) => ({ ...note, x: from + note.x * stretch })) };
			});
			return { number, width, bars: placedBars };
		});
	});

	type Note = Placed;
	/** Short notes within one beat: beamed when two or more, else flagged. */
	function groupsOf(notes: Note[]) {
		const byBeat = new Map<number, Note[]>();
		for (const note of notes) {
			if (note.rest || note.len >= 4) continue;
			const beat = Math.floor(note.at / 4);
			if (note.at + note.len > (beat + 1) * 4) continue;
			byBeat.set(beat, [...(byBeat.get(beat) ?? []), note]);
		}
		return [...byBeat.values()];
	}

	/** Stems, beams and flags for a bar's notes. */
	function stemsOf(notes: Note[]) {
		const stems: { x: number; from: number; to: number; note: Note }[] = [];
		const beams: { x1: number; x2: number; y: number }[] = [];
		const flags: { x: number; y: number; up: boolean; count: number; note: Note }[] = [];
		const grouped = new Set<Note>();
		for (const group of groupsOf(notes)) {
			if (group.length < 2) continue;
			group.forEach((note) => grouped.add(note));
			const up = group.reduce((sum, note) => sum + note.position, 0) / group.length < 4;
			const heads = group.map((note) => y(note.position));
			const beamY = up ? Math.min(...heads) - STEM : Math.max(...heads) + STEM;
			const stemX = (note: Note) => note.x + (up ? 5.6 : -5.6);
			for (const note of group) stems.push({ x: stemX(note), from: y(note.position), to: beamY, note });
			const thick = 4.6;
			const primary = up ? beamY : beamY - thick;
			beams.push({ x1: stemX(group[0]) - 0.6, x2: stemX(group[group.length - 1]) + 0.6, y: primary });
			const second = up ? beamY + 7.5 : beamY - thick - 7.5;
			group.forEach((note, i) => {
				if (note.len !== 1) return;
				const next = group[i + 1];
				const before = group[i - 1];
				if (next?.len === 1) beams.push({ x1: stemX(note) - 0.6, x2: stemX(next) + 0.6, y: second });
				else if (before?.len !== 1) {
					const stub = i === group.length - 1 ? [stemX(note) - 8, stemX(note)] : [stemX(note), stemX(note) + 8];
					beams.push({ x1: stub[0] - 0.6, x2: stub[1] + 0.6, y: second });
				}
			});
		}
		for (const note of notes) {
			if (note.rest || note.len >= 16 || grouped.has(note)) continue;
			const up = note.position < 4;
			const head = y(note.position);
			const x = note.x + (up ? 5.6 : -5.6);
			const end = up ? head - STEM : head + STEM;
			stems.push({ x, from: head, to: end, note });
			if (note.len < 4) flags.push({ x, y: end, up, count: note.len === 1 ? 2 : 1, note });
		}
		return { stems, beams, flags };
	}

	const markOf = (note: Note) => (note.sounding >= 0 ? (marks[note.sounding] ?? null) : null);
	const hollow = (len: number) => len >= 8;
	const dotted = (len: number) => len === 3 || len === 6 || len === 12;
</script>

<div class="sight" role="img" aria-label={label}>
	<!-- Over the empty room above the first staff: a percentage margin scales with the line's width, as the staff does. -->
	<p class="tempo" style:margin-bottom="-{(42 / (layout[0]?.width ?? 600)) * 100}%"><TempoMark bpm={melody.bpm} /></p>
	{#each layout as line (line.number)}
		<svg viewBox="0 0 {line.width} 145" class="line">
			{#each [0, 2, 4, 6, 8] as each (each)}
				<line x1="2" x2={line.width - 2} y1={y(each)} y2={y(each)} class="staffline" />
			{/each}
			<StaffClef clef={melody.clef} top={y(8)} />
			{#each signature as accidental, i (i)}
				<StaffAccidental alter={accidental.alter} x={48 + i * 10} y={y(signatureAt[i])} />
			{/each}
			{#if line.number === 0}
				{@const timeX = 44 + signature.length * 10 + 14}
				<text x={timeX} y={y(6) + 7.5} text-anchor="middle" class="time">{melody.meter}</text>
				<text x={timeX} y={y(2) + 7.5} text-anchor="middle" class="time">4</text>
			{/if}

			{#each line.bars as bar (bar.from)}
				{@const parts = stemsOf(bar.notes)}
				{@const isLast = bar.notes[0]?.bar === melody.bars - 1}
				<g class="bar" class:hidden={hidden.includes(bar.notes[0]?.bar ?? -1)}>
					{#each bar.notes as note (note.index)}
						{@const mark = markOf(note)}
						<g class="note" class:right={mark === 'right'} class:wrong={mark === 'wrong'} class:off={mark === 'off'} class:now={now === note.index}>
							{#if note.rest}
								<g transform="translate({note.x} {y(4)})">
									{#if note.len === 4}
										<path d="M-2 -15 L4 -8 L-1 -2 L4 5 C-2 2 -4 8 1 12" class="pen" />
									{:else if note.len === 2}
										<circle cx="-2" cy="-7" r="2.6" />
										<path d="M-2 -5 C1 -4 3 -6 4.5 -8 L-1 9" class="pen thin" />
									{:else}
										<rect x="-5" y={note.len >= 16 ? -10 : -5} width="10" height="5" />
									{/if}
								</g>
							{:else}
								{#each ledgerLines(note.position) as ledger (ledger)}
									<line x1={note.x - 11} x2={note.x + 11} y1={y(ledger)} y2={y(ledger)} class="staffline ledger" />
								{/each}
								{#if note.accidental !== null}<StaffAccidental alter={note.accidental} x={note.x - 16} y={y(note.position)} />{/if}
								<ellipse
									cx={note.x}
									cy={y(note.position)}
									rx="6.4"
									ry="4.4"
									transform="rotate(-20 {note.x} {y(note.position)})"
									class:hollow={hollow(note.len)}
								/>
								{#if dotted(note.len)}<circle cx={note.x + 11} cy={y(note.position) - (note.position % 2 === 0 ? 2.5 : 0)} r="2" />{/if}
								{#if note.sounding >= 0 && captions[note.sounding]}
									<text x={note.x} y="140" text-anchor="middle" class="caption">{captions[note.sounding]}</text>
								{/if}
							{/if}
						</g>
					{/each}
					{#each parts.stems as stem (stem.note.index)}
						{@const mark = markOf(stem.note)}
						<line
							x1={stem.x}
							x2={stem.x}
							y1={stem.from}
							y2={stem.to}
							class="stem"
							class:right={mark === 'right'}
							class:wrong={mark === 'wrong'}
							class:off={mark === 'off'}
							class:now={now === stem.note.index}
						/>
					{/each}
					{#each parts.flags as flag (flag.note.index)}
						{#each Array.from({ length: flag.count }, (_, i) => i) as i (i)}
							<path d="M{flag.x} {flag.y + (flag.up ? i * 7 : -i * 7)} c1 {flag.up ? 8 : -8} 10 {flag.up ? 10 : -10} 8 {flag.up ? 22 : -22}" class="pen thin" />
						{/each}
					{/each}
					{#each parts.beams as beam, i (i)}
						<rect x={beam.x1} y={beam.y} width={beam.x2 - beam.x1} height="4.6" />
					{/each}
				</g>
				{#if isLast}
					<line x1={line.width - 9} x2={line.width - 9} y1={y(8)} y2={y(0)} class="staffline" />
					<rect x={line.width - 6} y={y(8)} width="4" height="40" />
				{:else}
					<line x1={bar.to} x2={bar.to} y1={y(8)} y2={y(0)} class="staffline barline" />
				{/if}
			{/each}
		</svg>
	{/each}
</div>

<style>
	.sight {
		display: grid;
		gap: var(--space-1);
		width: 100%;
		max-width: 680px;
		margin-inline: auto;
		color: var(--text);
	}

	.tempo {
		position: relative;
		margin-left: var(--space-2);
		font-size: 1.05rem;
	}

	.line {
		display: block;
		width: 100%;
		height: auto;
		fill: currentColor;
	}

	.staffline {
		stroke: currentColor;
		stroke-width: 1.1;
		opacity: 0.85;
	}

	.ledger {
		stroke-width: 1.4;
		opacity: 1;
	}

	.barline {
		stroke-width: 1.3;
	}

	.time {
		font-family: var(--font-display, serif);
		font-size: 22px;
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

	.bar {
		transition: opacity 0.15s;
	}

	.bar.hidden {
		opacity: 0;
	}

	.note,
	.stem {
		transition: color 0.15s;
	}

	.right {
		color: var(--ok);
	}

	.wrong {
		color: var(--danger);
	}

	.off {
		color: var(--warn);
	}

	.now {
		color: var(--accent);
	}

	.caption {
		font-size: 9px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>

<script lang="ts">
	import StaffAccidental from './staff/StaffAccidental.svelte';
	import StaffClef from './staff/StaffClef.svelte';
	import { alterInKey, keySignature, ledgerLines, SIGNATURE_POSITIONS, staffPosition, type Clef, type Pitch } from '#lib/practice/drills/theory.ts';

	/**
	 * One staff for the Übebereich's drills (#300): a clef, a key signature and up to two whole
	 * notes, one after the other or `together` as a chord, drawn in SVG in the text colour, so it
	 * needs no music font and works offline in either theme. A note the key signature doesn't
	 * account for gets its accidental. `state` colours the notes after an answer, `marks` each
	 * note on its own (a scale: right, wrong, or right but out of tune), with `captions` under them.
	 */
	type Mark = 'right' | 'wrong' | 'off' | null;
	let {
		clef,
		fifths = 0,
		notes = [],
		together = false,
		state = null,
		marks = [],
		captions = [],
		spacing = 46,
		label
	}: {
		clef: Clef;
		fifths?: number;
		notes?: Pitch[];
		together?: boolean;
		state?: 'right' | 'wrong' | null;
		marks?: Mark[];
		captions?: string[];
		/** Room between notes side by side. */
		spacing?: number;
		label: string;
	} = $props();

	/** Staff units: a space is 10, the bottom line at BASE, room for three ledger lines either side. */
	const BASE = 90;
	const y = (position: number) => BASE - position * 5;
	const signature = $derived(keySignature(fifths));
	const signatureAt = $derived(SIGNATURE_POSITIONS[clef][fifths >= 0 ? 'sharps' : 'flats']);
	const SIGNATURE_X = 46;
	/** Where each note goes: side by side, or stacked, a second's upper note beside the lower one. */
	const placed = $derived(
		notes.map((pitch, i) => {
			const position = staffPosition(clef, pitch);
			const accidental = pitch.alter !== alterInKey(pitch.step, fifths) ? pitch.alter : null;
			const second = together && i > 0 && Math.abs(position - staffPosition(clef, notes[i - 1])) === 1;
			const x = SIGNATURE_X + signature.length * 10 + 40 + (together ? (second ? 13 : 0) : i * spacing);
			return { position, accidental, x };
		})
	);
	const width = $derived(Math.max(150, Math.max(SIGNATURE_X + signature.length * 10, ...placed.map((note) => note.x)) + 34));
</script>

<svg class="staff" class:long={notes.length > 4} viewBox="0 0 {width} 140" role="img" aria-label={label}>
	{#each [0, 2, 4, 6, 8] as line (line)}
		<line x1="2" x2={width - 2} y1={y(line)} y2={y(line)} class="line" />
	{/each}

	<StaffClef {clef} top={y(8)} />


	{#each signature as accidental, i (i)}
		<StaffAccidental alter={accidental.alter} x={SIGNATURE_X + i * 10 + 4} y={y(signatureAt[i])} />
	{/each}

	{#each placed as note, i (i)}
		{@const mark = marks[i] ?? state}
		<g class="note" class:right={mark === 'right'} class:wrong={mark === 'wrong'} class:off={mark === 'off'}>
			{#each ledgerLines(note.position) as line (line)}
				<line x1={note.x - 11} x2={note.x + 11} y1={y(line)} y2={y(line)} class="line ledger" />
			{/each}
			{#if note.accidental !== null}<StaffAccidental alter={note.accidental} x={note.x - 16 - (together && i > 0 ? 10 : 0)} y={y(note.position)} />{/if}
			<ellipse cx={note.x} cy={y(note.position)} rx="6.4" ry="4.4" transform="rotate(-20 {note.x} {y(note.position)})" class="head" />
			{#if captions[i]}<text x={note.x} y="136" text-anchor="middle" class="caption">{captions[i]}</text>{/if}
		</g>
	{/each}
</svg>

<style>
	.staff {
		display: block;
		width: 100%;
		max-width: 420px;
		height: auto;
		margin-inline: auto;
		color: var(--text);
		fill: currentColor;
	}

	.line {
		stroke: currentColor;
		stroke-width: 1.1;
		opacity: 0.85;
	}

	.ledger {
		stroke-width: 1.4;
		opacity: 1;
	}

	.head {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
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

	.note.off {
		color: var(--warn);
	}

	.staff.long {
		max-width: 640px;
	}

	.caption {
		font-size: 9px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>

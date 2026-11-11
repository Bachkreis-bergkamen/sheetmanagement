<script lang="ts">
	import { alterInKey, keySignature, ledgerLines, SIGNATURE_POSITIONS, staffPosition, type Clef, type Pitch } from '#lib/practice/drills/theory.ts';

	/**
	 * One staff for the Übebereich's drills (#300): a clef, a key signature and up to two whole
	 * notes, one after the other or `together` as a chord, drawn in SVG in the text colour, so it
	 * needs no music font and works offline in either theme. A note the key signature doesn't
	 * account for gets its accidental. `state` colours the notes after an answer.
	 */
	let {
		clef,
		fifths = 0,
		notes = [],
		together = false,
		state = null,
		label
	}: { clef: Clef; fifths?: number; notes?: Pitch[]; together?: boolean; state?: 'right' | 'wrong' | null; label: string } = $props();

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
			const x = SIGNATURE_X + signature.length * 10 + 40 + (together ? (second ? 13 : 0) : i * 46);
			return { position, accidental, x };
		})
	);
	const width = $derived(Math.max(150, Math.max(SIGNATURE_X + signature.length * 10, ...placed.map((note) => note.x)) + 34));
	/** The C clef's middle: the alto's third line, the tenor's fourth. */
	const cCentre = $derived(clef === 'alto' ? y(4) : y(6));
</script>

<svg class="staff" viewBox="0 0 {width} 140" role="img" aria-label={label}>
	{#each [0, 2, 4, 6, 8] as line (line)}
		<line x1="2" x2={width - 2} y1={y(line)} y2={y(line)} class="line" />
	{/each}

	<g class="clef">
		{#if clef === 'treble'}
			<g transform="translate(8 {y(8)})">
				<path
					d="M15.5 33 C11 34 9 29 13 26.5 C18 24 23 28 21 34 C19 40 7 41 4 33 C1 25 9 18 15 12 C21 6 22 -4 18 -9 C15 -13 11 -6 12 0 L16 46 C17 52 11 55 8 51"
					class="pen"
				/>
				<circle cx="9.5" cy="50" r="3" />
			</g>
		{:else if clef === 'bass'}
			<g transform="translate(8 {y(8)})">
				<circle cx="5.5" cy="10" r="3.6" />
				<path d="M3 11 C2 2 18 -1 21 9 C23 19 14 30 2 36" class="pen thick" />
				<circle cx="27" cy="5" r="2" />
				<circle cx="27" cy="15" r="2" />
			</g>
		{:else}
			<g transform="translate(8 {cCentre})">
				<rect x="1" y="-20" width="4.5" height="40" />
				<rect x="7.5" y="-20" width="1.6" height="40" />
				<path d="M9.5 0 C12.5 -2 13.5 -6 14.5 -11 C15.5 -17 19.5 -20 23.5 -19 C28 -18 28 -9 23 -9" class="pen" />
				<path d="M9.5 0 C12.5 2 13.5 6 14.5 11 C15.5 17 19.5 20 23.5 19 C28 18 28 9 23 9" class="pen" />
				<circle cx="23" cy="-10.5" r="2.4" />
				<circle cx="23" cy="10.5" r="2.4" />
			</g>
		{/if}
	</g>

	{#snippet accidentalSign(alter: number, x: number, at: number)}
		<g transform="translate({x} {at})" class="accidental">
			{#if alter > 0}
				<line x1="-1.8" x2="-1.8" y1="-9" y2="11" class="thin" />
				<line x1="1.8" x2="1.8" y1="-11" y2="9" class="thin" />
				<line x1="-4.2" x2="4.2" y1="-2" y2="-4.6" class="bar" />
				<line x1="-4.2" x2="4.2" y1="4.6" y2="2" class="bar" />
			{:else if alter < 0}
				<line x1="-2.5" x2="-2.5" y1="-14" y2="4.5" class="thin" />
				<path d="M-2.5 4.5 C4.5 0 4.5 -6.5 -2.5 -2.5" class="pen" />
			{:else}
				<!-- A natural: two stems and two slanted bars. -->
				<line x1="-2.2" x2="-2.2" y1="-11" y2="5" class="thin" />
				<line x1="2.2" x2="2.2" y1="-5" y2="11" class="thin" />
				<line x1="-2.2" x2="2.2" y1="-1.5" y2="-3.5" class="bar" />
				<line x1="-2.2" x2="2.2" y1="4" y2="2" class="bar" />
			{/if}
		</g>
	{/snippet}

	{#each signature as accidental, i (i)}
		{@render accidentalSign(accidental.alter, SIGNATURE_X + i * 10 + 4, y(signatureAt[i]))}
	{/each}

	<g class="note" class:right={state === 'right'} class:wrong={state === 'wrong'}>
		{#each placed as note, i (i)}
			{#each ledgerLines(note.position) as line (line)}
				<line x1={note.x - 11} x2={note.x + 11} y1={y(line)} y2={y(line)} class="line ledger" />
			{/each}
			{#if note.accidental !== null}{@render accidentalSign(note.accidental, note.x - 16 - (together && i > 0 ? 10 : 0), y(note.position))}{/if}
			<ellipse cx={note.x} cy={y(note.position)} rx="6.4" ry="4.4" transform="rotate(-20 {note.x} {y(note.position)})" class="head" />
		{/each}
	</g>
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

	.pen {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.pen.thick {
		stroke-width: 3;
	}

	.thin {
		stroke: currentColor;
		stroke-width: 1.3;
	}

	.bar {
		stroke: currentColor;
		stroke-width: 2.6;
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
</style>

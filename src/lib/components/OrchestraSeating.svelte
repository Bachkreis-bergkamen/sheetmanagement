<script lang="ts" module>
	import type { InstrumentFamily } from '#lib/config/types.ts';

	/**
	 * Where each instrument sits, seen from the conductor: distance from the podium (0 to 1)
	 * and angle (−90° far left, 90° far right). The usual German/American seating: first
	 * violins front left, cellos front right, violas behind them, basses at the right edge;
	 * woodwinds in two rows in the middle, horns behind them, trumpets, trombones and tuba at
	 * the back; timpani and percussion at the back right, harp and keyboards at the back left.
	 */
	const SEATS: Record<string, [number, number]> = {
		// Strings: the front arc and the right side.
		Geige: [0.46, -62],
		Violoncello: [0.46, 62],
		Viola: [0.72, 52],
		Kontrabass: [0.94, 70],
		'E-Bass': [0.94, 80],
		// Woodwinds: two rows in the middle.
		Flöte: [0.3, -36],
		Oboe: [0.3, 36],
		Blockflöte: [0.3, -64],
		'Tenor-Blockflöte': [0.3, -64],
		Englischhorn: [0.55, 42],
		Piccolo: [0.55, -42],
		Klarinette: [0.55, -14],
		Fagott: [0.55, 14],
		Bassklarinette: [0.55, -56],
		'Sopran-Saxophon': [0.55, 42],
		'Alt-Saxophon': [0.55, 42],
		Saxophon: [0.55, 42],
		'Tenor-Saxophon': [0.76, 30],
		'Bariton-Saxophon': [0.76, 40],
		// Brass behind them, trumpets to tuba at the back.
		Horn: [0.76, -14],
		Bariton: [0.76, 14],
		Trompete: [0.98, -24],
		Posaune: [0.98, -4],
		Bassposaune: [0.98, 8],
		Tuba: [0.98, 20],
		// Timpani and percussion at the back right, harp and keyboards at the back left.
		Pauke: [0.98, 42],
		Schlagwerk: [0.98, 56],
		Harfe: [0.9, -70],
		Klavier: [0.98, -46],
		Orgel: [0.98, -58],
		Synthesizer: [0.98, -36],
		// Continuo and soloists beside the podium, the choir behind everyone.
		Cembalo: [0.2, -58],
		Continuo: [0.2, -58],
		Sopran: [0.2, 58],
		Gesang: [0.2, 58],
		Chor: [1.04, -10]
	};

	/** Anything else by its family, near its section. */
	const FAMILY_SEATS: Record<InstrumentFamily, [number, number]> = {
		partitur: [0.18, 0],
		holz: [0.55, 30],
		blech: [0.98, 30],
		schlagwerk: [0.98, 50],
		tasten: [0.98, -46],
		streicher: [0.72, 62],
		gesang: [0.2, 58],
		sonstige: [0.76, -40]
	};
</script>

<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import { voiceText, type ScoredVoice } from '#lib/music/instrumentation.ts';
	import InstrumentGlyph from './InstrumentGlyph.svelte';

	/**
	 * A piece's Besetzung (#249) as a small seating plan: only the instruments it's written for,
	 * each in its place on the risers, labelled the way scores abbreviate them, and the score
	 * on the conductor's stand, always needed. One without a part to play from (or no score) is
	 * ringed in the warning colour and named underneath.
	 */
	let { voices, missing, score }: { voices: ScoredVoice[]; missing: ScoredVoice[]; score: boolean } = $props();

	/**
	 * Across, a row reaches 46 % of the width either side of the podium; in depth 68 % of the
	 * height (the back step's top stays inside the plan), so the rows keep their distance however wide the plan is (taller on phones).
	 */
	const WIDE = 46;
	const DEEP = 68;
	const lacking = $derived(new Set(missing.map((voice) => voice.instrument)));

	const family = (name: string) => config.instruments.find((instrument) => instrument.name === name)?.family ?? 'sonstige';
	const abbr = (name: string) => t.seating.abbr[name] ?? instrumentLabel(name).slice(0, 3);
	const numbers = (voice: ScoredVoice) => (voice.numbers.length ? voice.numbers.join('·') : '');

	/** The risers, as on a concert stage: each step higher than the one in front (by LIFT). */
	const RISERS = [0.4, 0.66, 0.87, 1.1];
	const LIFT = 4;
	const step = (r: number) => Math.max(0, RISERS.findIndex((edge) => r <= edge));

	/** In percent of the plan: across from the left, down from the top; up on its step. */
	const place = (r: number, angle: number) => {
		const a = (angle * Math.PI) / 180;
		return { x: 50 + WIDE * r * Math.sin(a), y: 90 - DEEP * r * Math.cos(a) - step(r) * LIFT };
	};

	/** Seats for what's in the piece; two that would overlap move apart along their row. */
	const seats = $derived.by(() => {
		const placed: { voice: ScoredVoice; x: number; y: number }[] = [];
		for (const voice of voices) {
			const [r, angle] = SEATS[voice.instrument] ?? FAMILY_SEATS[family(voice.instrument)];
			let turn = angle;
			let spot = place(r, turn);
			for (let tries = 0; tries < 12 && placed.some((seat) => Math.abs(seat.x - spot.x) < 10 && Math.abs(seat.y - spot.y) < 14); tries++) {
				turn += angle < 0 ? -8 : 8;
				spot = place(r, turn);
			}
			placed.push({ voice, ...spot });
		}
		return placed;
	});

	/** A step's top: a half ellipse standing on its own height. */
	const top = (r: number, lift: number) => `M${50 - WIDE * r} ${90 - lift}A${WIDE * r} ${DEEP * r} 0 0 1 ${50 + WIDE * r} ${90 - lift}Z`;
	/** Its front, down to the floor: the darker band that makes it a step. */
	const front = (r: number, lift: number) => `M${50 - WIDE * r} ${90 - lift}H${50 + WIDE * r}V90H${50 - WIDE * r}Z`;
	const steps = RISERS.map((r, k) => ({ r, lift: k * LIFT })).reverse();
</script>

<figure class="seating">
	<div class="plan" aria-hidden="true">
		<svg class="stage" viewBox="0 0 100 100" preserveAspectRatio="none">
			<!-- From the back to the front: each nearer, lower step covers the foot of the one behind. -->
			{#each steps as { r, lift }, i (r)}
				<path class="face" d={front(r, lift)} />
				<path class="riser" class:alt={i % 2 === 1} d={top(r, lift)} />
				{#if lift}<path class="face" d={top(RISERS[RISERS.indexOf(r) - 1], lift)} />{/if}
			{/each}
			<path class="podium" d="M41 100A9 15 0 0 1 59 100Z" />
		</svg>
		<!-- The score on the conductor's stand: every piece needs one. -->
		<span class="seat podium-seat" class:warn={!score} style:left="50%" style:top="91%" title={t.seating.score}>
			<span class="disc"><InstrumentGlyph glyph={glyphOf('Partitur')} size={20} /></span>
			<span class="label">{t.seating.scoreShort}</span>
		</span>
		{#each seats as seat (seat.voice.instrument)}
			<span class="seat" class:warn={lacking.has(seat.voice.instrument)} style:left="{seat.x}%" style:top="{seat.y}%" title={voiceText(seat.voice)}>
				<span class="disc"><InstrumentGlyph glyph={glyphOf(seat.voice.instrument)} size={20} /></span>
				<span class="label">{abbr(seat.voice.instrument)}{#if numbers(seat.voice)}<small>{numbers(seat.voice)}</small>{/if}</span>
			</span>
		{/each}
	</div>
	<!-- For screen readers and for the record: the Besetzung as text. -->
	<figcaption>
		<ul class="sr-only">
			<li>{t.seating.score}{score ? '' : ` (${t.seating.noPart})`}</li>
			{#each voices as voice (voice.instrument)}<li>{voiceText(voice)}{lacking.has(voice.instrument) ? ` (${t.seating.noPart})` : ''}</li>{/each}
		</ul>
		{#if missing.length || !score}
			<p class="missing"><span class="mark" aria-hidden="true"></span>{t.seating.missing([...(score ? [] : [t.seating.score]), ...missing.map(voiceText)].join(', '))}</p>
		{/if}
	</figcaption>
</figure>

<style>
	.seating {
		display: grid;
		gap: var(--space-3);
		margin: 0;
	}

	.plan {
		position: relative;
		width: 100%;
		margin-bottom: var(--space-4);
		aspect-ratio: 16 / 9;
	}

	/* On a phone the rows need the depth more than the width. */
	@media (max-width: 560px) {
		.plan {
			aspect-ratio: 1;
		}
	}

	.stage {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	/* The widest arc first, each nearer row painted over it. */
	.riser {
		fill: var(--surface-2);
		stroke: var(--border);
		stroke-width: 0.25;
		vector-effect: non-scaling-stroke;
	}

	/* The steps' fronts: the shade that makes the risers read as steps. */
	.face {
		fill: color-mix(in oklab, var(--text-muted) 18%, var(--surface-2));
	}

	.riser.alt {
		fill: color-mix(in oklab, var(--surface-2) 45%, var(--surface));
	}

	.podium {
		fill: var(--accent-soft);
		stroke: color-mix(in oklab, var(--accent) 50%, transparent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.seat {
		position: absolute;
		display: grid;
		justify-items: center;
		gap: 2px;
		translate: -50% -50%;
		cursor: default;
	}

	.disc {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--surface);
		color: var(--accent);
		box-shadow: var(--shadow);
	}

	.label {
		display: inline-flex;
		align-items: baseline;
		gap: 2px;
		padding: 0 5px;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--surface) 85%, transparent);
		color: var(--text);
		font-size: var(--text-2xs);
		font-weight: 650;
		line-height: 1.4;
		white-space: nowrap;
	}

	.label small {
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	/* Written for, but no part to play from. */
	.seat.warn .disc {
		border: 2px solid var(--warn);
		color: var(--warn);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--warn) 18%, transparent);
	}

	.seat.warn .label {
		color: var(--warn);
	}

	figcaption {
		display: contents;
	}

	.missing {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.mark {
		flex: none;
		width: 12px;
		height: 12px;
		border: 2px solid var(--warn);
		border-radius: 50%;
	}

	@media (max-width: 480px) {
		.disc {
			width: 30px;
			height: 30px;
		}
	}
</style>

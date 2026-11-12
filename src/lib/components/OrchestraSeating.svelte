<script lang="ts">
	import { config } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import { glyphOf } from '#lib/music/instrument-glyph.ts';
	import { instrumentLabel } from '#lib/music/instrument-label.ts';
	import { voiceText, type ScoredVoice } from '#lib/music/instrumentation.ts';
	import InstrumentGlyph from './InstrumentGlyph.svelte';
	import { layoutSeating, MARKER, sectionsFromBesetzung, type SeatingFamily, type SeatingOverrides } from '#lib/music/seating.ts';

	/**
	 * A piece's Besetzung (#249) as a seating plan, laid out from the sections it needs rather
	 * than drawn: the conductor in front, the players on half rings around them, each family in
	 * its usual place, as many chairs as an orchestra of that size has (estimated where the
	 * Besetzung doesn't say), labelled the way scores abbreviate. A section without a part to
	 * play from is ringed in the warning colour and named underneath, and so is the score.
	 */
	let {
		voices,
		missing,
		score,
		soloists = [],
		counts,
		overrides = config.seating?.overrides
	}: {
		voices: ScoredVoice[];
		missing: ScoredVoice[];
		score: boolean;
		soloists?: string[];
		/** Players per section where the estimate isn't right, by section id ("Geige:1") or instrument. */
		counts?: Record<string, number>;
		/** A concert's or the orchestra's own spots for sections. */
		overrides?: SeatingOverrides;
	} = $props();

	const lacking = $derived(new Set(missing.map((voice) => voice.instrument)));
	const families = new Map(config.instruments.map((instrument) => [instrument.name, instrument.family]));
	const abbr = (name: string) => t.seating.abbr[name] ?? instrumentLabel(name).slice(0, 3);

	const sections = $derived(
		sectionsFromBesetzung({
			voices,
			missing,
			soloists,
			counts,
			familyOf: (name) => families.get(name),
			abbr,
			title: voiceText,
			soloLabel: t.seating.solo
		})
	);

	/**
	 * At most this many pixels a seat, so a small ensemble stays small and a full orchestra a
	 * picture beside the parts rather than the page; less when the plan must fit a phone.
	 */
	const MOST = 24;
	/** Never fewer: a large orchestra on a phone scrolls sideways rather than shrink past reading. */
	const LEAST = 19;
	/** Labels never smaller than this on screen. */
	const LEGIBLE = 10.5;
	let width = $state(0);
	const fit = (w: number) => (width ? Math.max(LEAST, Math.min(MOST, width / w)) : MOST);
	const plan = $derived.by(() => {
		const first = layoutSeating(sections, { overrides });
		const scale = fit(first.box.w);
		const labelSize = Math.max(0.36, LEGIBLE / scale);
		return labelSize > 0.36 ? layoutSeating(sections, { overrides, labelSize }) : first;
	});
	const scale = $derived(fit(plan.box.w));
	/** Scrolling sideways, it starts with the conductor in the middle. */
	let scroller: HTMLDivElement | undefined = $state();
	$effect(() => {
		const wide = plan.box.w * scale > width;
		if (!scroller || !wide) return;
		const frame = requestAnimationFrame(() => {
			if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
		});
		return () => cancelAnimationFrame(frame);
	});
	/** The instruments' drawings in the chairs, as long as they're big enough to make out. */
	const ICON = MARKER * 1.25;
	const icons = $derived(ICON * scale >= 9);
	const instrumentOf = $derived(new Map(sections.map((section) => [section.id, section.instrument])));

	/** A half ring's floor, out to radius r. */
	const zone = (r: number) => `M${-r} 0A${r} ${plan.flat * r} 0 0 1 ${r} 0Z`;
	const families_shown = $derived([...new Set(plan.seats.map((seat) => seat.family))] as SeatingFamily[]);
	const familyName = (family: SeatingFamily) => (t.piece.groups as Record<string, string>)[family] ?? family;
</script>

<figure class="seating">
	<div class="plan" bind:clientWidth={width} bind:this={scroller}>
		<svg
			viewBox="{plan.box.x} {plan.box.y} {plan.box.w} {plan.box.h}"
			width={plan.box.w * scale}
			height={plan.box.h * scale}
			aria-hidden="true"
		>
			<!-- The zones, back to front: each nearer one painted over the one behind. -->
			{#each plan.zones as each, i (i)}
				<path class="zone" class:alt={(plan.zones.length - i) % 2 === 0} d={zone(each.r)} />
			{/each}
			<!-- The conductor, with the score on the stand: every piece needs one. -->
			<g class="conductor" class:warn={!score}>
				<title>{t.seating.score}{score ? '' : ` (${t.seating.noPart})`}</title>
				<path class="podium" d="M-0.7 0.05A0.7 0.55 0 0 1 0.7 0.05Z" />
				<circle r="0.4" cy="-0.05" />
				<text y="0.82" font-size={plan.labels[0]?.h ?? 0.36}>{t.seating.scoreShort}</text>
			</g>
			{#each plan.seats as seat (seat.id)}
				<g class="seat fam-{seat.family}" class:warn={seat.warn} class:solo={seat.solo}>
					<title>{seat.title}{seat.warn ? ` (${t.seating.noPart})` : ''}</title>
					<circle cx={seat.x} cy={seat.y} r={MARKER} />
					{#if icons}<InstrumentGlyph glyph={glyphOf(instrumentOf.get(seat.section) ?? '')} size={ICON} x={seat.x - ICON / 2} y={seat.y - ICON / 2} />{/if}
				</g>
			{/each}
			{#each plan.labels as label (label.section)}
				<text class="label fam-{label.family}" class:warn={label.warn} x={label.x} y={label.y} font-size={label.h * 0.92}>{label.text}</text>
			{/each}
		</svg>
	</div>
	<figcaption>
		<!-- Which colour is which family. -->
		<ul class="legend" aria-hidden="true">
			{#each families_shown as family (family)}
				<li><span class="dot fam-{family}"></span>{familyName(family)}</li>
			{/each}
		</ul>
		<!-- For screen readers and for the record: the Besetzung as text. -->
		<ul class="sr-only">
			<li>{t.seating.score}{score ? '' : ` (${t.seating.noPart})`}</li>
			{#each voices as voice (voiceText(voice))}<li>{voiceText(voice)}{lacking.has(voice.instrument) ? ` (${t.seating.noPart})` : ''}</li>{/each}
		</ul>
		{#if missing.length || !score}
			<p class="missing"><span class="mark" aria-hidden="true"></span>{t.seating.missing([...(score ? [] : [t.seating.score]), ...missing.map(voiceText)].join(', '))}</p>
		{/if}
	</figcaption>
</figure>

<style>
	.seating {
		/* The families: distinct, quiet, readable on paper and at night. */
		--fam-streicher: oklch(0.6 0.1 50);
		--fam-holz: oklch(0.6 0.09 150);
		--fam-blech: oklch(0.68 0.11 88);
		--fam-schlagwerk: oklch(0.58 0.08 255);
		--fam-tasten: oklch(0.58 0.08 320);
		--fam-gesang: oklch(0.6 0.1 15);
		--fam-sonstige: var(--text-muted);
		--fam-partitur: var(--text-muted);

		display: grid;
		gap: var(--space-3);
		margin: 0;
	}

	.plan {
		display: flex;
		width: 100%;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: thin;
	}

	svg {
		display: block;
		flex: none;
		margin-inline: auto;
		overflow: visible;
	}

	.zone {
		fill: var(--surface-2);
		stroke: var(--border);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.zone.alt {
		fill: color-mix(in oklab, var(--surface-2) 45%, var(--surface));
	}

	.podium {
		fill: var(--accent-soft);
	}

	.conductor circle {
		fill: var(--text);
	}

	.conductor text,
	.label {
		fill: var(--text);
		font-weight: 650;
		text-anchor: middle;
		dominant-baseline: central;
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.label {
		fill: color-mix(in oklab, var(--fam) 55%, var(--text));
	}

	.seat circle {
		fill: var(--fam);
		stroke: var(--surface);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	/* The instrument's drawing, cut out of the family's colour. */
	.seat {
		color: var(--surface);
	}

	/* Soloists out front: a ring of the accent. */
	.seat.solo circle {
		stroke: var(--accent);
		stroke-width: 2;
	}

	/* Written for, but no part to play from. */
	.seat.warn circle,
	.conductor.warn circle {
		fill: var(--surface);
		stroke: var(--warn);
		stroke-width: 2.5;
	}

	.seat.warn {
		color: var(--warn);
	}

	.label.warn,
	.conductor.warn text {
		fill: var(--warn);
	}

	.fam-streicher {
		--fam: var(--fam-streicher);
	}
	.fam-holz {
		--fam: var(--fam-holz);
	}
	.fam-blech {
		--fam: var(--fam-blech);
	}
	.fam-schlagwerk {
		--fam: var(--fam-schlagwerk);
	}
	.fam-tasten {
		--fam: var(--fam-tasten);
	}
	.fam-gesang {
		--fam: var(--fam-gesang);
	}
	.fam-sonstige,
	.fam-partitur {
		--fam: var(--fam-sonstige);
	}

	figcaption {
		display: contents;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--fam);
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
</style>

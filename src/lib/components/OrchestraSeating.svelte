<script lang="ts" module>
	/**
	 * The orchestra's own seating, seen from the conductor, as distance from the podium (0 to 1,
	 * one of the four risers in ROW) and angle (−90° far left, 90° far right). Like a regular
	 * orchestra, the strings fill wedges over several risers: first violins far left on risers
	 * 0 to 2, second violins on 0 and 1, violas in the middle of the front, cellos on 0 and 1 to
	 * the right, the basses behind them on 2. Woodwinds sit in the middle (flutes, oboes,
	 * piccolo; clarinets and cor anglais behind), the bassoons beside the cellos and horns; the
	 * brass at the back (trumpets, trombones, tuba, the saxophones between trombones and horns);
	 * percussion at the back right, harp, piano and mallets at the back left.
	 */
	const ROW = [0.28, 0.53, 0.77, 0.98];

	/** The string sections: their wedge (from, to) and risers; the label sits in front, in the middle. */
	const SECTIONS: Record<string, { from: number; to: number; rows: number[] }> = {
		'Geige:1': { from: -88, to: -58, rows: [0, 1, 2] },
		'Geige:2': { from: -54, to: -30, rows: [0, 1] },
		Viola: { from: -26, to: 22, rows: [0] },
		Violoncello: { from: 26, to: 58, rows: [0, 1] },
		Kontrabass: { from: 60, to: 88, rows: [2] }
	};

	const SEATS: Record<string, [number, number]> = {
		...Object.fromEntries(Object.entries(SECTIONS).map(([key, area]) => [key, [ROW[area.rows[0]], (area.from + area.to) / 2] as [number, number]])),
		Flöte: [ROW[1], -16],
		Oboe: [ROW[1], 2],
		Piccolo: [ROW[1], 18],
		Bassklarinette: [ROW[2], -50],
		Klarinette: [ROW[2], -32],
		Englischhorn: [ROW[2], -14],
		// Bassoons beside the cellos and the horns.
		Fagott: [ROW[2], 34],
		// The back riser: trumpets, trombones and tuba, the saxophones, then the horns.
		Trompete: [ROW[3], -40],
		Posaune: [ROW[3], -26],
		Bassposaune: [ROW[3], -18],
		Tuba: [ROW[3], -10],
		Bariton: [ROW[3], -10],
		Saxophon: [ROW[3], 4],
		'Sopran-Saxophon': [ROW[3], 4],
		'Alt-Saxophon': [ROW[3], 4],
		'Tenor-Saxophon': [ROW[3], 16],
		'Bariton-Saxophon': [ROW[3], 24],
		Horn: [ROW[3], 32],
		Pauke: [ROW[3], 48],
		Schlagwerk: [1.04, 62],
		Becken: [1.04, 58],
		Trommel: [1.04, 66],
		Tamtam: [1.04, 72],
		'Große Trommel': [1.04, 78],
		Tamburin: [1.04, 54],
		Harfe: [ROW[3], -78],
		Klavier: [ROW[3], -64],
		Xylophon: [1.04, -52],
		Glockenspiel: [1.04, -56],
		'Mallet Percussion': [1.04, -52]
	};

	/** Soloists and singers stand beside the conductor's stand, left and right in turn. */
	const SOLO_SPOTS = [
		{ x: 34, y: 90 },
		{ x: 66, y: 90 },
		{ x: 20, y: 90 },
		{ x: 80, y: 90 }
	];
	const SINGERS = new Set(['Sopran', 'Gesang']);
	/** Seats in a corner for what has no fixed place: two per corner, left first, then on down. */
	const CORNER_ROWS = [14, 31, 48];
	const corner = (i: number) => ({ x: Math.floor(i / 2) % 2 === 0 ? (i % 2 === 0 ? 9 : 91) : i % 2 === 0 ? 9 : 91, y: CORNER_ROWS[Math.min(Math.floor(i / 2), 2)] });
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
	let { voices, missing, score, soloists = [] }: { voices: ScoredVoice[]; missing: ScoredVoice[]; score: boolean; soloists?: string[] } = $props();

	/**
	 * Across, a row reaches 46 % of the width either side of the podium; in depth 68 % of the
	 * height (the back step's top stays inside the plan), so the rows keep their distance however wide the plan is (taller on phones).
	 */
	const WIDE = 46;
	const DEEP = 68;
	const lacking = $derived(new Set(missing.map((voice) => voice.instrument)));
	/** The plan's size on screen: seats keep their distance in pixels, so a wide plan seats more chairs. */
	let width = $state(343);
	let height = $state(343);
	const near = (a: { x: number; y: number }, b: { x: number; y: number }, dx: number, dy: number) =>
		(Math.abs(a.x - b.x) * width) / 100 < dx && (Math.abs(a.y - b.y) * height) / 100 < dy;

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

	type Seat = { key: string; instrument: string; label: string; title: string; warn: boolean; x: number; y: number; solo?: boolean };

	/** Violins by part where the Besetzung names parts, so first and second sit apart. */
	const split = (voice: ScoredVoice) =>
		voice.instrument === 'Geige' && voice.numbers.length > 1 ? voice.numbers.map((n) => ({ ...voice, numbers: [n] })) : [voice];
	const spotKey = (voice: ScoredVoice) => (voice.instrument === 'Geige' ? `Geige:${voice.numbers[0] === 2 ? 2 : 1}` : voice.instrument);
	const warns = (voice: ScoredVoice) => {
		const gap = missing.find((each) => each.instrument === voice.instrument);
		return !!gap && (!gap.numbers.length || !voice.numbers.length || voice.numbers.some((n) => gap.numbers.includes(n)));
	};

	/** Seats for what's in the piece: the fixed ones first, then the corners for the rest. */
	const layout = $derived.by(() => {
		const parts = voices.flatMap(split);
		const singers = parts.filter((voice) => SINGERS.has(voice.instrument));
		const loose = parts.filter((voice) => !SEATS[spotKey(voice)] && !SINGERS.has(voice.instrument));
		const placed: Seat[] = [];
		// Beside the score: the solo parts, then the singers of the Besetzung.
		const solos = [...soloists.map((instrument) => ({ instrument, numbers: [] as number[] })), ...singers.filter((voice) => !soloists.includes(voice.instrument))];
		solos.slice(0, SOLO_SPOTS.length).forEach((voice, i) => {
			placed.push({
				key: `solo:${voice.instrument}`,
				instrument: voice.instrument,
				label: SINGERS.has(voice.instrument) ? abbr(voice.instrument) : t.seating.solo,
				title: SINGERS.has(voice.instrument) ? voiceText(voice) : `${t.seating.solo}: ${instrumentLabel(voice.instrument)}`,
				warn: false,
				solo: true,
				...SOLO_SPOTS[i]
			});
		});
		const seat = (voice: ScoredVoice, x: number, y: number): Seat => ({
			key: `${voice.instrument}:${voice.numbers.join('-')}`,
			instrument: voice.instrument,
			label: abbr(voice.instrument),
			title: voiceText(voice),
			warn: warns(voice),
			x,
			y
		});
		loose.forEach((voice, i) => {
			const { x, y } = corner(i);
			placed.push(seat(voice, x, y));
		});
		const anchors: { key: string; seat: Seat; r: number; angle: number }[] = [];
		for (const voice of parts.filter((each) => SEATS[spotKey(each)] && !SINGERS.has(each.instrument))) {
			const [r, angle] = SEATS[spotKey(voice)];
			// Two that would overlap move apart along their row: a step out first, then a step in,
			// never past the stage's edge; with no free spot it keeps its own.
			const free = (spot: { x: number; y: number }) => !placed.some((other) => Math.abs(other.x - spot.x) < 10 && Math.abs(other.y - spot.y) < 14);
			const away = angle < 0 ? -1 : 1;
			let turn = angle;
			let spot = place(r, turn);
			for (const shift of [8, -8, 16, -16, 24]) {
				if (free(spot)) break;
				const next = angle + away * shift;
				if (Math.abs(next) > 86) continue;
				turn = next;
				spot = place(r, turn);
			}
			placed.push(seat(voice, spot.x, spot.y));
			anchors.push({ key: spotKey(voice), seat: placed[placed.length - 1], r, angle: turn });
		}
		// The rest of each string section's wedge, a chair wherever there's room.
		const chairs: (Seat & { chair: true })[] = [];
		for (const { key, seat: main } of anchors.filter((anchor) => SECTIONS[anchor.key])) {
			const area = SECTIONS[key];
			area.rows.forEach((row, i) => {
				for (let angle = area.from; angle <= area.to; angle += 6) {
					const spot = place(ROW[row], angle);
					if (spot.x < 3 || spot.x > 97 || spot.y < 6) continue;
					const clashes = placed.some((other) => near(other, spot, 34, 40)) || chairs.some((other) => near(other, spot, 24, 24));
					if (clashes) continue;
					chairs.push({ ...main, key: `${main.key}:chair${i}:${angle}`, x: spot.x, y: spot.y, chair: true });
				}
			});
		}
		return { seats: placed, chairs, corners: { left: loose.length > 0, right: loose.length > 1 } };
	});
	const numbersOf = (seat: Seat) => voices.flatMap(split).find((voice) => `${voice.instrument}:${voice.numbers.join('-')}` === seat.key);

	/** A step's top: a half ellipse standing on its own height. */
	const top = (r: number, lift: number) => `M${50 - WIDE * r} ${90 - lift}A${WIDE * r} ${DEEP * r} 0 0 1 ${50 + WIDE * r} ${90 - lift}Z`;
	/** Its front, down to the floor: the darker band that makes it a step. */
	const front = (r: number, lift: number) => `M${50 - WIDE * r} ${90 - lift}H${50 + WIDE * r}V90H${50 - WIDE * r}Z`;
	const steps = RISERS.map((r, k) => ({ r, lift: k * LIFT })).reverse();
</script>

<figure class="seating">
	<div class="plan" aria-hidden="true" bind:clientWidth={width} bind:clientHeight={height}>
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
		<!-- What has no fixed place waits in the top corners, and says so. -->
		{#if layout.corners.left}<span class="loose left">{t.seating.noFixedPlace}</span>{/if}
		{#if layout.corners.right}<span class="loose right">{t.seating.noFixedPlace}</span>{/if}
		<!-- The sections' other chairs first, so the labelled seats sit on top. -->
		{#each layout.chairs as chair (chair.key)}
			<span class="seat chair" class:warn={chair.warn} style:left="{chair.x}%" style:top="{chair.y}%">
				<span class="disc"><InstrumentGlyph glyph={glyphOf(chair.instrument)} size={14} /></span>
			</span>
		{/each}
		{#each layout.seats as seat (seat.key)}
			{@const voice = numbersOf(seat)}
			<span class="seat" class:warn={seat.warn} class:solo={seat.solo} style:left="{seat.x}%" style:top="{seat.y}%" title={seat.title}>
				<span class="disc"><InstrumentGlyph glyph={glyphOf(seat.instrument)} size={20} /></span>
				<span class="label">{seat.label}{#if voice && numbers(voice)}<small>{numbers(voice)}</small>{/if}</span>
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

	/* A section's other chairs: smaller and quieter, the labelled seat speaks for them. */
	.chair .disc {
		width: 24px;
		height: 24px;
		box-shadow: none;
		opacity: 0.75;
	}

	.chair.warn .disc {
		border-width: 1.5px;
		box-shadow: none;
	}

	/* Soloists beside the conductor: in the accent, they're out front. */
	.solo .disc {
		border-color: color-mix(in oklab, var(--accent) 45%, var(--border));
		background: var(--accent-soft);
	}

	/* "kein fester Platz": a quiet tag over the corner seats. */
	.loose {
		position: absolute;
		top: 0;
		padding: 0 6px;
		border: 1px dashed var(--border);
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		line-height: 1.5;
		white-space: nowrap;
	}

	.loose.left {
		left: 0;
	}

	.loose.right {
		right: 0;
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

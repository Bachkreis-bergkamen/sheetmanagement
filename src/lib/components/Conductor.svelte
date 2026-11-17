<script lang="ts" module>
	export type { ConductorMeter } from '#lib/practice/conducting.ts';
</script>

<script lang="ts">
	import BachFigure from './BachFigure.svelte';
	import { bachPose, type BachPose, type ConductorMeter } from '#lib/practice/conducting.ts';

	/**
	 * A conductor's beat (#315, #368), drawn as the figures are taught: the downbeat falls
	 * straight from the top onto 1, the beats land on one line with a small rebound after each,
	 * and the last beat swings up to the top again for the next downbeat. 2/4: 1 down, 2 a
	 * little to the right, then up. 3/4: 1 down, 2 to the right, 3 just above it, then up.
	 * 4/4: 1 down, 2 to the left, 3 across to the right, 4 just above it, then up. 6/8 (the
	 * German six): 1 down, 2 and 3 to the left, 4 across, 5 to the right, 6 above it, then up.
	 * Every beat takes the same time and the dot moves evenly within it, with no easing, so the
	 * beats come steadily; the way up and down into 1 is longer, as a conductor's hand falls
	 * into the downbeat. It flashes on the beat. `start` is when a bar's first beat is heard (the
	 * clock of `performance.now()`), null to rest on 1; `counting` draws it quieter, for a count-in.
	 *
	 * With `bach`, J. S. Bach beats the figure instead (BachFigure.svelte): his whole pose comes
	 * from the time alone (src/lib/practice/conducting.ts), with a hand that falls into each beat
	 * and rebounds, so there the dot and the even figure below aren't drawn.
	 */
	let {
		meter,
		start,
		beatMs,
		counting = false,
		bach = false
	}: { meter: ConductorMeter; start: number | null; beatMs: number; counting?: boolean; bach?: boolean } = $props();

	/**
	 * Each beat's way from its own ictus to the next one's, as SVG paths: low curves between the
	 * beats on the line, a wide arc across to the far side, and the tall stroke into 1.
	 */
	const SEGMENTS: Record<ConductorMeter, string[]> = {
		2: ['M66 98 C78 96 92 84 80 88', 'M80 88 C68 76 64 54 62 34 L66 98'],
		3: ['M56 98 C70 90 90 104 104 98', 'M104 98 C120 96 122 82 102 84', 'M102 84 C96 58 66 36 56 34 L56 98'],
		4: ['M70 98 C60 88 40 88 28 98', 'M28 98 C26 66 90 100 110 100', 'M110 100 C124 98 126 86 108 86', 'M108 86 C104 58 80 36 70 34 L70 98'],
		6: [
			'M70 98 C64 90 52 90 46 98',
			'M46 98 C40 90 32 90 28 96',
			'M28 96 C26 70 78 100 92 100',
			'M92 100 C100 92 108 92 114 98',
			'M114 98 C126 96 128 82 110 84',
			'M110 84 C104 58 80 36 70 34 L70 98'
		]
	};
	/** Where each beat lands (its segment's start), and whether its number goes above (the last beat, lifted) or below. */
	const ICTUS: Record<ConductorMeter, [number, number, 'above' | 'below'][]> = {
		2: [
			[66, 98, 'below'],
			[80, 88, 'above']
		],
		3: [
			[56, 98, 'below'],
			[104, 98, 'below'],
			[102, 84, 'above']
		],
		4: [
			[70, 98, 'below'],
			[28, 98, 'below'],
			[110, 100, 'below'],
			[108, 86, 'above']
		],
		6: [
			[70, 98, 'below'],
			[46, 98, 'below'],
			[28, 96, 'below'],
			[92, 100, 'below'],
			[114, 98, 'below'],
			[110, 84, 'above']
		]
	};

	const segments = $derived(SEGMENTS[meter]);
	const ictus = $derived(ICTUS[meter]);
	const paths: SVGPathElement[] = $state([]);
	let dot = $state<[number, number]>([70, 98]);
	let flash = $state(false);
	/** The beat under way (0 is the downbeat), lit in the figure; null at rest. */
	let current = $state<number | null>(null);

	$effect(() => {
		if (bach) return;
		const from = start;
		const beats = meter;
		if (from === null) {
			dot = [ICTUS[beats][0][0], ICTUS[beats][0][1]];
			flash = false;
			current = null;
			return;
		}
		let frame = requestAnimationFrame(function tick() {
			frame = requestAnimationFrame(tick);
			const gone = (performance.now() - from) / beatMs;
			const index = ((Math.floor(gone) % beats) + beats) % beats;
			const u = gone - Math.floor(gone);
			const path = paths[index];
			if (!path) return;
			const point = path.getPointAtLength(u * path.getTotalLength());
			dot = [point.x, point.y];
			flash = u < 0.12;
			current = index;
		});
		return () => cancelAnimationFrame(frame);
	});

	/** How quickly Bach takes up the beat from standing ready, and lets it go again. */
	const TAKE_UP_MS = 160;
	/** How far he has taken it up (0 ready, 1 beating), and the beat he was last at: both outlive a new `start`. */
	let taken = 0;
	let held = 0;
	let live = $state.raw<BachPose | null>(null);
	const pose = $derived(live ?? bachPose(meter, 0, 0, 0));

	$effect(() => {
		if (!bach) return;
		const from = start;
		const beats = meter;
		const ms = beatMs;
		// Standing ready he only breathes; whoever wants less movement gets him still.
		if (from === null && matchMedia('(prefers-reduced-motion: reduce)').matches) {
			taken = 0;
			live = bachPose(beats, 0, 0, 0);
			flash = false;
			current = null;
			return;
		}
		let last = performance.now();
		let frame = requestAnimationFrame(function tick() {
			frame = requestAnimationFrame(tick);
			const now = performance.now();
			// By the time gone, not per frame, so it looks the same at any frame rate.
			taken += ((from === null ? 0 : 1) - taken) * (1 - Math.exp(-(now - last) / TAKE_UP_MS));
			last = now;
			if (from !== null) held = (now - from) / ms;
			live = bachPose(beats, held, now / 1000, taken);
			const u = held - Math.floor(held);
			flash = from !== null && u < 0.12;
			current = from === null ? null : ((Math.floor(held) % beats) + beats) % beats;
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

{#if bach}
	<BachFigure {meter} {pose} {current} {flash} {counting} still={start === null} />
{:else}
	<svg class="conductor" viewBox="0 0 140 120" aria-hidden="true">
		{#each segments as d, i (`${meter}-${i}`)}
			<path {d} class="way" bind:this={paths[i]} />
		{/each}
		{#each ictus as [x, y, side], i (`${meter}-${i}`)}
			<circle cx={x} cy={y} r="2.5" class="ictus" />
			{#if current === i}<circle cx={x} cy={y} r="4" class="ictus now" />{/if}
			<text {x} y={side === 'above' ? y - 7 : y + 15} text-anchor="middle" class="number" class:now={current === i}>{i + 1}</text>
		{/each}
		{#if flash}<circle cx={dot[0]} cy={dot[1]} r="15" class="ring" class:counting />{/if}
		<circle cx={dot[0]} cy={dot[1]} r="7" class="dot" class:still={start === null} class:counting />
	</svg>
{/if}

<style>
	.conductor {
		display: block;
		width: 150px;
		height: auto;
		color: var(--text-muted);
	}

	.way {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.2;
		stroke-linecap: round;
		opacity: 0.45;
	}

	.ictus {
		fill: currentColor;
		opacity: 0.6;
	}

	.ictus.now {
		fill: var(--accent);
		opacity: 1;
	}

	.number {
		fill: currentColor;
		font-size: 9px;
	}

	.number.now {
		fill: var(--accent);
		font-weight: 700;
	}

	.dot {
		fill: var(--accent);
	}

	.dot.counting {
		fill: var(--text-muted);
	}

	.dot.still {
		opacity: 0.35;
	}

	.ring {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		opacity: 0.5;
	}

	.ring.counting {
		stroke: var(--text-muted);
	}
</style>

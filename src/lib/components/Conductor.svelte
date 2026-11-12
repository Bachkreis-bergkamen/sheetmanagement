<script lang="ts" module>
	/** The beat patterns there are figures for: 2/4, 3/4, 4/4 and 6/8 (six beats, in eighths). */
	export type ConductorMeter = 2 | 3 | 4 | 6;
</script>

<script lang="ts">
	/**
	 * A conductor's beat (#315), drawn as the pattern is taught: every beat lands on one plane,
	 * 1 straight down in the middle, a rebound after each, and the last beat lifts high up for the
	 * next downbeat. 2/4: 1 down, 2 a little to the right and up. 3/4: 1 down, 2 to the right,
	 * 3 inwards and up. 4/4: 1 down, 2 to the left, 3 across to the right, 4 inwards and up. 6/8
	 * (the German six): 1 down, 2 and 3 to the left, 4 across, 5 to the right, 6 inwards and up.
	 * The dot falls into each beat and slows at the top of each rebound, as a conductor's hand
	 * does, and flashes on the beat. `start` is when a bar's first beat is heard (the clock of
	 * `performance.now()`), null to rest on 1; `counting` draws it quieter, for a count-in.
	 */
	let {
		meter,
		start,
		beatMs,
		counting = false
	}: { meter: ConductorMeter; start: number | null; beatMs: number; counting?: boolean } = $props();

	/** Each beat's way from its own ictus to the next one's, as SVG paths. */
	const SEGMENTS: Record<ConductorMeter, string[]> = {
		2: ['M70 100 C74 72 102 64 98 90', 'M98 90 C94 26 70 -6 70 100'],
		3: ['M70 100 C72 76 100 64 112 92', 'M112 92 C114 74 94 58 84 68', 'M84 68 C80 12 70 -6 70 100'],
		4: ['M70 100 C67 76 44 64 30 92', 'M30 92 C34 70 98 64 112 92', 'M112 92 C114 74 96 60 86 70', 'M86 70 C82 14 70 -6 70 100'],
		6: [
			'M70 100 C66 84 56 80 50 96',
			'M50 96 C46 80 36 76 28 90',
			'M28 90 C36 68 88 70 96 96',
			'M96 96 C100 80 108 76 114 90',
			'M114 90 C116 72 96 58 84 66',
			'M84 66 C80 12 70 -6 70 100'
		]
	};
	/** Where each beat lands (its segment's start), and which side its number goes. */
	const ICTUS: Record<ConductorMeter, [number, number, number][]> = {
		2: [
			[70, 100, 1],
			[98, 90, 1]
		],
		3: [
			[70, 100, 1],
			[112, 92, 1],
			[84, 68, 1]
		],
		4: [
			[70, 100, 1],
			[30, 92, -1],
			[112, 92, 1],
			[86, 70, 1]
		],
		6: [
			[70, 100, 1],
			[50, 96, 0],
			[28, 90, -1],
			[96, 96, 0],
			[114, 90, 1],
			[84, 66, 1]
		]
	};

	const segments = $derived(SEGMENTS[meter]);
	const ictus = $derived(ICTUS[meter]);
	const paths: SVGPathElement[] = $state([]);
	let dot = $state<[number, number]>([70, 100]);
	let flash = $state(false);

	/**
	 * How far along a beat's way the hand is, `u` of the beat gone: fast out of the ictus and into
	 * the next, slowest at the top of the rebound (speed 1 + 0.8·cos 2πu).
	 */
	const along = (u: number) => u + (0.8 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);

	$effect(() => {
		const from = start;
		const beats = meter;
		if (from === null) {
			dot = [ICTUS[beats][0][0], ICTUS[beats][0][1]];
			flash = false;
			return;
		}
		let frame = requestAnimationFrame(function tick() {
			frame = requestAnimationFrame(tick);
			const gone = (performance.now() - from) / beatMs;
			const index = ((Math.floor(gone) % beats) + beats) % beats;
			const u = gone - Math.floor(gone);
			const path = paths[index];
			if (!path) return;
			const point = path.getPointAtLength(along(u) * path.getTotalLength());
			dot = [point.x, point.y];
			flash = u < 0.12;
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<svg class="conductor" viewBox="0 0 140 120" aria-hidden="true">
	{#each segments as d, i (`${meter}-${i}`)}
		<path {d} class="way" bind:this={paths[i]} />
	{/each}
	{#each ictus as [x, y, side], i (`${meter}-${i}`)}
		<circle cx={x} cy={y} r="2.5" class="ictus" />
		<text x={x + side * 9} y={side ? y + 4 : y + 14} text-anchor="middle" class="number">{i + 1}</text>
	{/each}
	{#if flash}<circle cx={dot[0]} cy={dot[1]} r="15" class="ring" class:counting />{/if}
	<circle cx={dot[0]} cy={dot[1]} r="7" class="dot" class:still={start === null} class:counting />
</svg>

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

	.number {
		fill: currentColor;
		font-size: 9px;
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

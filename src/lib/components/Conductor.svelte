<script lang="ts">
	/**
	 * A conductor's beat (#315), drawn as the pattern is taught: every beat lands on one plane,
	 * 1 straight down in the middle, then (in 4/4) 2 to the left, 3 across to the right and 4
	 * inwards, a rebound after each, and from 4 the lift high up for the next downbeat; in 3/4
	 * 1 down, 2 to the right, 3 inwards and up. The dot falls into each beat and slows at the top
	 * of each rebound, as a conductor's hand does, and flashes on the beat. `start` is when the
	 * bar's first beat is heard (the clock of `performance.now()`), null to rest.
	 */
	let { meter, start, beatMs }: { meter: 3 | 4; start: number | null; beatMs: number } = $props();

	/** Each beat's way from its own ictus to the next one's, as SVG paths. */
	const SEGMENTS: Record<3 | 4, string[]> = {
		4: ['M70 100 C67 76 44 64 30 92', 'M30 92 C34 70 98 64 112 92', 'M112 92 C114 74 96 60 86 70', 'M86 70 C82 14 70 -6 70 100'],
		3: ['M70 100 C72 76 100 64 112 92', 'M112 92 C114 74 94 58 84 68', 'M84 68 C80 12 70 -6 70 100']
	};
	/** Where each beat lands: its segment's start. */
	const ICTUS: Record<3 | 4, [number, number][]> = {
		4: [
			[70, 100],
			[30, 92],
			[112, 92],
			[86, 70]
		],
		3: [
			[70, 100],
			[112, 92],
			[84, 68]
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
		if (from === null) {
			dot = ICTUS[meter][0];
			flash = false;
			return;
		}
		let frame = requestAnimationFrame(function tick() {
			frame = requestAnimationFrame(tick);
			const beats = (performance.now() - from) / beatMs;
			const index = ((Math.floor(beats) % meter) + meter) % meter;
			const u = beats - Math.floor(beats);
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
	{#each segments as d, i (i)}
		<path {d} class="way" bind:this={paths[i]} />
	{/each}
	{#each ictus as [x, y], i (i)}
		<circle cx={x} cy={y} r="2.5" class="ictus" />
		<text x={x + (i === 1 && meter === 4 ? -9 : 9)} y={y + 4} text-anchor="middle" class="number">{i + 1}</text>
	{/each}
	{#if flash}<circle cx={dot[0]} cy={dot[1]} r="15" class="ring" />{/if}
	<circle cx={dot[0]} cy={dot[1]} r="7" class="dot" class:still={start === null} />
</svg>

<style>
	.conductor {
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

	.dot.still {
		opacity: 0.35;
	}

	.ring {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		opacity: 0.5;
	}
</style>

<script lang="ts">
	import type { Clef } from '#lib/practice/drills/theory.ts';

	/**
	 * A clef drawn in SVG strokes (no music font), for the drill staves. `top` is the y of the
	 * staff's top line, lines 10 apart; the C clef centres on its line (alto third, tenor fourth).
	 */
	let { clef, top, x = 8 }: { clef: Clef; top: number; x?: number } = $props();
	const centre = $derived(top + (clef === 'alto' ? 20 : 10));
</script>

<g class="clef">
	{#if clef === 'treble'}
		<g transform="translate({x} {top})">
			<path
				d="M15.5 33 C11 34 9 29 13 26.5 C18 24 23 28 21 34 C19 40 7 41 4 33 C1 25 9 18 15 12 C21 6 22 -4 18 -9 C15 -13 11 -6 12 0 L16 46 C17 52 11 55 8 51"
				class="pen"
			/>
			<circle cx="9.5" cy="50" r="3" />
		</g>
	{:else if clef === 'bass'}
		<g transform="translate({x} {top})">
			<circle cx="5.5" cy="10" r="3.6" />
			<path d="M3 11 C2 2 18 -1 21 9 C23 19 14 30 2 36" class="pen thick" />
			<circle cx="27" cy="5" r="2" />
			<circle cx="27" cy="15" r="2" />
		</g>
	{:else}
		<g transform="translate({x} {centre})">
			<rect x="1" y="-20" width="4.5" height="40" />
			<rect x="7.5" y="-20" width="1.6" height="40" />
			<path d="M9.5 0 C12.5 -2 13.5 -6 14.5 -11 C15.5 -17 19.5 -20 23.5 -19 C28 -18 28 -9 23 -9" class="pen" />
			<path d="M9.5 0 C12.5 2 13.5 6 14.5 11 C15.5 17 19.5 20 23.5 19 C28 18 28 9 23 9" class="pen" />
			<circle cx="23" cy="-10.5" r="2.4" />
			<circle cx="23" cy="10.5" r="2.4" />
		</g>
	{/if}
</g>

<style>
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
</style>

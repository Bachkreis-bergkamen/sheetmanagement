<script lang="ts">
	/** A sharp (alter > 0), flat (< 0) or natural (0) centred at x, y, for the drill staves. */
	let { alter, x, y }: { alter: number; x: number; y: number } = $props();
</script>

<g transform="translate({x} {y})">
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

<style>
	.thin {
		stroke: currentColor;
		stroke-width: 1.3;
	}

	.bar {
		stroke: currentColor;
		stroke-width: 2.6;
	}

	.pen {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>

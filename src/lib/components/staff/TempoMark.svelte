<script lang="ts">
	import { tempoName } from '#lib/practice/audio.ts';

	/**
	 * A tempo as printed above music: "Andante ♩ = 84", the marking from the metronome's scale
	 * (so it matches the app's metronome) and the quarter note drawn, needing no music font.
	 */
	let { bpm }: { bpm: number } = $props();
</script>

<span class="tempo">
	<strong>{tempoName(bpm)}</strong>
	<span class="mm">
		<svg viewBox="0 0 10 20" aria-hidden="true"><ellipse cx="4" cy="16" rx="3.6" ry="2.6" transform="rotate(-20 4 16)" /><line x1="7.3" x2="7.3" y1="15" y2="1" /></svg>
		<span class="visually-hidden">♩</span> = {bpm}
	</span>
</span>

<style>
	.tempo {
		display: inline-flex;
		align-items: baseline;
		gap: 0.5em;
	}

	strong {
		font-family: var(--font-display, serif);
		font-weight: 700;
	}

	.mm {
		display: inline-flex;
		align-items: baseline;
		gap: 0.15em;
		font-variant-numeric: tabular-nums;
	}

	svg {
		width: 0.6em;
		height: 1.2em;
		align-self: center;
		fill: currentColor;
		stroke: currentColor;
		stroke-width: 1.3;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>

<script lang="ts">
	import type { Glyph } from '#lib/music/instrument-glyph.ts';
	import art, { type Mark } from './instrument-art.ts';

	/** x and y place it inside another drawing (the seating plan), in that drawing's units. */
	let { glyph, size = 24, x, y }: { glyph: Glyph; size?: number; x?: number; y?: number } = $props();

	const id = $props.id();
	const drawing = $derived(art[glyph] ?? art.score);
	const transform = $derived(
		[drawing.turn && `rotate(${drawing.turn} 256 256)`, drawing.size && `translate(256 256) scale(${drawing.size}) translate(-256 -256)`]
			.filter(Boolean)
			.join(' ') || undefined
	);
</script>

{#snippet marks(list: Mark[], color: string)}
	{#each list as mark, i (i)}
		{#if typeof mark === 'string'}
			<path d={mark} fill={color} />
		{:else}
			<path d={mark.d} fill="none" stroke={color} stroke-width={mark.w} stroke-linecap="round" stroke-linejoin="round" />
		{/if}
	{/each}
{/snippet}

<svg {x} {y} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
	<g transform={transform}>
		{#if drawing.cut}
			<mask id="cut-{id}" maskUnits="userSpaceOnUse" x="-128" y="-128" width="768" height="768">
				<rect x="-128" y="-128" width="768" height="768" fill="white" />
				{@render marks(drawing.cut, 'black')}
			</mask>
		{/if}
		<g mask={drawing.cut ? `url(#cut-${id})` : undefined}>{@render marks(drawing.draw, 'currentColor')}</g>
		{#if drawing.over}{@render marks(drawing.over, 'currentColor')}{/if}
	</g>
</svg>

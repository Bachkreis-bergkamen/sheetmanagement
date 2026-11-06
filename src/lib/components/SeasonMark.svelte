<script lang="ts" module>
	import type { Season } from '#lib/seasons.ts';

	/**
	 * The season's small mark, on a 24 grid: for the footer's ornament and an empty list's
	 * shoulder. One fine line, no characters: a leaf, a snowflake, a blossom.
	 */
	const MARKS: Record<Season, string> = {
		advent: '<path d="M12 3.5l2.4 5.1 5.6.7-4.1 3.9 1 5.5L12 16l-4.9 2.7 1-5.5-4.1-3.9 5.6-.7z"/>',
		newYear: '<path d="M12 3.5c.6 4.8 3.4 7.6 8.5 8.5-5.1.9-7.9 3.7-8.5 8.5-.6-4.8-3.4-7.6-8.5-8.5 5.1-.9 7.9-3.7 8.5-8.5z"/>',
		winter: '<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.6 4.4L12 6.4l2.4-2M9.6 19.6l2.4-2 2.4 2M4.3 10.1l3 .5-1-2.9M19.7 13.9l-3-.5 1 2.9M6.3 16.3l1-2.9-3 .5M17.7 7.7l-1 2.9 3-.5"/>',
		spring: blossom(),
		summer: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
		autumn: leaf(),
		halloween: '<path d="M14.5 3.5a8.6 8.6 0 1 0 6 13.6 7.1 7.1 0 1 1-6-13.6z"/>'
	};

	/** A leaf, pointed and veined: reads as a leaf down to 16px, where a maple's lobes blur. */
	function leaf() {
		return '<path d="M12 2.8c4.8 3.8 6.2 8.4 4.4 12.2-1.2 2.4-2.8 3.4-4.4 3.4s-3.2-1-4.4-3.4C5.8 11.2 7.2 6.6 12 2.8z"/><path d="M12 21.2V6.4M12 10.6l-2.4-1.9M12 10.6l2.4-1.9M12 14.2l-3-2.1M12 14.2l3-2.1"/>';
	}

	function blossom() {
		const petal = 'M12 10.3C10.3 8.7 10.2 5.4 12 3.6c1.8 1.8 1.7 5.1 0 6.7z';
		return [0, 72, 144, 216, 288].map((turn) => `<path d="${petal}" transform="rotate(${turn} 12 12)"/>`).join('') + '<circle cx="12" cy="12" r="1.3"/>';
	}

	/** Needles along a fir twig, both sides, from (x1,y1) to (x2,y2). */
	function needles(x1: number, y1: number, x2: number, y2: number, count: number, length: number) {
		const dx = x2 - x1;
		const dy = y2 - y1;
		const norm = Math.hypot(dx, dy);
		const [ux, uy] = [dx / norm, dy / norm];
		let d = '';
		for (let i = 1; i <= count; i++) {
			const t = i / (count + 1);
			const [x, y] = [x1 + dx * t, y1 + dy * t];
			const l = length * (1 - t * 0.45);
			for (const side of [1, -1]) {
				// Swept back along the twig, like a real sprig.
				const nx = x + (ux * 0.55 - uy * side) * l;
				const ny = y + (uy * 0.55 + ux * side) * l;
				d += `M${x.toFixed(1)} ${y.toFixed(1)}L${nx.toFixed(1)} ${ny.toFixed(1)}`;
			}
		}
		return d;
	}

	/** A firework's burst: fine rays with a point at each end. */
	function burst(cx: number, cy: number, inner: number, outer: number, rays = 12) {
		let lines = '';
		let points = '';
		for (let i = 0; i < rays; i++) {
			const a = (i / rays) * Math.PI * 2;
			const [c, s] = [Math.cos(a), Math.sin(a)];
			lines += `M${(cx + c * inner).toFixed(1)} ${(cy + s * inner).toFixed(1)}L${(cx + c * outer).toFixed(1)} ${(cy + s * outer).toFixed(1)}`;
			points += `<circle cx="${(cx + c * (outer + 2.4)).toFixed(1)}" cy="${(cy + s * (outer + 2.4)).toFixed(1)}" r=".7" class="dot"/>`;
		}
		return `<path d="${lines}"/>${points}`;
	}

	export const SPRIG = needles(162, 6, 92, 16, 11, 9);
	export const BURSTS = [burst(118, 42, 8, 30, 14), burst(72, 66, 5, 16)];
	/** Snow, spread once; drawn twice, one above the other, so its fall loops without a seam. */
	export const FLAKES = Array.from({ length: 22 }, (_, i) => ({
		x: 40 + ((i * 53) % 122),
		y: (i * 37) % 100,
		r: i % 3 === 0 ? 1.1 : 0.7
	}));
</script>

<script lang="ts">
	import { page } from '$app/state';

	/**
	 * The season's drawings (#202). "scene": a composed line drawing behind the story card's
	 * greeting, one thing in it moving slowly (a leaf falling, snow, a boat rocking). "pair": the
	 * season's mark between two fading rules, an ornament at the foot of the page. "companion":
	 * the mark alone, small. Nothing at all while the feature is off (page.data.season is null).
	 */
	let {
		variant = 'pair',
		size = 20,
		season = page.data.season as Season | null | undefined
	}: { variant?: 'scene' | 'pair' | 'companion'; size?: number; season?: Season | null } = $props();

	const uid = $props.id();
	const ref = (name: string) => `#${uid}-${name}`;
</script>

{#snippet mark(px: number)}
	<svg class="mark" width={px} height={px} viewBox="0 0 24 24" aria-hidden="true">
		<!-- The drawings above, never anything typed in. -->
		{@html MARKS[season!]}
	</svg>
{/snippet}

<!-- A drawn thing from the defs, its anchor (the leaf's stalk, the flake's centre) at x, y. -->
{#snippet put(name: string, x: number, y: number, px: number, turn = 0, className = '')}
	<g class={className} transform="translate({x} {y}) rotate({turn})">
		<use href={ref(name)} x={-px / 2} y={name === 'leaf' ? -px * 0.875 : -px / 2} width={px} height={px} />
	</g>
{/snippet}

{#if season}
	{#if variant === 'scene'}
		<svg class="scene" data-season={season} viewBox="0 0 160 100" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
			<defs>
				<symbol id="{uid}-leaf" viewBox="0 0 24 24">{@html leaf()}</symbol>
				<symbol id="{uid}-blossom" viewBox="0 0 24 24">{@html blossom()}</symbol>
				<symbol id="{uid}-flake" viewBox="0 0 24 24">{@html MARKS.winter}</symbol>
				<symbol id="{uid}-star" viewBox="0 0 24 24">{@html MARKS.advent}</symbol>
				<symbol id="{uid}-glint" viewBox="0 0 24 24">{@html MARKS.newYear}</symbol>
			</defs>

			{#if season === 'autumn'}
				<!-- A twig reaching in, two leaves on it, one on its way down. -->
				<path d="M166 10C146 12 128 20 112 32M134 18c3.4 7 3 13-1 19" />
				{@render put('leaf', 133, 37, 34, 172)}
				{@render put('leaf', 112, 32, 26, 214, 'soft')}
				<g class="fall">{@render put('leaf', 70, 6, 22, 30)}</g>
				<g class="fall late">{@render put('leaf', 150, 34, 15, -20, 'faint')}</g>
			{:else if season === 'winter'}
				<!-- One large flake turning slowly, a smaller one, fine snow falling past. -->
				<g class="snow">
					{#each [0, -100] as shift (shift)}
						{#each FLAKES as flake, i (i)}<circle class="dot faint" cx={flake.x} cy={flake.y + shift} r={flake.r} />{/each}
					{/each}
				</g>
				<g class="turn" style:transform-origin="122px 46px">{@render put('flake', 122, 46, 56)}</g>
				{@render put('flake', 78, 30, 24, 15, 'soft')}
			{:else if season === 'spring'}
				<!-- A cherry twig in flower; a petal let go. -->
				<path d="M166 96C148 84 134 70 124 54 118 44 110 36 98 30M140 76c7-5 14-7 22-7" />
				{@render put('blossom', 124, 52, 36)}
				{@render put('blossom', 98, 30, 24, 30, 'soft')}
				<ellipse class="soft" cx="158" cy="68" rx="3" ry="4.6" transform="rotate(-60 158 68)" />
				<g class="fall"><path d="M70 14c-2.6-2.4-2.8-7.4 0-10.2 2.8 2.8 2.6 7.8 0 10.2z" /></g>
				<g class="fall late"><path class="faint" d="M146 30c-2-1.9-2.1-5.6 0-7.7 2.1 2.1 2 5.8 0 7.7z" /></g>
			{:else if season === 'summer'}
				<!-- Sun over the water, a sail on the horizon. -->
				<circle cx="130" cy="34" r="15" />
				<g class="turn slow" style:transform-origin="130px 34px">
					{#each Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6) as a (a)}
						<path class="soft" d="M{130 + Math.cos(a) * 21} {34 + Math.sin(a) * 21}L{130 + Math.cos(a) * 27} {34 + Math.sin(a) * 27}" />
					{/each}
				</g>
				<path class="faint" d="M44 80H164M62 89c6-2.8 12-2.8 18 0s12 2.8 18 0 12-2.8 18 0 12 2.8 18 0" />
				<g class="rock" style:transform-origin="82px 80px">
					<path d="M64 75h36l-5.6 5.6H69.6zM82 75V42M83.6 45l14 27H83.6zM80.4 50.6l-11.2 21.4h11.2z" />
				</g>
			{:else if season === 'advent'}
				<!-- A fir sprig, a star and a bauble hanging from it, a glint or two. -->
				<path d="M164 6C140 11 118 14 90 16" />
				<path class="soft" d={SPRIG} />
				<g class="hang" style:transform-origin="128px 11px">
					<path class="soft" d="M128 11v32" />
					{@render put('star', 128, 56, 30)}
				</g>
				<g class="hang late" style:transform-origin="104px 14px">
					<path class="faint" d="M104 14v18" />
					<circle class="soft" cx="104" cy="40" r="7" />
					<path class="soft" d="M101.6 32.6h4.8" />
				</g>
				{@render put('glint', 74, 44, 13, 0, 'glint')}
				{@render put('glint', 154, 78, 10, 0, 'glint late')}
			{:else if season === 'newYear'}
				<!-- Fireworks opening one after the other. -->
				<g class="bloom" style:transform-origin="118px 42px">{@html BURSTS[0]}</g>
				<g class="bloom late soft" style:transform-origin="72px 66px">{@html BURSTS[1]}</g>
				{@render put('glint', 154, 16, 12, 0, 'glint')}
				{@render put('glint', 60, 24, 9, 0, 'glint late')}
			{:else}
				<!-- A crescent moon behind a bare twig; a bat crossing now and then. -->
				<path d="M136 8a30 30 0 1 0 26 48 24 24 0 1 1-26-48z" />
				<path class="soft" d="M168 96c-20-8-34-20-44-38M146 80c-7-2-11.4-6.4-13.4-13M134 66c5-6.4 11-9 18-9" />
				{@render put('glint', 98, 24, 10, 0, 'glint')}
				<g class="fly"><g transform="translate(150 40) scale(1.7) translate(-150 -40)">
					<path d="M150 40c-1.6-2.2-4.8-3.2-8.6-2.4 1.4.8 1.8 1.8 1.7 3.2-1.3-.7-2.9-.6-4 .4 3.2.1 6 1.2 8 2.8M150 40c1.6-2.2 4.8-3.2 8.6-2.4-1.4.8-1.8 1.8-1.7 3.2 1.3-.7 2.9-.6 4 .4-3.2.1-6 1.2-8 2.8M148.4 42c0 1.4.7 2.6 1.6 2.6s1.6-1.2 1.6-2.6-.7-2.2-1.6-2.2-1.6.8-1.6 2.2z" />
				</g></g>
			{/if}
		</svg>
	{:else if variant === 'pair'}
		<!-- An ornament between two rules, like the end of a chapter. -->
		<span class="ornament" data-season={season} aria-hidden="true">
			<span class="rule"></span>{@render mark(Math.round(size * 0.9))}<span class="rule end"></span>
		</span>
	{:else}
		<span class="alone" data-season={season} aria-hidden="true">{@render mark(size)}</span>
	{/if}
{/if}

<style>
	/* ---------- Fine lines, one weight at every size ---------- */

	.scene,
	.mark {
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.scene :global(*),
	.mark :global(*) {
		vector-effect: non-scaling-stroke;
	}

	.mark {
		display: block;
		stroke-width: 1.5;
	}

	/* ---------- The scene, behind the story card's greeting ---------- */

	.scene {
		position: absolute;
		top: 0;
		right: 2%;
		width: 60%;
		height: 100%;
		color: var(--accent-dark, var(--brand));
		stroke-width: 1.5;
		opacity: 0.85;
		pointer-events: none;
	}

	/* On a wide card, between the greeting and the logo rather than on top of the logo. */
	@media (min-width: 721px) {
		.scene {
			top: 6%;
			right: 24%;
			width: 46%;
			height: 88%;
		}
	}

	/* Three depths: what's near is clear, what's behind it lighter. */
	.scene :global(.soft) {
		opacity: 0.62;
	}

	.scene :global(.faint) {
		opacity: 0.36;
	}

	.scene :global(.dot) {
		fill: currentColor;
		stroke: none;
	}

	/* One slow thing moving per season; every loop long and even, nothing that bounces. */
	.scene :global(.fall) {
		transform-box: fill-box;
		transform-origin: center;
		animation: fall 16s linear infinite;
	}

	.scene :global(.fall.late) {
		animation-duration: 21s;
		animation-delay: -9s;
	}

	@keyframes fall {
		0% {
			translate: 0 -12px;
			rotate: 0deg;
			opacity: 0;
		}
		12%,
		78% {
			opacity: 1;
		}
		50% {
			translate: -14px 46px;
			rotate: 140deg;
		}
		100% {
			translate: -30px 104px;
			rotate: 280deg;
			opacity: 0;
		}
	}

	.scene :global(.snow) {
		animation: snow 26s linear infinite;
	}

	@keyframes snow {
		to {
			translate: 0 100px;
		}
	}

	.scene :global(.turn) {
		animation: turn 90s linear infinite;
	}

	.scene :global(.turn.slow) {
		animation-duration: 160s;
	}

	@keyframes turn {
		to {
			rotate: 360deg;
		}
	}

	.scene :global(.rock) {
		animation: rock 7s ease-in-out infinite alternate;
	}

	@keyframes rock {
		from {
			rotate: -2.5deg;
		}
		to {
			rotate: 2.5deg;
			translate: 0 0.6px;
		}
	}

	.scene :global(.hang) {
		animation: hang 6s ease-in-out infinite alternate;
	}

	.scene :global(.hang.late) {
		animation-duration: 7.5s;
		animation-delay: -3s;
	}

	@keyframes hang {
		from {
			rotate: -3deg;
		}
		to {
			rotate: 3deg;
		}
	}

	.scene :global(.glint) {
		animation: glint 5s ease-in-out infinite;
	}

	.scene :global(.glint.late) {
		animation-delay: -1.7s;
	}

	.scene :global(.glint.later) {
		animation-delay: -3.3s;
	}

	@keyframes glint {
		0%,
		100% {
			opacity: 0.2;
		}
		50% {
			opacity: 0.9;
		}
	}

	.scene :global(.bloom) {
		animation: bloom 7s cubic-bezier(0.2, 0.8, 0.2, 1) -1.5s infinite;
	}

	.scene :global(.bloom.late) {
		animation-delay: -5s;
	}

	.scene :global(.bloom.later) {
		animation-delay: -4s;
	}

	@keyframes bloom {
		0% {
			scale: 0.6;
			opacity: 0;
		}
		14% {
			opacity: 1;
		}
		60% {
			scale: 1;
			opacity: 0.9;
		}
		88%,
		100% {
			scale: 1.08;
			opacity: 0;
		}
	}

	.scene :global(.fly) {
		animation: fly 24s linear infinite;
	}

	@keyframes fly {
		0% {
			translate: 24px 4px;
			opacity: 0;
		}
		6% {
			opacity: 1;
		}
		25% {
			translate: -14px -6px;
		}
		50% {
			translate: -54px 6px;
			opacity: 1;
		}
		58%,
		100% {
			translate: -74px -2px;
			opacity: 0;
		}
	}

	/* ---------- The ornament at the foot of the page ---------- */

	.ornament {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.rule {
		width: 36px;
		height: 1px;
		background: linear-gradient(to right, transparent, currentColor);
	}

	.rule.end {
		background: linear-gradient(to left, transparent, currentColor);
	}

	.alone {
		display: grid;
	}

	/* Standing still for those who asked for less motion. */
	@media (prefers-reduced-motion: reduce) {
		.scene :global(*) {
			animation: none !important;
		}
	}
</style>

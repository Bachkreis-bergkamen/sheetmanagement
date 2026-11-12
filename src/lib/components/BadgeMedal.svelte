<script lang="ts">
	import type { Badge } from '#lib/practice/drills/badges.ts';
	import StaffClef from './staff/StaffClef.svelte';

	/**
	 * A badge drawn as a small medal (#300): a rosette in its group's colour on two ribbon tails,
	 * with a picture of what it stands for. The hardest badges get a gold rim. Not yet earned, it
	 * is grey, with a ring round it showing how far along it is. `fresh` plays a short shine.
	 */
	let { badge, earned, progress = 0, fresh = false, size = 56 }: { badge: Badge; earned: boolean; progress?: number; fresh?: boolean; size?: number } = $props();

	const uid = $props.id();
	const kind = $derived(badge.kind);

	/** The group's colours: rim, face, face highlight, ribbon. Fixed, as a medal looks the same in either theme. */
	const PALETTES = {
		read: { rim: '#1d3d6b', face: '#2f62a8', light: '#6f9ee0', ribbon: '#244b82' },
		hear: { rim: '#3f2a6b', face: '#6a48ac', light: '#a688e0', ribbon: '#523889' },
		play: { rim: '#174f3b', face: '#26805e', light: '#5fc196', ribbon: '#1e6249' },
		steady: { rim: '#7a3e0f', face: '#c06a1f', light: '#f0a85c', ribbon: '#9a5216' }
	} as const;
	const palette = $derived(PALETTES[badge.group]);

	/** The hard ones, each the top of its line. */
	const gold = $derived(
		kind.type === 'ledger' ||
			(kind.type === 'keys' && kind.set === 'minor') ||
			(kind.type === 'ear' && kind.harmonic) ||
			(kind.type === 'trans' && kind.parts) ||
			(kind.type === 'sight' && kind.level >= 8) ||
			kind.type === 'entry' ||
			(kind.type === 'streak' && kind.days >= 30)
	);

	/** A rosette's scalloped edge round (32, 28). */
	const rosette = (() => {
		const points: string[] = [];
		const count = 16;
		for (let i = 0; i < count * 2; i++) {
			const angle = (Math.PI * i) / count - Math.PI / 2;
			const radius = i % 2 ? 23.2 : 25.6;
			points.push(`${(32 + radius * Math.cos(angle)).toFixed(2)},${(28 + radius * Math.sin(angle)).toFixed(2)}`);
		}
		return points.join(' ');
	})();

	/** The progress ring: from the top, clockwise. */
	const RING = 28.5;
	const circumference = 2 * Math.PI * RING;
	const share = $derived(Math.max(0, Math.min(1, progress / badge.need)));
</script>

<svg class="medal" class:earned class:fresh viewBox="0 0 64 66" width={size} height={size * (66 / 64)} aria-hidden="true">
	<defs>
		<radialGradient id="{uid}-face" cx="38%" cy="30%" r="75%">
			<stop offset="0%" stop-color={palette.light} />
			<stop offset="100%" stop-color={palette.face} />
		</radialGradient>
		<linearGradient id="{uid}-gold" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="#f7dc8b" />
			<stop offset="50%" stop-color="#c9952c" />
			<stop offset="100%" stop-color="#f1cf73" />
		</linearGradient>
		<clipPath id="{uid}-clip"><circle cx="32" cy="28" r="18.5" /></clipPath>
	</defs>

	{#if earned}
		<!-- Ribbon tails, behind. -->
		<path d="M21 40 L15 63 L21.5 59 L26 64 L30.5 45 Z" fill={palette.ribbon} />
		<path d="M43 40 L49 63 L42.5 59 L38 64 L33.5 45 Z" fill={palette.ribbon} />
		<path d="M21 40 L15 63 L18 61.2 L25 42.6 Z" fill="#000" opacity="0.18" />
		<polygon points={rosette} fill={gold ? `url(#${uid}-gold)` : palette.rim} />
		<circle cx="32" cy="28" r="20.5" fill={gold ? '#8a6418' : palette.rim} opacity="0.55" />
		<circle cx="32" cy="28" r="19.5" fill="url(#{uid}-face)" />
		<circle cx="32" cy="28" r="17" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="0.8" stroke-dasharray="1.2 1.6" />
		<!-- A soft gleam, and the sweep when it's new. -->
		<g clip-path="url(#{uid}-clip)">
			<ellipse cx="25" cy="17" rx="13" ry="7" fill="#fff" opacity="0.16" transform="rotate(-30 25 17)" />
			<rect class="sweep" x="-20" y="0" width="10" height="64" fill="#fff" opacity="0.45" transform="skewX(-20)" />
		</g>
	{:else}
		<circle cx="32" cy="28" r={RING} fill="none" class="track" stroke-width="2.4" />
		{#if share > 0}
			<circle
				cx="32"
				cy="28"
				r={RING}
				fill="none"
				class="arc"
				stroke-width="2.4"
				stroke-linecap="round"
				stroke-dasharray="{circumference * share} {circumference}"
				transform="rotate(-90 32 28)"
			/>
		{/if}
		<polygon points={rosette} class="locked-rim" />
		<circle cx="32" cy="28" r="19.5" class="locked-face" />
	{/if}

	<!-- What it stands for, drawn round (0, 0) within about 13 units. -->
	<g class="motif" transform="translate(32 28) scale(1.12)" color={earned ? '#fffaf0' : undefined}>
		{#if kind.type === 'staff' || kind.type === 'ledger'}
			{@const top = kind.type === 'ledger' ? -11 : -8}
			{#each [0, 4, 8, 12, 16] as line (line)}
				<line x1="-13" x2="13" y1={top + line} y2={top + line} stroke="currentColor" stroke-width="0.7" opacity="0.7" />
			{/each}
			<g transform="translate(-12.5 {top}) scale(0.4)" class="clef"><StaffClef clef={kind.clef} top={0} x={0} /></g>
			{#if kind.type === 'ledger'}
				<line x1="3" x2="13" y1={top + 20} y2={top + 20} stroke="currentColor" stroke-width="1" />
				<line x1="3" x2="13" y1={top + 24} y2={top + 24} stroke="currentColor" stroke-width="1" />
				<ellipse cx="8" cy={top + 24} rx="3.1" ry="2.2" fill="none" stroke="currentColor" stroke-width="1.3" transform="rotate(-20 8 {top + 24})" />
			{:else}
				<ellipse cx="7" cy={top + 6} rx="3.1" ry="2.2" fill="none" stroke="currentColor" stroke-width="1.3" transform="rotate(-20 7 {top + 6})" />
			{/if}
		{:else if kind.type === 'keys' && kind.set === 'sharps'}
			<g stroke="currentColor" stroke-linecap="round">
				<line x1="-3.5" y1="-10" x2="-3.5" y2="12" stroke-width="1.8" />
				<line x1="3.5" y1="-12" x2="3.5" y2="10" stroke-width="1.8" />
				<line x1="-8" y1="-1" x2="8" y2="-5" stroke-width="3.6" />
				<line x1="-8" y1="7" x2="8" y2="3" stroke-width="3.6" />
			</g>
		{:else if kind.type === 'keys' && kind.set === 'flats'}
			<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none">
				<line x1="-4" y1="-13" x2="-4" y2="10" stroke-width="2" />
				<path d="M-4 10 C6 4 9 -3 3 -3 C0 -3 -2 -1 -4 1" stroke-width="2.6" />
			</g>
		{:else if kind.type === 'keys'}
			<!-- Minor: the darker side of the moon. -->
			<path d="M3 -12 A12 12 0 1 0 3 12 A15 15 0 0 1 3 -12 Z" fill="currentColor" />
			<circle cx="6" cy="-4" r="1.2" fill="currentColor" />
			<circle cx="9" cy="3" r="0.9" fill="currentColor" />
		{:else if kind.type === 'ear'}
			<g fill="currentColor">
				{#if kind.harmonic}
					<ellipse cx="2" cy="6" rx="3.8" ry="2.7" transform="rotate(-20 2 6)" />
					<ellipse cx="2" cy="-1" rx="3.8" ry="2.7" transform="rotate(-20 2 -1)" />
					<rect x="5.2" y="-13" width="1.3" height="18.5" />
				{:else}
					<ellipse cx="-3" cy="7" rx="3.6" ry="2.6" transform="rotate(-20 -3 7)" />
					<rect x="0" y="-6" width="1.2" height="12.5" />
					<ellipse cx="7" cy="-1" rx="3.6" ry="2.6" transform="rotate(-20 7 -1)" />
					<rect x="10" y="-13" width="1.2" height="12" />
				{/if}
			</g>
			<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4">
				<path d="M-9 -6 A8 8 0 0 0 -9 6" opacity="0.9" />
				<path d="M-13 -9 A12 12 0 0 0 -13 9" opacity="0.55" />
			</g>
		{:else if kind.type === 'rhythm'}
			<g fill="currentColor">
				<ellipse cx="-9" cy="8" rx="3.3" ry="2.4" transform="rotate(-20 -9 8)" />
				<ellipse cx="-1" cy="8" rx="3.3" ry="2.4" transform="rotate(-20 -1 8)" />
				<rect x="-6.6" y="-9" width="1.2" height="17" />
				<rect x="1.4" y="-9" width="1.2" height="17" />
				<path d="M-6.6 -9.5 L2.6 -9.5 L2.6 -6.5 L-6.6 -6.5 Z" />
				<ellipse cx="9" cy="8" rx="3.3" ry="2.4" transform="rotate(-20 9 8)" />
				<rect x="11.4" y="-9" width="1.2" height="17" />
			</g>
		{:else if kind.type === 'pulse'}
			<g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round">
				<path d="M-9 12 L9 12 L4.5 -12 L-4.5 -12 Z" stroke-width="1.8" />
				<line x1="0" y1="8" x2="7" y2="-9" stroke-width="1.6" />
				<line x1="-6" y1="6" x2="6" y2="6" stroke-width="1" opacity="0.6" />
			</g>
			<rect x="2.2" y="-3.2" width="4.4" height="3" rx="0.8" fill="currentColor" transform="rotate(22 4.4 -1.7)" />
		{:else if kind.type === 'play'}
			<g fill="currentColor">
				<ellipse cx="-4" cy="7" rx="4" ry="2.9" transform="rotate(-20 -4 7)" />
				<rect x="-0.6" y="-12" width="1.3" height="18.5" />
				<path d="M0.7 -12 C3 -8 7 -7 5.5 -1.5 C6.5 -6 3 -7.5 0.7 -8.5 Z" />
			</g>
			<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4">
				<path d="M7 1 A6 6 0 0 1 7 11" opacity="0.9" />
				<path d="M10.5 -2 A10 10 0 0 1 10.5 14" opacity="0.55" />
			</g>
		{:else if kind.type === 'scales'}
			<g fill="currentColor">
				{#each [0, 1, 2, 3, 4] as step (step)}
					<ellipse cx={-11 + step * 5.5} cy={9 - step * 4.5} rx="2.7" ry="2" transform="rotate(-20 {-11 + step * 5.5} {9 - step * 4.5})" />
				{/each}
			</g>
			<line x1="-13" x2="13" y1="11.5" y2="11.5" stroke="currentColor" stroke-width="0.8" opacity="0.5" />
		{:else if kind.type === 'trans'}
			<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2">
				<path d="M-10 2 A10 10 0 0 1 7 -7" />
				<path d="M10 -2 A10 10 0 0 1 -7 7" />
			</g>
			<g fill="currentColor">
				<path d="M4 -11 L10.5 -6.5 L3.5 -3.5 Z" />
				<path d="M-4 11 L-10.5 6.5 L-3.5 3.5 Z" />
			</g>
			{#if kind.parts}<text x="0" y="3.6" class="label" fill="currentColor">in</text>{/if}
		{:else if kind.type === 'tune'}
			<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2">
				<path d="M-4 -12 L-4 0 Q-4 5 0 5 Q4 5 4 0 L4 -12" />
				<line x1="0" y1="5" x2="0" y2="13" stroke-width="2.4" />
			</g>
			<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2">
				<path d="M-8 -9 A6 6 0 0 0 -8 -1" opacity="0.8" />
				<path d="M8 -9 A6 6 0 0 1 8 -1" opacity="0.8" />
			</g>
		{:else if kind.type === 'sight'}
			<path d="M-13 -2 Q0 -13 13 -2 Q0 9 -13 -2 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
			<circle cx="0" cy="-2" r="4.2" fill="currentColor" />
			<circle cx="1.4" cy="-3.4" r="1.2" class="pupil-glint" />
			<text x="0" y="12.5" class="label" fill="currentColor">{kind.level}</text>
		{:else if kind.type === 'entry'}
			<!-- A conductor's baton and the stroke of the downbeat. -->
			<line x1="-10" y1="11" x2="8" y2="-9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
			<circle cx="-10" cy="11" r="2.6" fill="currentColor" />
			<path d="M4 -12 Q12 -6 9 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="2 2" opacity="0.8" />
		{:else if kind.type === 'streak'}
			<path
				d="M0 -14 C5 -7 11 -3 9 5 C8 10 4 13 0 13 C-4 13 -9 10 -9 4 C-9 -1 -5 -3 -4 -8 C-2 -4 0 -3 1 -1 C1.5 -5 1 -10 0 -14 Z"
				fill="currentColor"
			/>
			<text x="0" y="9.5" class="label days" fill={earned ? palette.face : 'var(--surface)'}>{kind.days}</text>
		{/if}
	</g>
</svg>

<style>
	.medal {
		display: block;
		flex: none;
		overflow: visible;
	}

	.medal:not(.earned) .motif {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.track {
		stroke: var(--hairline);
	}

	.arc {
		stroke: var(--ok);
	}

	.locked-rim {
		fill: var(--surface-2);
		stroke: var(--hairline);
		stroke-width: 0.8;
	}

	.locked-face {
		fill: var(--surface);
		stroke: var(--hairline);
		stroke-width: 0.8;
	}

	.clef :global(.pen) {
		stroke-width: 3;
	}

	.clef {
		fill: currentColor;
	}

	.label {
		font: 700 8px/1 var(--font-display, system-ui), system-ui, sans-serif;
		text-anchor: middle;
	}

	.label.days {
		font-size: 7.5px;
	}

	.pupil-glint {
		fill: #fff;
		opacity: 0.6;
	}

	.medal:not(.earned) .pupil-glint {
		fill: var(--surface);
	}

	.sweep {
		opacity: 0;
	}

	.fresh {
		animation: pop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}

	.fresh .sweep {
		animation: sweep 1.4s 0.35s ease-out both;
	}

	@keyframes pop {
		from {
			transform: scale(0.6) rotate(-12deg);
			opacity: 0;
		}
	}

	@keyframes sweep {
		0% {
			transform: skewX(-20deg) translateX(0);
			opacity: 0.55;
		}
		100% {
			transform: skewX(-20deg) translateX(110px);
			opacity: 0.55;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fresh,
		.fresh .sweep {
			animation: none;
		}
	}
</style>

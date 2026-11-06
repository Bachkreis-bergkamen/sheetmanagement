<script lang="ts" module>
	/** One picture per step of the install guide (#279), plus the home screen it ends on. */
	export type InstallSceneName =
		| 'ios-share'
		| 'ios-dots'
		| 'ios-menu-share'
		| 'ios-sheet'
		| 'ios-add'
		| 'android-menu'
		| 'android-install'
		| 'android-confirm'
		| 'desktop-bar'
		| 'desktop-confirm'
		| 'mac-file'
		| 'mac-dock'
		| 'home';
</script>

<script lang="ts">
	/**
	 * A drawing of the phone's or browser's screen at one step of the guide, plain shapes in the
	 * app's own colours, the control to tap ringed in the accent and breathing a few times. No words in
	 * it: the step's text names the control, the drawing shows where it is. Decoration for screen
	 * readers, who get the text.
	 */
	let { scene, logo }: { scene: InstallSceneName; logo: string } = $props();
	const uid = $props.id();
	const phone = $derived(!scene.startsWith('desktop') && !scene.startsWith('mac'));
</script>

{#snippet spot(x: number, y: number, r = 9)}
	<circle class="halo" cx={x} cy={y} r={r + 5} />
	<circle class="pulse" cx={x} cy={y} r={r} />
	<circle class="spot" cx={x} cy={y} r={r} />
{/snippet}

{#snippet icon(x: number, y: number, size: number)}
	<rect class="icon-bg" x={x} y={y} width={size} height={size} rx={size * 0.24} />
	<image href={logo} x={x + size * 0.12} y={y + size * 0.12} width={size * 0.76} height={size * 0.76} />
{/snippet}

{#snippet page(top: number)}
	<rect class="line strong" x="62" y={top} width="46" height="6" rx="3" />
	<rect class="line" x="62" y={top + 12} width="76" height="4" rx="2" />
	<rect class="line" x="62" y={top + 20} width="60" height="4" rx="2" />
	<rect class="block" x="62" y={top + 32} width="76" height="30" rx="6" />
	<rect class="line" x="62" y={top + 70} width="70" height="4" rx="2" />
	<rect class="line" x="62" y={top + 78} width="52" height="4" rx="2" />
{/snippet}

<svg class="scene" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
	<defs>
		<clipPath id="{uid}-screen">
			{#if phone}<rect x="55" y="13" width="90" height="174" rx="12" />{:else}<rect x="10" y="30" width="180" height="134" rx="10" />{/if}
		</clipPath>
	</defs>

	{#if phone}
		<rect class="frame" x="50" y="8" width="100" height="184" rx="17" />
		<g clip-path="url(#{uid}-screen)">
			<rect class="screen" x="55" y="13" width="90" height="174" />

			{#if scene === 'ios-share'}
				{@render page(30)}
				<rect class="bar" x="55" y="160" width="90" height="27" />
				<path class="glyph" d="M68 168l-4 4 4 4M80 168l4 4-4 4M114 167v10h8v-10zM130 168h8v8h-8z" />
				<path class="glyph accent" d="M96 171v6h8v-6M100 175v-10M97 168l3-3 3 3" />
				{@render spot(100, 171)}
			{:else if scene === 'ios-dots'}
				{@render page(30)}
				<rect class="bar" x="55" y="160" width="90" height="27" />
				<path class="glyph" d="M66 169l-4 4 4 4" />
				<rect class="pill" x="72" y="166" width="50" height="14" rx="7" />
				<g class="dots accent">
					<circle cx="130" cy="173" r="1.6" /><circle cx="135" cy="173" r="1.6" /><circle cx="140" cy="173" r="1.6" />
				</g>
				{@render spot(135, 173)}
			{:else if scene === 'ios-menu-share'}
				{@render page(30)}
				<rect class="dim" x="55" y="13" width="90" height="174" />
				<rect class="sheet" x="74" y="92" width="66" height="64" rx="9" />
				<rect class="row on" x="78" y="96" width="58" height="14" rx="5" />
				<path class="glyph accent" d="M83 103v4h6v-4M86 106v-7M84 101l2-2 2 2" />
				<rect class="line accent-fill" x="94" y="101" width="26" height="4" rx="2" />
				{#each [114, 128, 142] as y (y)}
					<rect class="line" x="83" y={y + 5} width="6" height="4" rx="1" />
					<rect class="line" x="94" y={y + 5} width="32" height="4" rx="2" />
				{/each}
				<rect class="bar" x="55" y="160" width="90" height="27" />
				{@render spot(86, 103, 8)}
			{:else if scene === 'ios-sheet'}
				<rect class="dim" x="55" y="13" width="90" height="174" />
				<rect class="sheet" x="55" y="82" width="90" height="110" rx="12" />
				{#each [70, 88, 106, 124] as x (x)}<circle class="app" cx={x} cy="100" r="6" />{/each}
				{#each [116, 152, 168] as y (y)}
					<rect class="row" x="60" y={y} width="80" height="12" rx="4" />
					<rect class="line" x="65" y={y + 4} width="34" height="4" rx="2" />
				{/each}
				<rect class="row on" x="60" y="134" width="80" height="13" rx="4" />
				<rect class="line accent-fill" x="65" y="138.5" width="44" height="4" rx="2" />
				<path class="glyph accent" d="M126 136.5h8v8h-8zM130 138.5v4M128 140.5h4" />
				{@render spot(130, 140.5, 8)}
			{:else if scene === 'ios-add'}
				<rect class="bar" x="55" y="13" width="90" height="24" />
				<rect class="line" x="61" y="23" width="18" height="4" rx="2" />
				<rect class="line strong" x="88" y="23" width="24" height="4" rx="2" />
				<rect class="line accent-fill" x="120" y="22" width="20" height="5" rx="2.5" />
				<rect class="block" x="61" y="48" width="78" height="40" rx="8" />
				{@render icon(67, 54, 28)}
				<rect class="line strong" x="101" y="62" width="32" height="5" rx="2.5" />
				<rect class="line" x="101" y="72" width="24" height="4" rx="2" />
				<rect class="line" x="61" y="98" width="70" height="4" rx="2" />
				<rect class="line" x="61" y="106" width="56" height="4" rx="2" />
				{@render spot(130, 24.5)}
			{:else if scene === 'android-menu'}
				<rect class="bar" x="55" y="13" width="90" height="24" />
				<rect class="pill" x="60" y="18" width="64" height="14" rx="7" />
				<g class="dots accent">
					<circle cx="135" cy="20" r="1.6" /><circle cx="135" cy="25" r="1.6" /><circle cx="135" cy="30" r="1.6" />
				</g>
				{@render page(48)}
				{@render spot(135, 25)}
			{:else if scene === 'android-install'}
				<rect class="bar" x="55" y="13" width="90" height="24" />
				<rect class="pill" x="60" y="18" width="64" height="14" rx="7" />
				{@render page(48)}
				<rect class="sheet" x="84" y="20" width="58" height="84" rx="6" />
				{#each [26, 40, 70, 84] as y (y)}
					<rect class="line" x="90" y={y + 4} width="6" height="5" rx="1" />
					<rect class="line" x="100" y={y + 5} width="34" height="4" rx="2" />
				{/each}
				<rect class="row on" x="87" y="54" width="52" height="13" rx="4" />
				<path class="glyph accent" d="M91 56.5h6v9h-6zM94 58.5v4M92.5 61l1.5 1.5 1.5-1.5" />
				<rect class="line accent-fill" x="100" y="58.5" width="32" height="4" rx="2" />
				{@render spot(94, 60.5, 8)}
			{:else if scene === 'android-confirm'}
				<rect class="bar" x="55" y="13" width="90" height="24" />
				{@render page(48)}
				<rect class="dim" x="55" y="13" width="90" height="174" />
				<rect class="sheet" x="60" y="66" width="80" height="68" rx="10" />
				{@render icon(66, 74, 22)}
				<rect class="line strong" x="93" y="79" width="38" height="5" rx="2.5" />
				<rect class="line" x="93" y="89" width="26" height="4" rx="2" />
				<rect class="line" x="88" y="118" width="18" height="4" rx="2" />
				<rect class="button" x="110" y="113" width="25" height="14" rx="7" />
				{@render spot(122.5, 120, 10)}
			{:else}
				<!-- The home screen: the orchestra's icon among the others. -->
				<rect class="wallpaper" x="55" y="13" width="90" height="174" />
				{#each [0, 1, 2, 3] as row (row)}
					{#each [0, 1, 2, 3] as col (col)}
						{#if !(row === 1 && col === 1)}<rect class="app-tile" x={63 + col * 20} y={34 + row * 24} width="14" height="14" rx="4" />{/if}
					{/each}
				{/each}
				{@render icon(81, 56, 18)}
				<rect class="dock" x="60" y="160" width="80" height="20" rx="9" />
				{@render spot(90, 65, 14)}
			{/if}
		</g>
	{:else}
		<rect class="frame" x="10" y="30" width="180" height="134" rx="10" />
		<g clip-path="url(#{uid}-screen)">
			<rect class="screen" x="10" y="30" width="180" height="134" />
			{#if scene === 'mac-file' || scene === 'mac-dock'}
				<rect class="bar" x="10" y="30" width="180" height="12" />
				<rect class="line strong" x="18" y="34" width="14" height="4" rx="2" />
				<rect class="line {scene === 'mac-file' ? 'accent-fill' : 'strong'}" x="38" y="34" width="16" height="4" rx="2" />
				<rect class="line" x="60" y="34" width="16" height="4" rx="2" />
				<rect class="line" x="82" y="34" width="16" height="4" rx="2" />
				{#if scene === 'mac-file'}
					{@render spot(46, 36, 8)}
				{:else}
					<rect class="sheet" x="34" y="43" width="74" height="68" rx="6" />
					{#each [49, 61, 85, 97] as y (y)}<rect class="line" x="40" y={y} width="50" height="4" rx="2" />{/each}
					<rect class="row on" x="37" y="70" width="68" height="12" rx="4" />
					<rect class="line accent-fill" x="41" y="74" width="44" height="4" rx="2" />
					<rect class="dock" x="56" y="144" width="88" height="16" rx="6" />
					{#each [62, 78, 110, 126] as x (x)}<rect class="app-tile" x={x} y="147" width="10" height="10" rx="3" />{/each}
					{@render icon(93, 146, 13)}
					{@render spot(62, 76, 8)}
				{/if}
			{:else}
				<rect class="bar" x="10" y="30" width="180" height="14" />
				<rect class="tab" x="18" y="34" width="44" height="10" rx="3" />
				<rect class="pill" x="20" y="48" width="150" height="14" rx="7" />
				<rect class="line" x="28" y="53" width="60" height="4" rx="2" />
				<path class="glyph {scene === 'desktop-bar' ? 'accent' : ''}" d="M154 51.5h10v7h-10zM157 61.5h4M159 53v3.5M157.5 55l1.5 1.5 1.5-1.5" />
				<g class="dots"><circle cx="180" cy="51" r="1.3" /><circle cx="180" cy="55" r="1.3" /><circle cx="180" cy="59" r="1.3" /></g>
				<rect class="line strong" x="28" y="74" width="70" height="7" rx="3.5" />
				<rect class="line" x="28" y="88" width="120" height="4" rx="2" />
				<rect class="line" x="28" y="96" width="100" height="4" rx="2" />
				<rect class="block" x="28" y="108" width="144" height="44" rx="8" />
				{#if scene === 'desktop-bar'}
					{@render spot(159, 55)}
				{:else}
					<rect class="sheet" x="98" y="64" width="84" height="56" rx="8" />
					{@render icon(105, 71, 18)}
					<rect class="line strong" x="128" y="75" width="40" height="5" rx="2.5" />
					<rect class="line" x="128" y="84" width="28" height="4" rx="2" />
					<rect class="line" x="118" y="104" width="18" height="4" rx="2" />
					<rect class="button" x="141" y="100" width="34" height="12" rx="6" />
					{@render spot(158, 106, 10)}
				{/if}
			{/if}
		</g>
	{/if}
</svg>

<style>
	.scene {
		display: block;
		width: 100%;
		max-width: 220px;
		height: auto;
		margin: 0 auto;
		overflow: visible;
	}

	.frame {
		fill: var(--surface-2);
		stroke: var(--border);
		stroke-width: 1.5;
	}

	.screen {
		fill: var(--surface);
	}

	.wallpaper {
		fill: color-mix(in oklab, var(--accent) 10%, var(--surface));
	}

	.bar,
	.tab {
		fill: var(--surface-2);
	}

	.tab {
		fill: var(--surface);
	}

	.pill {
		fill: var(--bg);
		stroke: var(--hairline);
	}

	.line {
		fill: color-mix(in oklab, var(--text-muted) 32%, transparent);
	}

	.line.strong {
		fill: color-mix(in oklab, var(--text) 55%, transparent);
	}

	.accent-fill,
	.line.accent-fill {
		fill: var(--accent);
	}

	.block {
		fill: var(--surface-2);
	}

	.dim {
		fill: var(--scrim);
	}

	.sheet {
		fill: var(--surface);
		stroke: var(--border);
		filter: drop-shadow(0 4px 8px rgb(0 0 0 / 0.12));
	}

	.row {
		fill: var(--surface-2);
	}

	.row.on {
		fill: var(--accent-soft);
	}

	.app,
	.app-tile {
		fill: color-mix(in oklab, var(--text-muted) 22%, var(--surface));
	}

	.icon-bg {
		fill: var(--surface);
		stroke: var(--border);
	}

	.dock {
		fill: color-mix(in oklab, var(--surface) 70%, transparent);
		stroke: var(--hairline);
	}

	.button {
		fill: var(--accent);
	}

	.glyph {
		fill: none;
		stroke: var(--text-muted);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.glyph.accent {
		stroke: var(--accent);
	}

	.dots {
		fill: var(--text-muted);
	}

	.dots.accent {
		fill: var(--accent);
	}

	/* Where to tap: a ring in the accent, softly breathing so the eye finds it. */
	.spot {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
	}

	.halo {
		fill: var(--accent-soft);
		opacity: 0.7;
	}

	.pulse {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		transform-box: fill-box;
		transform-origin: center;
		/* A few breaths, then still: the season is the app's only looping motion. */
		animation: pulse 1.8s var(--ease) 0.3s 3 both;
	}

	@keyframes pulse {
		from {
			opacity: 0.6;
			transform: scale(1);
		}
		to {
			opacity: 0;
			transform: scale(1.9);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pulse {
			display: none;
		}
	}
</style>

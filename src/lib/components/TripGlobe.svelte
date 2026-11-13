<script lang="ts">
	import { onMount } from 'svelte';
	import { areaPath, facing, graticule, greatCircle, linePath, middle, project, type LonLat, type View } from '#lib/trips/globe.ts';

	/**
	 * The earth seen from space over where a trip goes (#334), with a pin needle in each place and
	 * the route between them. It turns there when it appears and can be turned by dragging.
	 * Drawn by hand (lib/trips/globe.ts); the land outline loads with it, not with the page.
	 */
	let { places, label }: { places: { lat: number; lon: number; name: string }[]; label: string } = $props();

	const SIZE = 200;
	const R = 84;
	const uid = $props.id();
	const points = $derived(places.map((place): LonLat => [place.lon, place.lat]));
	const target = $derived(middle(points));

	let land = $state<LonLat[][][]>([]);
	// Where the globe looks: the trip's places, after turning there from a little further west.
	let center = $state<LonLat>([0, 30]);
	const view = $derived<View>({ center, r: R, cx: SIZE / 2, cy: SIZE / 2 + 6 });
	const grid = graticule();

	const landPath = $derived(land.flatMap((polygon) => polygon.map((ring) => areaPath(ring, view))).join(''));
	const gridPath = $derived(grid.map((line) => linePath(line, view)).join(''));
	const routePath = $derived(points.slice(1).map((point, i) => linePath(greatCircle(points[i], point), view)).join(''));
	const pins = $derived(
		places
			.map((place, i) => ({ place, at: project(points[i], view), seen: facing(points[i], view) }))
			// The far ones first, so the near ones stand in front.
			.filter((pin) => pin.seen > 0.05)
			.sort((a, b) => a.seen - b.seen)
	);

	onMount(() => {
		let frame = 0;
		let cancelled = false;
		const [lon, lat] = target;
		center = [lon - 70, Math.max(-60, Math.min(60, lat - 15))];
		import('#lib/trips/land.generated.ts').then(({ LAND }) => {
			if (cancelled) return;
			land = LAND as LonLat[][][];
			const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (still) {
				center = target;
				return;
			}
			const from = center;
			const started = performance.now();
			const turn = (now: number) => {
				const t = Math.min(1, (now - started) / 1600);
				const eased = 1 - Math.pow(1 - t, 3);
				center = [from[0] + (lon - from[0]) * eased, from[1] + (lat - from[1]) * eased];
				if (t < 1 && !dragging) frame = requestAnimationFrame(turn);
			};
			frame = requestAnimationFrame(turn);
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(frame);
		};
	});

	// Turning it by hand: left and right turns the earth, up and down tilts it.
	let dragging = $state(false);
	let last: [number, number] = [0, 0];
	const grab = (event: PointerEvent) => {
		dragging = true;
		last = [event.clientX, event.clientY];
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	};
	const move = (event: PointerEvent) => {
		if (!dragging) return;
		const [dx, dy] = [event.clientX - last[0], event.clientY - last[1]];
		last = [event.clientX, event.clientY];
		center = [center[0] - dx * 0.6, Math.max(-80, Math.min(80, center[1] + dy * 0.6))];
	};
	const drop = () => (dragging = false);
</script>

<svg viewBox="0 0 {SIZE} {SIZE}" class="globe" class:dragging role="img" aria-label={label} onpointerdown={grab} onpointermove={move} onpointerup={drop} onpointercancel={drop}>
	<defs>
		<radialGradient id="sea-{uid}" cx="36%" cy="32%" r="78%">
			<stop offset="0%" class="sea-light" />
			<stop offset="100%" class="sea-dark" />
		</radialGradient>
		<radialGradient id="glow-{uid}" cx="50%" cy="50%" r="50%">
			<stop offset="84%" class="glow-in" />
			<stop offset="100%" class="glow-out" />
		</radialGradient>
		<radialGradient id="shade-{uid}" cx="36%" cy="32%" r="80%">
			<stop offset="55%" class="shade-in" />
			<stop offset="100%" class="shade-out" />
		</radialGradient>
		<radialGradient id="head-{uid}" cx="35%" cy="30%" r="70%">
			<stop offset="0%" class="head-light" />
			<stop offset="100%" class="head-dark" />
		</radialGradient>
	</defs>
	<circle cx={view.cx} cy={view.cy} r={R + 10} fill="url(#glow-{uid})" />
	<circle class="sphere" cx={view.cx} cy={view.cy} r={R} fill="url(#sea-{uid})" />
	<path class="grid" d={gridPath} />
	<path class="land" d={landPath} />
	{#if routePath}<path class="route" d={routePath} />{/if}
	<!-- The shade on the side away from the light. -->
	<circle class="shade" cx={view.cx} cy={view.cy} r={R} fill="url(#shade-{uid})" />
	{#each pins as pin (pin.place.name + pin.place.lat)}
		{@const [x, y] = pin.at}
		<g class="pin">
			<ellipse class="pin-shadow" cx={x + 2} cy={y + 0.5} rx="3.2" ry="1.3" />
			<line class="needle" x1={x} y1={y} x2={x} y2={y - 20} />
			<circle cx={x} cy={y - 23} r="5.2" fill="url(#head-{uid})" />
			<title>{pin.place.name}</title>
		</g>
	{/each}
</svg>

<style>
	.globe {
		display: block;
		width: 100%;
		height: auto;
		touch-action: none;
		cursor: grab;
		user-select: none;
	}

	.globe.dragging {
		cursor: grabbing;
	}

	.sea-light {
		stop-color: color-mix(in oklab, var(--accent) 22%, var(--surface));
	}

	.sea-dark {
		stop-color: color-mix(in oklab, var(--accent) 38%, var(--bg));
	}

	.glow-in {
		stop-color: color-mix(in oklab, var(--accent) 22%, transparent);
	}

	.glow-out {
		stop-color: transparent;
	}

	.sphere {
		stroke: color-mix(in oklab, var(--accent) 35%, transparent);
		stroke-width: 0.8;
	}

	.grid {
		fill: none;
		stroke: color-mix(in oklab, var(--accent) 16%, transparent);
		stroke-width: 0.5;
	}

	.land {
		fill: color-mix(in oklab, var(--accent) 55%, var(--surface));
		stroke: color-mix(in oklab, var(--accent) 70%, var(--text));
		stroke-width: 0.35;
		stroke-linejoin: round;
	}

	.route {
		fill: none;
		stroke: var(--danger);
		stroke-width: 1.6;
		stroke-dasharray: 3 3;
		stroke-linecap: round;
	}

	.shade {
		pointer-events: none;
	}

	.shade-in {
		stop-color: rgb(0 0 0 / 0);
	}

	.shade-out {
		stop-color: rgb(0 0 0 / 0.3);
	}

	.pin-shadow {
		fill: rgb(0 0 0 / 0.3);
	}

	.needle {
		stroke: color-mix(in oklab, var(--text) 70%, #888);
		stroke-width: 1.3;
		stroke-linecap: round;
	}

	.head-light {
		stop-color: color-mix(in oklab, var(--danger) 45%, white);
	}

	.head-dark {
		stop-color: var(--danger);
	}
</style>

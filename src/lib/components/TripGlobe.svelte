<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { areaPath, facing, graticule, greatCircle, linePath, middle, project, type LonLat, type View } from '#lib/trips/globe.ts';

	/**
	 * The earth seen from space over where a trip goes (#334), with a pin needle in each place and
	 * the route between them. It turns there when it appears and can be turned by dragging. With a
	 * place in focus (from the places beside it, or by tapping its pin) it turns to that place and
	 * zooms in like a magnifier, and its pin stands out. Drawn by hand (lib/trips/globe.ts); the
	 * land outline loads with it, not with the page.
	 */
	let {
		places,
		label,
		focus = $bindable(null)
	}: {
		/** "key": the place's number in the trip, the same as "focus". */
		places: { lat: number; lon: number; name: string; key: number }[];
		label: string;
		focus?: number | null;
	} = $props();

	const SIZE = 200;
	const R = 84;
	const CX = SIZE / 2;
	const CY = SIZE / 2 + 6;
	const uid = $props.id();
	const points = $derived(places.map((place): LonLat => [place.lon, place.lat]));
	const overview = $derived(middle(points));

	/** How near to come for all places: the farther apart they are, the less. */
	const fitZoom = $derived.by(() => {
		const spread = Math.max(0.02, ...points.map((point) => Math.acos(Math.min(1, facing(point, { center: overview })))));
		return Math.max(1, Math.min(1.7, 0.55 / Math.sin(spread)));
	});
	/** A place in focus: close enough that its neighbours spread out. */
	const focusZoom = $derived(Math.min(4.5, Math.max(2.6, fitZoom * 1.8)));

	let land = $state<LonLat[][][]>([]);
	// Where the globe looks, and how near: a magnifier over the globe's disc.
	let center = $state<LonLat>([0, 30]);
	let zoom = $state(1);
	const view = $derived<View>({ center, r: R * zoom, cx: CX, cy: CY });
	const grid = graticule();

	const landPath = $derived(land.flatMap((polygon) => polygon.map((ring) => areaPath(ring, view))).join(''));
	const gridPath = $derived(grid.map((line) => linePath(line, view)).join(''));
	const routePath = $derived(points.slice(1).map((point, i) => linePath(greatCircle(points[i], point, zoom > 2 ? 64 : 32), view)).join(''));
	const pins = $derived(
		places
			.map((place, i) => {
				const at = project(points[i], view);
				return { place, at, seen: facing(points[i], view), inside: Math.hypot(at[0] - CX, at[1] - CY) < R - 2 };
			})
			// Only those in sight; the far ones and the focused one last, so they stand in front.
			.filter((pin) => pin.seen > 0.05 && pin.inside)
			.sort((a, b) => Number(a.place.key === focus) - Number(b.place.key === focus) || a.seen - b.seen)
	);

	let still = false;
	let frame = 0;
	/** Turns and zooms to a view, the short way round. */
	function go(to: LonLat, toZoom: number, ms = 900) {
		cancelAnimationFrame(frame);
		if (still) {
			center = to;
			zoom = toZoom;
			return;
		}
		const from = center;
		const fromZoom = zoom;
		const turn = ((((to[0] - from[0]) % 360) + 540) % 360) - 180;
		const started = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - started) / ms);
			const eased = 1 - Math.pow(1 - t, 3);
			center = [from[0] + turn * eased, from[1] + (to[1] - from[1]) * eased];
			zoom = fromZoom + (toZoom - fromZoom) * eased;
			if (t < 1 && !dragging) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
	}

	let ready = $state(false);
	onMount(() => {
		let cancelled = false;
		still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		center = [overview[0] - 70, Math.max(-60, Math.min(60, overview[1] - 15))];
		import('#lib/trips/land.generated.ts').then(({ LAND }) => {
			if (cancelled) return;
			land = LAND as LonLat[][][];
			ready = true;
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(frame);
		};
	});

	// To the place in focus, or back to all of them. Follows only those: the turning itself
	// reads and writes the view, which mustn't start it again.
	$effect(() => {
		if (!ready) return;
		const place = places.find((one) => one.key === focus);
		const [to, toZoom, ms] = place ? [[place.lon, place.lat] as LonLat, focusZoom, 900] : [overview, fitZoom, 1600];
		untrack(() => go(to, toZoom, ms));
	});

	// Turning it by hand: left and right turns the earth, up and down tilts it; a tap on a pin focuses it.
	let dragging = $state(false);
	let moved = 0;
	let last: [number, number] = [0, 0];
	const grab = (event: PointerEvent) => {
		dragging = true;
		moved = 0;
		last = [event.clientX, event.clientY];
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	};
	const move = (event: PointerEvent) => {
		if (!dragging) return;
		const [dx, dy] = [event.clientX - last[0], event.clientY - last[1]];
		moved += Math.abs(dx) + Math.abs(dy);
		last = [event.clientX, event.clientY];
		const speed = 0.6 / zoom;
		center = [center[0] - dx * speed, Math.max(-80, Math.min(80, center[1] + dy * speed))];
	};
	const drop = (event: PointerEvent) => {
		dragging = false;
		if (moved > 6) return;
		// A tap: the pin whose head is nearest, if one is near; elsewhere back to all places.
		const box = (event.currentTarget as Element).getBoundingClientRect();
		const [x, y] = [((event.clientX - box.left) / box.width) * SIZE, ((event.clientY - box.top) / box.height) * SIZE];
		const near = pins
			.map((pin) => ({ key: pin.place.key, d: Math.hypot(pin.at[0] - x, pin.at[1] - 23 - y) }))
			.filter((pin) => pin.d < 16)
			.sort((a, b) => a.d - b.d)[0];
		focus = near && near.key !== focus ? near.key : null;
	};
	const cancel = () => (dragging = false);
</script>

<svg viewBox="0 0 {SIZE} {SIZE}" class="globe" class:dragging role="img" aria-label={label} onpointerdown={grab} onpointermove={move} onpointerup={drop} onpointercancel={cancel}>
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
		<clipPath id="disc-{uid}"><circle cx={CX} cy={CY} r={R} /></clipPath>
	</defs>
	<circle cx={CX} cy={CY} r={R + 10} fill="url(#glow-{uid})" />
	<circle class="sphere" cx={CX} cy={CY} r={R} fill="url(#sea-{uid})" />
	<!-- Zoomed in, the earth is larger than the disc and shows through it like through a lens. -->
	<g clip-path="url(#disc-{uid})">
		<path class="grid" d={gridPath} />
		<path class="land" d={landPath} />
		{#if routePath}<path class="route" d={routePath} />{/if}
	</g>
	<!-- The shade on the side away from the light. -->
	<circle class="shade" cx={CX} cy={CY} r={R} fill="url(#shade-{uid})" />
	{#each pins as pin (pin.place.key)}
		{@const [x, y] = pin.at}
		{@const on = pin.place.key === focus}
		<g class="pin" class:dim={focus !== null && !on}>
			{#if on}<circle class="halo" cx={x} cy={y} r="6" />{/if}
			<ellipse class="pin-shadow" cx={x + 2} cy={y + 0.5} rx="3.2" ry="1.3" />
			<line class="needle" x1={x} y1={y} x2={x} y2={y - 20} />
			<circle cx={x} cy={y - 23} r={on ? 6.5 : 5.2} fill="url(#head-{uid})" />
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

	.pin {
		transition: opacity var(--fast) var(--ease);
	}

	.pin.dim {
		opacity: 0.45;
	}

	/* The place in focus: a ring that spreads from the needle's point. */
	.halo {
		fill: none;
		stroke: var(--danger);
		stroke-width: 1.5;
		transform-box: fill-box;
		transform-origin: center;
		animation: halo 1.6s var(--ease) infinite;
	}

	@keyframes halo {
		from {
			opacity: 0.9;
			transform: scale(0.4);
		}
		to {
			opacity: 0;
			transform: scale(2.4);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.halo {
			animation: none;
		}
	}
</style>

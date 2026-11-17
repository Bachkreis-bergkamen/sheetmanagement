<script lang="ts">
	/**
	 * J. S. Bach as he beats time (#368), drawn from a pose (src/lib/practice/conducting.ts):
	 * a half figure after the Haussmann portrait, white wig, dark coat, a jabot, the baton in his
	 * right hand and a roll of music in his left. He faces the player, so the figure his baton
	 * draws is seen from the front. Every limb is drawn between the pose's joints, so shoulder,
	 * elbow and wrist stay joined however he moves; the body and head sit in nested groups, the
	 * head carried by the body.
	 */
	import { BATON, beatPoints, figurePath, type BachPose, type ConductorMeter, type Point } from '#lib/practice/conducting.ts';

	let {
		meter,
		pose,
		current = null,
		flash = false,
		counting = false,
		still = false
	}: { meter: ConductorMeter; pose: BachPose; current?: number | null; flash?: boolean; counting?: boolean; still?: boolean } = $props();

	const id = $props.id();
	const way = $derived(figurePath(meter));
	const beats = $derived(beatPoints(meter));

	/** A limb between two joints, wider at one end than the other, as a closed outline. */
	function limb([ax, ay]: Point, ra: number, [bx, by]: Point, rb: number): string {
		const length = Math.hypot(bx - ax, by - ay) || 0.001;
		const nx = -(by - ay) / length;
		const ny = (bx - ax) / length;
		const at = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
		return `M${at(ax + nx * ra, ay + ny * ra)}L${at(bx + nx * rb, by + ny * rb)}A${rb} ${rb} 0 0 0 ${at(bx - nx * rb, by - ny * rb)}L${at(ax - nx * ra, ay - ny * ra)}A${ra} ${ra} 0 0 0 ${at(ax + nx * ra, ay + ny * ra)}Z`;
	}
	/** The point `share` of the way from one joint to the next. */
	const between = (a: Point, b: Point, share: number): Point => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
	const degrees = (from: Point, to: Point) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

	const body = $derived(`translate(${pose.torso.x.toFixed(2)} ${pose.torso.y.toFixed(2)}) rotate(${pose.torso.lean.toFixed(2)} ${pose.torso.hips[0]} ${pose.torso.hips[1]})`);
	const head = $derived(`translate(${pose.head.x.toFixed(2)} ${pose.head.y.toFixed(2)}) rotate(${pose.head.tilt.toFixed(2)} 80 48)`);
	const right = $derived(pose.right);
	const left = $derived(pose.left);
</script>

<svg class="bach" viewBox="0 0 160 166" aria-hidden="true">
	<defs>
		<!-- He fades out below the waist, as a portrait bust does. -->
		<linearGradient id="{id}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="138" x2="0" y2="166">
			<stop offset="0" stop-color="#fff" />
			<stop offset="1" stop-color="#000" />
		</linearGradient>
		<mask id="{id}-bust" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="166">
			<rect width="160" height="166" fill="url(#{id}-fade)" />
		</mask>
		<linearGradient id="{id}-coat" gradientUnits="userSpaceOnUse" x1="44" y1="0" x2="116" y2="0">
			<stop offset="0" stop-color="#231b18" />
			<stop offset="0.45" stop-color="#3a2e28" />
			<stop offset="1" stop-color="#261d1a" />
		</linearGradient>
	</defs>

	<g transform={body}>
		<g mask="url(#{id}-bust)">
			<path d="M50 60 C43 65 45 82 47 100 C48 124 44 146 41 168 L119 168 C116 146 112 124 113 100 C115 82 117 65 110 60 C102 54 92 52 88 51 L72 51 C68 52 58 54 50 60 Z" class="coat" fill="url(#{id}-coat)" />
			<!-- The waistcoat where the coat stands open, its buttons, and the coat's own edges. -->
			<path d="M72 53 L88 53 C93 78 95 120 93 168 L67 168 C65 120 67 78 72 53 Z" class="waistcoat" />
			<path d="M72 53 C67 78 65 120 67 168 M88 53 C93 78 95 120 93 168" class="seam" />
			{#each [86, 96, 106, 116, 126, 136] as y (y)}<circle cx="80" cy={y} r="1.15" class="button" />{/each}
			{#each [92, 108, 124] as y (y)}<circle cx={97.5 + (y - 92) * 0.02} cy={y} r="1.3" class="button dim" />{/each}
		</g>
		<rect x="74" y="38" width="12" height="16" rx="3" class="skin shade" />
		<!-- The jabot, lifting a little as he breathes in. -->
		<g transform="translate(0 {(-0.3 * pose.breath).toFixed(2)})">
			<path d="M72.5 50 L87.5 50 L86.5 60 L84 72 L80 78 L76 72 L73.5 60 Z" class="linen" />
			<path d="M76 54 L78 70 M84 54 L82 70 M80 53 L80 76" class="fold" />
		</g>

		<g transform={head}>
			<!-- The wig behind the face, its curls falling to the shoulders. -->
			<ellipse cx="80" cy="26" rx="19.5" ry="20.5" class="wig" />
			{#each [-1, 1] as side (side)}
				{#each [[17.6, 33], [18.6, 41.5], [17, 50]] as [dx, y] (y)}
					<circle cx={80 + side * dx} cy={y} r="5.7" class="wig" />
					<path d="M{80 + side * (dx + 2.6)} {y - 1} a2.6 2.6 0 1 {side > 0 ? 0 : 1} {-side * 3.4} 2.2" class="curl" />
				{/each}
			{/each}
			<ellipse cx="80" cy="29.6" rx="11.6" ry="14.2" class="skin" />
			<path d="M73.6 41.2 q6.4 4.6 12.8 0" class="line faint" />
			<ellipse cx="72.6" cy="34" rx="2.6" ry="1.9" class="cheek" />
			<ellipse cx="87.4" cy="34" rx="2.6" ry="1.9" class="cheek" />
			<!-- The wig's front: rolled back from the forehead, parted in the middle. -->
			<path d="M67.4 26 C65.5 6 94.5 6 92.6 26 C90.5 18.5 85 16.2 80 18 C75 16.2 69.5 18.5 67.4 26 Z" class="wig" />
			<path d="M80 9 L80 17.6 M73 11.5 q-3 3 -3.6 8 M87 11.5 q3 3 3.6 8" class="curl" />
			<!-- Heavy brows, lifting as he draws breath for the downbeat. -->
			<g transform="translate(0 {(-0.8 * pose.head.brows).toFixed(2)})">
				<path d="M71 25.3 Q74.2 23.4 77.6 25.2 M82.4 25.2 Q85.8 23.4 89 25.3" class="brow" />
			</g>
			{#each [74.7, 85.3] as x (x)}
				{#if pose.head.blink}
					<path d="M{x - 1.9} 28.3 q1.9 0.9 3.8 0" class="line" />
				{:else}
					<ellipse cx={x} cy="28.2" rx="1.9" ry="1.2" class="white" />
					<circle cx={x + 0.5 * pose.head.look} cy="28.2" r="1.05" class="eye" />
					<path d="M{x - 2.1} 27.7 q2.1 -1.5 4.2 0" class="line" />
				{/if}
			{/each}
			<path d="M80.6 27.6 q1.7 5 -0.2 6.3 q-1.1 0.5 -2 -0.3" class="line" />
			<path d="M76 37.9 q4 0.7 8 0" class="mouth" />
			<path d="M78.2 39.9 q1.8 0.6 3.6 0" class="line faint" />
		</g>
	</g>

	<!-- His left arm, the roll of music in its hand. -->
	<path d={limb(left.shoulder, 8.6, left.elbow, 7)} class="sleeve" />
	<path d={limb(left.elbow, 6.8, left.hand, 5.4)} class="sleeve" />
	<path d={limb(between(left.elbow, left.hand, 0.5), 7.2, between(left.elbow, left.hand, 0.9), 7.4)} class="cuff" />
	<circle cx={left.hand[0]} cy={left.hand[1]} r="4.7" class="lace" />
	<g transform="translate({left.hand[0].toFixed(2)} {left.hand[1].toFixed(2)}) rotate({(degrees(left.elbow, left.hand) + 96).toFixed(1)})">
		<rect x="-12" y="-5.4" width="22" height="5" rx="2.4" class="roll" />
		<path d="M-10 -5.2 q-1.4 2.4 0 4.6" class="fold" />
		<ellipse cx="0" cy="-2.6" rx="3.5" ry="3.9" class="skin" />
		<path d="M-1.6 -5.6 l0 5.6 M0.4 -6 l0 6.2 M2.2 -5.4 l0 5.2" class="knuckle" />
	</g>

	<!-- His right arm: shoulder, elbow and wrist are the pose's joints. -->
	<path d={limb(right.shoulder, 8.6, right.elbow, 7)} class="sleeve" />
	<path d={limb(right.elbow, 6.8, right.hand, 5.4)} class="sleeve" />
	<path d={limb(between(right.elbow, right.hand, 0.5), 7.2, between(right.elbow, right.hand, 0.9), 7.4)} class="cuff" />
	<circle cx={right.hand[0]} cy={right.hand[1]} r="4.7" class="lace" />

	<!-- The figure his baton draws, and where its beats fall. -->
	<path d={way} class="way" />
	{#each beats as [x, y], i (`${meter}-${i}`)}
		<circle cx={x} cy={y} r={current === i ? 2.6 : 1.7} class="ictus" class:now={current === i} />
		<text {x} y={i === meter - 1 && meter > 1 ? y - 4.5 : y + 10} text-anchor="middle" class="number" class:now={current === i}>{i + 1}</text>
	{/each}

	<!-- The hand turns at the wrist, and the baton with it. -->
	<g transform="translate({right.hand[0].toFixed(2)} {right.hand[1].toFixed(2)}) rotate({(-pose.baton).toFixed(1)})">
		<path d="M-1.6 -1 L{BATON} -0.4 L{BATON} 0.4 L-1.6 1 Z" class="baton" />
		<ellipse cx="3" cy="0.5" rx="3.7" ry="3.2" class="skin" />
		<path d="M1.6 1.6 q0.3 1.3 1.5 1.8 M3.6 1.9 q0.3 1.2 1.4 1.5" class="knuckle" />
		<!-- The thumb lies along the baton, the forefinger over it. -->
		<path d="M1.4 -1.6 C3 -3 6.4 -2.6 7.4 -1.2 C6.4 -0.3 3.2 -0.2 1.4 -1.6 Z" class="skin" />
	</g>

	{#if flash}<circle cx={pose.tip[0]} cy={pose.tip[1]} r="6.5" class="ring" class:counting />{/if}
	<circle cx={pose.tip[0]} cy={pose.tip[1]} r="2.7" class="dot" class:still class:counting />
</svg>

<style>
	/* Larger than the bare figure: his face and the baton need room to be seen. */
	.bach {
		display: block;
		width: min(260px, 100%);
		height: auto;
	}

	.coat,
	.sleeve,
	.cuff {
		stroke: #6d5b4d;
		stroke-width: 0.5;
		stroke-linejoin: round;
	}

	/* The sleeves a shade lighter than the coat, so the arms stand off the body. */
	.sleeve {
		fill: #44362e;
	}

	.cuff {
		fill: #56443a;
	}

	.waistcoat {
		fill: #5d4636;
	}

	.seam {
		fill: none;
		stroke: #1c1512;
		stroke-width: 0.7;
	}

	.button {
		fill: #c3a66a;
	}

	.button.dim {
		fill: #8f7950;
	}

	.wig {
		fill: #ece7dd;
		stroke: #b9b0a2;
		stroke-width: 0.6;
	}

	.curl,
	.fold {
		fill: none;
		stroke: #b9b0a2;
		stroke-width: 0.6;
		stroke-linecap: round;
	}

	.linen,
	.lace {
		fill: #f7f3ec;
		stroke: #c9c0b2;
		stroke-width: 0.5;
		stroke-linejoin: round;
	}

	/* A ruffle at the wrist. */
	.lace {
		stroke-width: 1.3;
		stroke-dasharray: 1.6 1.1;
	}

	.skin {
		fill: #ecc6a3;
		stroke: #c1926d;
		stroke-width: 0.5;
	}

	.skin.shade {
		fill: #d9ac86;
	}

	.cheek {
		fill: #d98f7a;
		opacity: 0.28;
	}

	.white {
		fill: #fbf8f2;
	}

	.eye {
		fill: #2a1f1a;
	}

	.line,
	.mouth,
	.brow,
	.knuckle {
		fill: none;
		stroke: #8a5f45;
		stroke-width: 0.7;
		stroke-linecap: round;
	}

	.line.faint {
		opacity: 0.55;
	}

	.mouth {
		stroke: #7a4636;
		stroke-width: 0.9;
	}

	.brow {
		stroke: #6f6a62;
		stroke-width: 1.5;
	}

	.knuckle {
		stroke-width: 0.5;
		opacity: 0.7;
	}

	.roll {
		fill: #f3ead6;
		stroke: #b8a988;
		stroke-width: 0.5;
	}

	.baton {
		fill: #f6eeda;
		stroke: #4a3a2a;
		stroke-width: 0.4;
		stroke-linejoin: round;
	}

	/* The figure lies over his dark coat, so it's drawn light, whatever the page's colours. */
	.way {
		fill: none;
		stroke: #f2eee4;
		stroke-width: 0.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.4;
	}

	.ictus {
		fill: #f2eee4;
		opacity: 0.8;
	}

	.number {
		fill: #f2eee4;
		font-size: 7px;
		font-weight: 600;
		paint-order: stroke;
		stroke: #1c1512;
		stroke-width: 1.8px;
		stroke-linejoin: round;
	}

	.ictus.now,
	.number.now {
		fill: var(--accent-dark, #ffd27a);
		opacity: 1;
	}

	.dot {
		fill: var(--accent);
		stroke: #fff;
		stroke-width: 0.6;
	}

	.dot.counting {
		fill: var(--text-muted);
	}

	.dot.still {
		opacity: 0.5;
	}

	.ring {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.3;
		opacity: 0.6;
	}

	.ring.counting {
		stroke: var(--text-muted);
	}
</style>

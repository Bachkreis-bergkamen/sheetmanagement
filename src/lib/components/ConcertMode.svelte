<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { Stroke } from '#lib/practice/marks.ts';
	import Icon from './Icon.svelte';
	import PracticeScore from './PracticeScore.svelte';

	/**
	 * The concert mode (#194): the member's parts of a programme one after another, full screen,
	 * turned by tapping, the arrow keys or a page-turn pedal straight on into the next piece.
	 * Saved parts open without a connection, and the screen stays on while it's open.
	 */
	let {
		files,
		marks,
		onclose
	}: {
		/** In programme order. */
		files: { id: string; label: string; piece: string }[];
		/** The member's own marks, by file and page; shown, not edited here. */
		marks: Record<string, Record<number, Stroke[]>>;
		onclose: () => void;
	} = $props();

	let index = $state(0);
	let startAt = $state<'first' | 'last'>('first');
	let night = $state(false);
	const current = $derived(files[index]);

	function go(next: number, from: 'first' | 'last' = 'first') {
		if (next < 0 || next >= files.length) return;
		startAt = from;
		index = next;
	}

	// The screen stays on, also after switching apps and back; where the browser allows it.
	$effect(() => {
		let lock: WakeLockSentinel | null = null;
		const request = async () => {
			try {
				lock = (await navigator.wakeLock?.request('screen')) ?? null;
			} catch {
				// Battery saver or an older browser: the screen may dim as usual.
			}
		};
		const visible = () => {
			if (document.visibilityState === 'visible') request();
		};
		request();
		document.addEventListener('visibilitychange', visible);
		return () => {
			document.removeEventListener('visibilitychange', visible);
			lock?.release().catch(() => {});
		};
	});
</script>

{#snippet pieces()}
	<label class="jump">
		<span class="sr-only">{t.myParts.concertMode.piece}</span>
		<select value={index} onchange={(event) => go(Number(event.currentTarget.value))}>
			{#each files as file, i (file.id)}
				<option value={i}>{i + 1}. {file.piece} – {file.label}</option>
			{/each}
		</select>
	</label>
	<button type="button" class="toggle" class:on={night} aria-pressed={night} onclick={() => (night = !night)}>
		<Icon name="moon" size={15} />{t.myParts.concertMode.night}
	</button>
{/snippet}

{#if current}
	<!-- Keyed by nothing: the viewer stays, so full screen carries on from piece to piece. -->
	<div class="concert-mode" role="dialog" aria-modal="true" aria-label={t.myParts.concertMode.title}>
		<PracticeScore
			file={current.id}
			marks={marks[current.id] ?? {}}
			pen={false}
			{startAt}
			startFull
			{night}
			onpast={(step) => go(index + step, step === -1 ? 'last' : 'first')}
			onleave={onclose}
			extra={pieces}
		/>
	</div>
{/if}

<style>
	/* Like the viewer's own toolbar buttons, which these sit next to. */
	.jump select,
	.toggle {
		height: 40px;
		padding: 0 var(--space-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
	}

	.jump select {
		font-size: max(var(--control-min), var(--text-sm));
		max-width: min(56vw, 22rem);
		font-weight: 600;
		text-overflow: ellipsis;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		cursor: pointer;
	}

	.toggle.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	@media (max-width: 560px) {
		.jump select,
		.toggle {
			height: 34px;
			font-size: var(--text-xs);
		}

		.jump select {
			font-size: max(var(--control-min), var(--text-xs));
		}
	}
</style>

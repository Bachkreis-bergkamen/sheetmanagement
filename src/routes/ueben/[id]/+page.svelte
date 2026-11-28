<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import PracticeScore from '#lib/components/PracticeScore.svelte';
	import PracticeTools from '#lib/components/PracticeTools.svelte';
	import Title from '#lib/components/Title.svelte';
	import { showToast } from '#lib/forms.svelte.ts';
	import { BEAT_SECONDS, PracticeClock } from '#lib/practice/practice.ts';
	import { outcome, queuePractice, sendQueuedPractice } from '#lib/offline/practice-queue.ts';
	import QuickReport from '#lib/components/QuickReport.svelte';

	/**
	 * The practice viewer: the part page by page (PracticeScore), with the piece's recording,
	 * a metronome and a tuner. With practice time on, a clock counts the time the part is open,
	 * visible and in use (see PracticeClock); every 30 seconds, and when the page is hidden or
	 * left, the counted seconds go to /api/ueben.
	 */
	let { data } = $props();

	/**
	 * The tools, each a button in the score's toolbar; PracticeScore places their panel beside the
	 * page. Metronome, tuner and drone share one, "Werkzeuge", with a tab each; all stay running.
	 */
	const tools = $derived([
		...(data.recording ? [{ value: 'recording' as const, label: t.practice.recording.title }] : []),
		{ value: 'tools' as const, label: t.practice.viewer.tools }
	]);

	/**
	 * The tools in a window of their own, which can go to a second screen (#410); one window,
	 * brought forward when it's open already. The panel beside the page closes meanwhile.
	 */
	function popOut() {
		const opened = window.open(`/ueben/${encodeURIComponent(data.file)}/werkzeuge`, 'practice-tools', 'popup,width=380,height=640');
		if (!opened) showToast(t.practice.viewer.popOutBlocked);
		else opened.focus();
		return !!opened;
	}
	// Only where a window can go beside the app, with a mouse: on phones and tablets it would replace the page.
	let canPopOut = $state(false);
	$effect(() => {
		canPopOut = matchMedia('(pointer: fine)').matches;
	});

	// The clock: ticks every 5 seconds, reports every 30; only with practice time on.
	type Status = 'counting' | 'idle' | 'paused' | 'full' | 'stopped';
	let status = $state<Status>('counting');
	/** The page shown, and the report about it (#306). */
	let page = $state(1);
	let reporting = $state(false);
	/** Counts on after a pause: the "Noch am Üben?" button. */
	let resume = () => {};
	let today = $state(0);
	$effect(() => {
		today = data.todaySeconds;
		if (!data.counting) return;
		const clock = new PracticeClock(Date.now());
		const account = data.user?.email ?? '';
		const file = data.file;
		let stopped = false;
		const visible = () => document.visibilityState === 'visible';
		// Time kept on this device from an earlier opening goes first.
		if (account) void sendQueuedPractice(account);
		// Time that can't be sent now waits on the device and goes later (#304), not lost.
		const keep = (seconds: number) => account && queuePractice(account, file, seconds);
		const send = (keepalive = false) => {
			const seconds = clock.take();
			if (!seconds || stopped) return;
			today += seconds;
			if (!navigator.onLine) return void keep(seconds);
			fetch('/api/ueben', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ file, seconds }),
				keepalive
			})
				.then((response) => {
					const result = outcome(response.status);
					// Turned off meanwhile (here or on another device), or not a part of their instrument.
					if (result === 'refused') {
						stopped = true;
						status = 'stopped';
					} else if (result === 'retry') keep(seconds);
					else if (account) void sendQueuedPractice(account);
				})
				.catch(() => keep(seconds));
		};
		const update = () => {
			const now = Date.now();
			status = stopped ? 'stopped' : clock.full() ? 'full' : clock.inGrace(now) ? 'idle' : clock.idle(now) ? 'paused' : 'counting';
		};
		const tick = () => {
			clock.tick(Date.now(), visible());
			update();
		};
		// A touch, scroll or key; back from a pause within the grace, the pause counts too (#304).
		const active = () => {
			clock.activity(Date.now());
			update();
		};
		resume = active;
		const hidden = () => {
			tick();
			if (!visible()) send(true);
		};
		const ticker = setInterval(tick, 5000);
		const reporter = setInterval(() => send(), BEAT_SECONDS * 1000);
		const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
		// Capturing, so scrolling the page inside the viewer counts too, not only the window.
		for (const name of events) addEventListener(name, active, { passive: true, capture: true });
		document.addEventListener('visibilitychange', hidden);
		addEventListener('pagehide', hidden);
		return () => {
			tick();
			send(true);
			clearInterval(ticker);
			clearInterval(reporter);
			for (const name of events) removeEventListener(name, active, { capture: true });
			resume = () => {};
			document.removeEventListener('visibilitychange', hidden);
			removeEventListener('pagehide', hidden);
		};
	});

	// The screen stays on while the part is open, where the browser allows it.
	$effect(() => {
		type Lock = { release: () => Promise<void> };
		const wake = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Lock> } }).wakeLock;
		if (!wake) return;
		let lock: Lock | null = null;
		const take = () => {
			if (document.visibilityState === 'visible') wake.request('screen').then((next) => (lock = next), () => {});
		};
		take();
		document.addEventListener('visibilitychange', take);
		return () => {
			document.removeEventListener('visibilitychange', take);
			lock?.release().catch(() => {});
		};
	});
</script>

<Title title={t.practice.viewer.title(data.part, data.piece.title)} />

<div class="head">
	<a class="back" href={data.own ? '/meine-noten' : `/stuecke/${encodeURIComponent(data.piece.id)}`}><Icon name="back" size={16} />{data.own ? t.practice.viewer.back : data.piece.title}</a>
	<div class="what">
		<strong>{data.part}</strong>
		<span>{data.piece.title}{data.piece.composer ? ` · ${data.piece.composer}` : ''}</span>
	</div>
	{#if data.canReport}
		<button type="button" class="btn ghost small report" onclick={() => (reporting = true)}><Icon name="flag" size={16} />{t.reports.report}</button>
	{/if}
	{#if data.counting}
		<p class="clock {status}" role="status">
			<Icon name="clock" size={16} />
			{#if status === 'counting'}
				<span>{t.practice.viewer.counting} · {t.practice.viewer.today(t.practice.duration(today))}</span>
			{:else if status === 'idle'}
				<button type="button" class="still" onclick={() => resume()}>{t.practice.viewer.idle}</button>
			{:else}
				<span>{t.practice.viewer[status]}</span>
			{/if}
		</p>
	{:else if data.own}
		<p class="clock off"><Icon name="clock" size={16} /><span>{t.practice.viewer.notCounting} <a href="/profil#probenzeit">{t.practice.viewer.turnOn}</a></span></p>
	{/if}
</div>

{#snippet toolPanel(tool: string)}
	<PracticeTools tool={tool === 'recording' ? 'recording' : 'tools'} recording={data.recording} />
{/snippet}

<PracticeScore file={data.file} marks={data.marks} offers={data.offers} sharedAt={data.sharedAt} share={data.own} {tools} panel={toolPanel} popOut={canPopOut ? popOut : undefined} bind:page />

{#if data.canReport}
	<QuickReport pieceId={data.piece.id} fileId={data.file} part={data.part} {page} reports={data.reports} bind:open={reporting} />
{/if}

<p class="elsewhere"><a href={data.elsewhere} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} />{t.practice.viewer.elsewhere}</a></p>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		margin-bottom: var(--space-3);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent);
		font-weight: 600;
	}

	.what {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.what strong {
		font-size: var(--text-lg);
	}

	.what span {
		overflow: hidden;
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.clock {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	/* Paused, but a tap still counts the pause (#304): asked plainly, not greyed out. */
	.clock.idle {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.still {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.clock.paused,
	.clock.full,
	.clock.stopped,
	.clock.off {
		background: color-mix(in oklab, var(--text-muted) 14%, transparent);
		color: var(--text-muted);
	}

	.clock.off {
		font-weight: 400;
	}

	.clock a {
		color: var(--accent);
		font-weight: 600;
	}

	.elsewhere a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.elsewhere {
		margin-top: var(--space-3);
	}
</style>

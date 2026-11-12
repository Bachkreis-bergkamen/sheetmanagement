<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { t } from '#lib/i18n/index.ts';
	import { Copier } from '#lib/clipboard.svelte.ts';
	import type { InstallPlatform } from '#lib/install/install.ts';
	import { install, promptInstall } from '#lib/install/state.svelte.ts';
	import Icon from './Icon.svelte';
	import InstallScene, { type InstallSceneName } from './InstallScene.svelte';
	import Segmented from './Segmented.svelte';

	/**
	 * Putting the app on the home screen (#279), for this device: the browser's own dialog where
	 * it has one, otherwise one instruction at a time with a drawing of where to tap. "Geschafft!"
	 * only once the browser says it's installed; going through the steps ends on "look at your
	 * home screen" instead, since nothing here can see it.
	 */
	let { name, logo }: { name: string; logo: string } = $props();

	const device = $derived(install.device);
	let chosen = $state<InstallPlatform | null>(null);
	const platform = $derived(chosen ?? device?.platform ?? 'ios');
	const here = $derived(device?.platform === platform);

	type Flow = { steps: { title: string; body: string }[]; scenes: InstallSceneName[] };
	const flow = $derived.by<Flow | null>(() => {
		if (platform === 'ios')
			return here && device?.safariMenu
				? { steps: t.install.steps.iosMenu, scenes: ['ios-dots', 'ios-menu-share', 'ios-sheet', 'ios-add'] }
				: { steps: t.install.steps.ios, scenes: ['ios-share', 'ios-sheet', 'ios-add'] };
		if (platform === 'android') return { steps: t.install.steps.android, scenes: ['android-menu', 'android-install', 'android-confirm'] };
		if (here && device?.browser === 'firefox') return null;
		return here && device?.browser === 'safari'
			? { steps: t.install.steps.mac, scenes: ['mac-file', 'mac-dock'] }
			: { steps: t.install.steps.desktop, scenes: ['desktop-bar', 'desktop-confirm'] };
	});

	/** The browser's own dialog, on the device it's for. */
	const oneTap = $derived(!!install.prompt && here);
	let manual = $state(false);
	let step = $state(0);
	let finished = $state(false);
	let heading = $state<HTMLElement>();
	/** Installed while this page was open: the browser said so. */
	let justNow = $state(false);
	let again = $state(false);

	async function show(next: number) {
		step = next;
		await tick();
		heading?.focus({ preventScroll: true });
	}

	function choose(next: InstallPlatform) {
		chosen = next;
		step = 0;
		finished = false;
		manual = false;
	}

	async function installNow() {
		if ((await promptInstall()) === 'accepted') justNow = true;
	}

	// Without a clipboard the address bar has it too.
	const copier = new Copier();

	const success = $derived(!again && (install.standalone || justNow || install.installed));
</script>

<div class="guide">
	{#if install.standalone}
		<section class="ui-card result" aria-live="polite">
			<InstallScene scene="home" {logo} />
			<h2><Icon name="check" size={20} />{t.install.standalone.title}</h2>
			<p>{t.install.standalone.body}</p>
			<a class="btn" href="/">{t.install.open}<Icon name="chevron" size={16} /></a>
		</section>
	{:else if success}
		<section class="ui-card result" aria-live="polite">
			<InstallScene scene="home" {logo} />
			<h2><Icon name="check" size={20} />{t.install.done.title}</h2>
			<p>{t.install.done.body(name)}</p>
			<div class="row">
				<a class="btn" href="/">{t.install.open}<Icon name="chevron" size={16} /></a>
				<button class="btn ghost" onclick={() => (again = true)}>{t.install.restart}</button>
			</div>
		</section>
	{:else}
		<div class="device">
			<span class="ui-label" id="install-device">{t.install.device}</span>
			<Segmented
				label={t.install.device}
				value={platform}
				onchange={choose}
				options={[
					{ value: 'ios', label: t.install.platforms.ios },
					{ value: 'android', label: t.install.platforms.android },
					{ value: 'desktop', label: t.install.platforms.desktop }
				]}
			/>
		</div>

		<!-- Where this browser can't do it, say so first, with the way out. -->
		{#if here && platform === 'ios' && device?.browser !== 'safari'}
			<div class="msg info note">
				<p>{t.install.notSafari}</p>
				<button class="btn small secondary" onclick={() => copier.copy(`${location.origin}/install`)}><Icon name={copier.copied ? 'check' : 'link'} size={14} />{copier.copied ? t.install.copied : t.install.copyLink}</button>
			</div>
		{:else if here && platform === 'android' && device?.browser === 'samsung'}
			<p class="msg info">{t.install.samsung}</p>
		{:else if here && platform === 'android' && device?.browser === 'other'}
			<p class="msg info">{t.install.otherAndroid}</p>
		{/if}

		{#if oneTap && !manual}
			<section class="ui-card one-tap">
				<span class="app-icon"><img src={logo} alt="" width="44" height="44" /></span>
				<h2>{t.install.oneTap.title}</h2>
				<p>{t.install.oneTap.body}</p>
				<button class="btn big" onclick={installNow}><Icon name="download" size={18} />{t.install.oneTap.button}</button>
				<button class="link" onclick={() => (manual = true)}>{t.install.oneTap.manual}</button>
			</section>
		{:else if !flow}
			<p class="msg info">{t.install.firefox}</p>
		{:else if finished}
			<section class="ui-card result" aria-live="polite">
				<InstallScene scene="home" {logo} />
				<h2 tabindex="-1" bind:this={heading}>{t.install.manualDone.title}</h2>
				<p>{t.install.manualDone.body(name)}</p>
				<div class="row">
					<button class="btn ghost" onclick={() => ((finished = false), show(0))}><Icon name="refresh" size={16} />{t.install.restart}</button>
				</div>
			</section>
		{:else}
			{@const total = flow.steps.length}
			<section class="ui-card stepper" aria-labelledby="install-step">
				{#key `${platform}-${step}`}
					<div class="picture" in:fade={{ duration: 180 }}>
						<InstallScene scene={flow.scenes[step]} {logo} />
					</div>
				{/key}
				<div class="text">
					<div class="progress">
						<span class="track" aria-hidden="true">
							{#each flow.steps as _, at (at)}<span class:on={at <= step}></span>{/each}
						</span>
						<span class="count">{t.install.step(step + 1, total)}</span>
					</div>
					<h2 id="install-step" tabindex="-1" bind:this={heading} aria-live="polite">{flow.steps[step].title}</h2>
					<p>{flow.steps[step].body}</p>
					{#if platform === 'ios' && step === 0}<p class="aside">{t.install.fromApp}</p>{/if}
				</div>
				<div class="row actions">
					{#if step > 0}
						<button class="btn ghost" onclick={() => show(step - 1)}><Icon name="back" size={16} />{t.install.back}</button>
					{/if}
					<span class="spacer"></span>
					{#if step < total - 1}
						<button class="btn" onclick={() => show(step + 1)}>{t.install.next}<Icon name="chevron" size={16} /></button>
					{:else}
						<button class="btn" onclick={() => ((finished = true), tick().then(() => heading?.focus({ preventScroll: true })))}><Icon name="check" size={16} />{t.install.finish}</button>
					{/if}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.guide {
		display: grid;
		gap: var(--space-4);
	}

	.device {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
	}

	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.note p {
		flex: 1 1 220px;
		margin: 0;
	}

	h2 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.25;
		text-wrap: balance;
	}

	h2:focus {
		outline: none;
	}

	p {
		margin: 0;
	}

	/* The drawing above, the one instruction below it, the buttons in thumb reach. */
	.stepper {
		display: grid;
		gap: var(--space-4);
		padding: 0;
		overflow: hidden;
	}

	.picture {
		padding: var(--space-5) var(--space-4) var(--space-3);
		background: var(--surface-2);
	}

	.text {
		display: grid;
		gap: var(--space-2);
		padding: 0 var(--space-5);
	}

	.text p {
		color: var(--text-muted);
		font-size: var(--text-base);
		line-height: 1.5;
	}

	.text .aside {
		margin-top: var(--space-1);
		font-size: var(--text-sm);
	}

	.actions {
		padding: 0 var(--space-5) var(--space-5);
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-1);
	}

	.track {
		display: flex;
		flex: 1;
		gap: 4px;
		max-width: 160px;
	}

	.track span {
		flex: 1;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--border);
		transition: background 0.3s var(--ease);
	}

	.track span.on {
		background: var(--accent);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.spacer {
		flex: 1;
	}

	.one-tap,
	.result {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	.one-tap p,
	.result p {
		max-width: 40ch;
		color: var(--text-muted);
	}

	.result h2 {
		justify-content: center;
	}

	.result h2 :global(svg) {
		color: var(--ok);
	}

	.app-icon {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.big {
		min-height: 48px;
		padding: 0 var(--space-5);
		font-size: var(--text-base);
	}

	.link {
		min-height: 32px;
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.link:hover {
		color: var(--text);
	}
</style>

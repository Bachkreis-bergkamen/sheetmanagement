<script lang="ts">
	import { sendPending } from '#lib/offline/marks.ts';
	import { sendQueuedPractice } from '#lib/offline/practice-queue.ts';
	import '../app.css';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { DEFAULT_LOGO, shownLogo } from '#lib/branding.ts';
	import { config, useInstrumentOverrides } from '#lib/config/index.ts';
	import { t } from '#lib/i18n/index.ts';
	import DemoBanner from '#lib/components/DemoBanner.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import SeasonMark from '#lib/components/SeasonMark.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import QuickSearch, { loadIndex } from '#lib/components/QuickSearch.svelte';
	import NavMenu from '#lib/components/NavMenu.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import Tour from '#lib/components/Tour.svelte';
	import UpdateNotice from '#lib/components/UpdateNotice.svelte';
	import WorkspaceTabs from '#lib/components/WorkspaceTabs.svelte';
	import { currentItem, inOrganiserArea, menuGroups, navGroups, ORGANISER_HUB, primaryNav, workspaceOf } from '#lib/nav.ts';
	import { orchestraLinks, safeLink } from '#lib/links.ts';
	import { versionLabel } from '#lib/version.ts';
	import { watchInstall } from '#lib/install/state.svelte.ts';

	let { data, children } = $props();

	// The orchestra's own instrument labels (#143), before any page reads the instruments.
	// svelte-ignore state_referenced_locally
	useInstrumentOverrides(data.instruments);
	$effect.pre(() => useInstrumentOverrides(data.instruments));

	const groups = $derived(navGroups({ auth: data.auth, rights: data.rights, features: data.features, polls: data.polls }));
	const nav = $derived(primaryNav(groups));
	const path = $derived(page.url.pathname);
	// The most specific entry counts: "Angaben ergänzen" lights up "Mehr", not "Archiv".
	const current = $derived(currentItem(groups, path)?.item.href);
	// The organisers' pages light up their area, "Verwaltung" (#185).
	const organising = $derived(inOrganiserArea(groups, path));
	const isCurrent = (href: string) => (href === '/' ? path === '/' : href === ORGANISER_HUB ? organising : !organising && href === current);
	// "Mehr" is highlighted on the pages only it links to.
	const inMore = $derived(!!current && !organising && !nav.some((item) => item.href === current));
	const menu = $derived(menuGroups(groups));
	const workspace = $derived(workspaceOf(groups, path));
	let menuOpen = $state(false);
	let searching = $state(false);
	// The shortcut as the keyboard says it: ⌘K on a Mac, Strg K elsewhere.
	let mac = $state(false);
	$effect(() => {
		mac = /Mac|iPhone|iPad/.test(navigator.platform);
	});

	const links = $derived(orchestraLinks(data.links));
	const sourceUrl = safeLink(config.sourceUrl ?? '');

	afterNavigate(({ to }) => {
		menuOpen = false;
		// How often each page is opened, for the page audit (#185): the route pattern only
		// ("/stuecke/[id]"), counted per day and role on the server, never per person.
		// On the first load the navigation may not carry the route yet; the page state does.
		const route = to?.route.id ?? page.route.id;
		if (route && navigator.onLine) navigator.sendBeacon?.('/api/seitenaufruf', route);
	});

	// Whether the app is on the home screen, and the browser's own install dialog where it has one (#279).
	$effect(() => watchInstall());

	// Buttons and forms work from here on; the end-to-end tests wait for it (#142).
	$effect(() => {
		document.documentElement.dataset.app = 'ready';
	});

	// The music table and the pieces' pages kept offline for a signed-in member (#62); the worker
	// does it at most once a day, and not on a connection that saves data.
	$effect(() => {
		if (!data.features.offline || data.auth !== 'on' || !data.user || !('serviceWorker' in navigator)) return;
		if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
		// Not while the page itself loads: a little later, when the device is idle (#303).
		const later = setTimeout(() => {
			navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage('warm')).catch(() => {});
		}, 15_000);
		return () => clearTimeout(later);
	});

	// Pen marks drawn without a connection go to the server once the device is online again, on any page.
	$effect(() => {
		if (data.auth !== 'on' || !data.user) return;
		const account = data.user.email;
		// Practice time kept on the device goes along (#304).
		const send = () => void Promise.all([sendPending(), sendQueuedPractice(account)]);
		send();
		addEventListener('online', send);
		return () => removeEventListener('online', send);
	});

	// Pages cross-fade like in an app (#129): the browser animates between the old and the new
	// page once its data is there, header and tab bar stay put. Without View Transitions the
	// new page fades in (see .page). Filters and forms on the same page don't animate.
	// A hidden tab (phone locked, app in the background) has nothing to animate: the browser would
	// abort the transition and reject its `ready` promise with an InvalidStateError, which then
	// landed in the error log. So skip it there, and swallow the rejection when it aborts anyway.
	onNavigate((navigation) => {
		if (!document.startViewTransition || document.hidden || navigation.from?.url.pathname === navigation.to?.url.pathname) return;
		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.ready.catch(() => {});
			// If the browser skips the transition before running the callback, don't hold up the navigation.
			transition.updateCallbackDone.catch(() => {}).finally(() => resolve());
			transition.finished.catch(() => {});
		});
	});

	// Offline in the rehearsal hall (#62): pages come from the service worker's cache, so say so.
	let online = $state(true);
	$effect(() => {
		const update = () => (online = navigator.onLine);
		update();
		addEventListener('online', update);
		addEventListener('offline', update);
		return () => {
			removeEventListener('online', update);
			removeEventListener('offline', update);
		};
	});

	// A thin bar while the next page loads. Shown only after a moment, so quick
	// navigations don't flicker; a slow Google answer no longer looks like a dead click.
	let loading = $state(false);
	$effect(() => {
		if (!navigating.to) {
			loading = false;
			return;
		}
		const timer = setTimeout(() => (loading = true), 150);
		return () => clearTimeout(timer);
	});
</script>

<svelte:head>
	<meta name="theme-color" content={data.brand.colour} />
	{#if data.logo !== shownLogo(DEFAULT_LOGO)}<link rel="icon" href={data.logo} />{/if}
	<!-- On :root, so the theme tokens in app.css derive from it. -->
	{@html `<style>${data.brand.style}
	/* The season's drawing at the foot of every page, small and faint (#202). */
	.season-mark {
		display: flex;
		justify-content: center;
		margin-top: var(--space-3);
		color: color-mix(in oklab, var(--accent) 60%, transparent);
	}
</style>`}
</svelte:head>

<div class="app">
	<a class="skip" href="#inhalt">{t.nav.skip}</a>
	<!-- Early in the page, so the keyboard reaches the tour's card right after the skip link. -->
	<Tour status={data.tour} account={data.auth === 'on' && !!data.user} name={data.user?.name ?? ''} logo={data.logo} bold={data.brand.look === 'bold'} />
	{#if loading}
		<div class="progress" role="progressbar" aria-label={t.common.loading}></div>
	{/if}
	{#if data.demo}<DemoBanner role={data.demo.role} />{/if}
	{#if !online}<p class="offline no-print" role="status"><Icon name="alert" size={16} />{t.pwa.offline}</p>{/if}
	<header class="topbar">
		<div class="topbar-inner">
			<!-- Named by what it shows (the full name, or the short one on phones), so voice control finds it. -->
			<a href="/" class="brand" title={data.orchestraName}>
				<img class="logo" src={data.logo} alt="" width="40" height="40" />
				<span class="brand-full">{data.orchestraName}</span>
				<span class="brand-short">{data.orchestraShortName} <span class="app-name">{t.nav.appName}</span></span>
			</a>
			{#if data.beta}<span class="beta" title={t.nav.betaNote} aria-label={t.nav.betaNote}>{t.nav.beta}</span>{/if}

			<nav class="nav-desktop" aria-label={t.nav.main}>
				{#each nav as item (item.href)}
					<a href={item.href} class:active={isCurrent(item.href)} aria-current={isCurrent(item.href) ? 'page' : undefined} data-tour={item.href}>
						{item.label}
					</a>
				{/each}
				<button
					class="more"
					class:active={inMore || menuOpen}
					aria-expanded={menuOpen}
					aria-controls="nav-menu"
					data-tour="more"
					onclick={() => (menuOpen = !menuOpen)}
				>
					{t.nav.more}<Icon name="down" size={16} />
				</button>
			</nav>

			{#if groups.length}
				<button class="search" onclick={() => (searching = true)} onpointerenter={loadIndex} onfocus={loadIndex} data-shortcut={mac ? '⌘K' : t.quickSearch.shortcut}>
					<Icon name="search" size={18} /><span class="search-label">{t.quickSearch.open}</span>
				</button>
			{/if}

			<!-- Signing out and the colour scheme live in "Mehr" and on the profile. -->
			{#if data.user}
				<a
					class="avatar"
					href="/profil"
					class:active={path === '/profil'}
					title="{t.profile.title} · {t.auth.signedInAs(data.user.email)}"
					aria-label={t.profile.title}
				>
					<Avatar name={data.user.name} instrument={data.user.instrument} size={34} />
				</a>
			{/if}
		</div>
	</header>

	<main id="inhalt" tabindex="-1">
		<!-- Outside the page's animation: the tabs stay put while switching between the workspace's pages. -->
		{#if workspace}<WorkspaceTabs group={workspace} {current} counts={data.counts} />{/if}
		{#key path}
			<div class="page">
				{@render children()}
			</div>
		{/key}
		<footer class="footer">
			{#if links.length}
				<ul class="links" aria-label={t.footer.links}>
					{#each links as link (link.url)}
						<li>
							<a href={link.url} target="_blank" rel="noopener noreferrer" title={link.label}>
								<Icon name={link.icon} size={18} /><span>{link.label}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="legal">
				<a href="/datenschutz">{t.legal.links.privacy}</a>
				<a href="/nutzungsbedingungen">{t.legal.links.terms}</a>
			</div>
			{#if sourceUrl}
				<p class="source">
					{t.nav.appName} {versionLabel()} · <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{t.footer.source}</a>
				</p>
			{/if}
			<span class="season-mark"><SeasonMark variant="pair" size={22} /></span>
		</footer>
	</main>

	<nav class="tabbar" aria-label={t.nav.main}>
		{#each nav as item (item.href)}
			<a href={item.href} class:active={isCurrent(item.href)} aria-current={isCurrent(item.href) ? 'page' : undefined} data-tour={item.href}>
				<span class="pill"><Icon name={item.icon} size={22} fill={isCurrent(item.href)} /></span>
				<span class="label">{item.label}</span>
			</a>
		{/each}
		<button class:active={inMore || menuOpen} aria-expanded={menuOpen} aria-controls="nav-menu" data-tour="more" onclick={() => (menuOpen = !menuOpen)}>
			<span class="pill"><Icon name="menu" size={22} fill={inMore || menuOpen} /></span>
			<span class="label">{t.nav.more}</span>
		</button>
	</nav>

	<NavMenu groups={menu} current={organising ? ORGANISER_HUB : current} user={data.user ?? null} bind:open={menuOpen} />
	{#if groups.length}<QuickSearch {groups} bind:open={searching} />{/if}
	<Toast />
	<UpdateNotice />
</div>

<style>
	/* For keyboards: the first Tab shows it, Enter skips the navigation. */
	.skip {
		position: fixed;
		top: var(--space-2);
		left: var(--space-2);
		z-index: 80;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 650;
		transform: translateY(-200%);
		transition: transform var(--fast) var(--ease);
	}

	.skip:focus {
		transform: none;
	}

	main:focus {
		outline: none;
	}

	.offline {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: color-mix(in oklab, var(--warn) 16%, var(--surface));
		font-size: var(--text-sm);
		text-align: center;
	}

	.progress {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 70;
		width: 100%;
		height: 3px;
		background: var(--accent);
		transform-origin: left;
		animation: progress 8s cubic-bezier(0.1, 0.7, 0.2, 1) forwards;
	}
	@keyframes progress {
		from {
			transform: scaleX(0.05);
		}
		to {
			transform: scaleX(0.92);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.progress {
			animation: none;
			transform: scaleX(0.6);
		}
	}

	.app {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		view-transition-name: topbar;
		height: var(--header-height);
		background: color-mix(in oklab, var(--bg) 78%, transparent);
		backdrop-filter: saturate(1.6) blur(20px);
		-webkit-backdrop-filter: saturate(1.6) blur(20px);
		border-bottom: 1px solid var(--hairline);
	}

	.topbar-inner {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		max-width: var(--content-width);
		height: 100%;
		margin: 0 auto;
		padding: 0 var(--space-4);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-weight: 650;
		min-width: 0;
	}

	.brand-full {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.brand-short {
		display: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Every page of the live app says it's a preview, until RELEASE is set. */
	.beta {
		flex: none;
		padding: 3px 10px;
		border-radius: var(--radius-pill);
		background: var(--warn);
		color: var(--surface);
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1.4;
		cursor: help;
	}

	.app-name {
		color: var(--accent);
		font-weight: 500;
	}

	.logo {
		flex: none;
		width: 36px;
		height: 36px;
	}

	.nav-desktop {
		display: flex;
		gap: var(--space-1);
		margin-left: auto;
	}

	.nav-desktop a,
	.nav-desktop .more {
		padding: var(--space-2) var(--space-3);
		white-space: nowrap;
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--text-md);
		font-weight: 500;
		transition:
			color var(--fast) var(--ease),
			background var(--fast) var(--ease);
	}

	.nav-desktop .more {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		border: 0;
		background: none;
		font: inherit;
		cursor: pointer;
	}

	.nav-desktop a:hover,
	.nav-desktop .more:hover {
		color: var(--text);
		background: var(--surface-2);
	}

	.nav-desktop a.active,
	.nav-desktop .more.active {
		color: var(--accent);
		background: var(--accent-soft);
	}

	/* Looks like a field on wide screens, so it's clear you can type; an icon on narrow ones. */
	.search {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		flex: none;
		height: 36px;
		margin-left: var(--space-2);
		padding: 0 6px 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			border-color var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	.search:hover {
		border-color: color-mix(in oklab, var(--accent) 50%, var(--border));
		color: var(--text);
	}

	/* Decoration only: the button is called "Suchen", the shortcut isn't part of its name. */
	.search::after {
		content: attr(data-shortcut) / '';
		padding: 1px 6px;
		border-radius: var(--radius-pill);
		background: var(--bg);
		font: inherit;
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	main {
		flex: 1;
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: var(--space-6) var(--space-4) var(--space-7);
	}

	.page {
		display: flow-root;
	}

	/* Browsers without View Transitions: the new page fades in. */
	@supports not (view-transition-name: none) {
		.page {
			animation: page-in 0.2s var(--ease);
		}
	}

	@keyframes page-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	.tabbar {
		display: none;
	}

	/* Five menu items and the account leave no room for the name: the logo alone links home.
	   Below 720px the menu moves to the bottom bar and the short name comes back. */
	@media (max-width: 960px) {
		.brand-full {
			display: none;
		}

		.nav-desktop a,
		.nav-desktop .more {
			padding: var(--space-2) 10px;
		}

		.search {
			justify-content: center;
			width: 36px;
			padding: 0;
		}

		.search::after {
			display: none;
		}

		/* Still the button's name, only not shown. */
		.search-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}

	@media (max-width: 720px) {
		.nav-desktop {
			display: none;
		}

		.search {
			margin-left: auto;
		}

		.topbar-inner {
			justify-content: space-between;
		}

		/* Beside the name, not floating between it and the buttons. */
		.beta {
			margin-right: auto;
			margin-left: calc(-1 * var(--space-2));
		}

		.brand-full {
			display: none;
		}

		.brand-short {
			display: inline;
		}

		main {
			padding-top: var(--space-5);
			padding-bottom: calc(var(--tabbar-height) + var(--space-6) + env(safe-area-inset-bottom));
		}

		.tabbar {
			position: fixed;
			inset: auto 0 0 0;
			z-index: 10;
			isolation: isolate;
			view-transition-name: tabbar;
			display: grid;
			/* Home, the primary pages and "Mehr": five columns for everyone. */
			grid-auto-flow: column;
			grid-auto-columns: 1fr;
			height: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
			padding-bottom: env(safe-area-inset-bottom);
			background: color-mix(in oklab, var(--bg) 94%, transparent);
			backdrop-filter: saturate(1.6) blur(20px);
			-webkit-backdrop-filter: saturate(1.6) blur(20px);
			border-top: 1px solid var(--hairline);
		}

		.tabbar a,
		.tabbar button {
			min-width: 0;
			border: 0;
			background: none;
			font-family: inherit;
			cursor: pointer;
			display: grid;
			place-items: center;
			align-content: center;
			gap: 2px;
			/* The readable floor, held there with "Schriftgröße" so five labels still fit side by side. */
			font-size: min(var(--text-2xs), 12px);
			font-weight: 500;
			color: var(--text-muted);
			transition:
				color var(--fast) var(--ease),
				transform var(--fast) var(--ease);
		}

		.tabbar a:active,
		.tabbar button:active {
			transform: scale(0.94);
		}

		.tabbar .label {
			max-width: 100%;
			padding: 0 2px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		/* The current tab's icon sits on a soft pill that grows in, like a native tab bar. */
		.tabbar .pill {
			position: relative;
			display: grid;
			place-items: center;
			width: 56px;
			height: 30px;
		}

		.tabbar .pill::before {
			content: '';
			position: absolute;
			inset: 0;
			z-index: -1;
			border-radius: var(--radius-pill);
			background: var(--accent-soft);
			opacity: 0;
			transform: scaleX(0.5);
			transition:
				opacity var(--fast) var(--ease),
				transform 0.25s var(--ease);
		}

		.tabbar a.active,
		.tabbar button.active {
			color: var(--accent);
		}

		.tabbar a.active .label,
		.tabbar button.active .label {
			font-weight: 650;
		}

		.tabbar .active .pill::before {
			opacity: 1;
			transform: none;
		}
	}
	.footer {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: 1px solid var(--hairline);
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.links a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.legal {
		display: flex;
		justify-content: center;
		gap: var(--space-4);
	}

	.footer a {
		color: var(--text-muted);
	}

	.footer a:hover {
		color: var(--accent);
	}

	.avatar {
		display: grid;
		flex: none;
		margin-left: var(--space-1);
		border-radius: var(--radius-pill);
		transition: box-shadow var(--fast) var(--ease);
	}

	.avatar:hover,
	.avatar.active {
		box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent);
	}
</style>

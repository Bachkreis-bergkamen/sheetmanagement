<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { t } from '#lib/i18n/index.ts';
	import type { NavGroup } from '#lib/nav.ts';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import TextSize from './TextSize.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	/**
	 * Every page by group: a panel below the header on wide screens, a sheet above the tab bar
	 * on phones. Below the pages: who is signed in, the colour scheme and signing out.
	 */
	let {
		groups,
		current,
		user,
		open = $bindable(false)
	}: {
		groups: NavGroup[];
		/** The current page's entry, the most specific one. */
		current: string | undefined;
		user: { name: string; email: string; instrument?: string } | null;
		open?: boolean;
	} = $props();

	// The account below links to the profile already: the groups leave out their own entry then.
	const shown = $derived(
		user ? groups.map((group) => ({ ...group, items: group.items.filter((item) => item.href !== '/profil') })).filter((group) => group.items.length) : groups
	);

	function onkeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') open = false;
	}

	/**
	 * Keyboard and screen readers (#141): focus moves into the menu, Tab stays inside it, and
	 * closing returns focus to the button that opened it.
	 */
	function trap(panel: HTMLElement) {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		// Only what is shown: on phones the tab bar's pages are hidden here.
		const focusable = () =>
			[...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select')].filter((item) => item.checkVisibility());
		(focusable().find((item) => item.getAttribute('aria-current') === 'page') ?? focusable()[0])?.focus({ preventScroll: true });
		const keep = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') return;
			const items = focusable();
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		panel.addEventListener('keydown', keep);
		return {
			destroy() {
				panel.removeEventListener('keydown', keep);
				// Only back to the opener when focus would otherwise be lost (not after following a link).
				if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) opener.focus({ preventScroll: true });
			}
		};
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<button class="backdrop" tabindex="-1" aria-label={t.nav.close} onclick={() => (open = false)} transition:fade={{ duration: 150 }}></button>
	<div class="panel" id="nav-menu" role="dialog" aria-modal="true" aria-label={t.nav.menu} use:trap transition:fly={{ y: 10, duration: 200, opacity: 0 }}>
		<div class="groups">
			{#each shown as group (group.key)}
				<!-- On phones the tab bar has the primary pages: the sheet lists only the others. -->
				<section class:in-tabbar={group.items.every((item) => item.primary)}>
					<h2>{group.label}</h2>
					<ul>
						{#each group.items as item (item.href)}
							<li class:in-tabbar={item.primary}>
								<a
									href={item.href}
									class:active={item.href === current}
									aria-current={item.href === current ? 'page' : undefined}
									onclick={() => (open = false)}
								>
									<span class="icon"><Icon name={item.icon} size={18} /></span>{item.label}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>

		<div class="account">
			{#if user}
				<a class="who" href="/profil" class:active={current === '/profil'} aria-current={current === '/profil' ? 'page' : undefined} onclick={() => (open = false)}>
					<Avatar name={user.name} instrument={user.instrument} />
					<span class="who-text">
						<strong>{user.name}</strong>
						<span>{user.email}</span>
					</span>
				</a>
			{/if}
			<div class="settings">
				<ThemeToggle wide />
				<TextSize wide />
				{#if user}
					<form method="POST" action="/auth/logout">
						<button class="logout"><Icon name="logout" size={16} />{t.auth.logout}</button>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		border: 0;
		background: var(--scrim);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
		cursor: default;
	}

	.panel {
		position: fixed;
		z-index: 21;
		top: calc(var(--header-height) + var(--space-2));
		right: max(var(--space-4), calc((100vw - var(--content-width)) / 2 + var(--space-4)));
		display: grid;
		gap: var(--space-4);
		width: min(500px, calc(100vw - 2 * var(--space-4)));
		max-height: calc(100dvh - var(--header-height) - var(--space-5));
		padding: var(--space-5);
		overflow-y: auto;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
	}

	.groups {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4) var(--space-5);
	}

	h2 {
		margin-bottom: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-2xs);
		font-weight: 650;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: 40px;
		padding: var(--space-1) var(--space-2);
		margin: 0 calc(-1 * var(--space-2));
		border-radius: var(--radius-control);
		font-weight: 500;
		transition: background var(--fast) var(--ease);
	}

	.icon {
		display: grid;
		place-items: center;
		color: var(--text-muted);
	}

	a:hover {
		background: var(--surface-2);
	}

	a.active {
		color: var(--accent);
		background: var(--accent-soft);
	}

	a.active .icon {
		color: inherit;
	}

	.account {
		display: grid;
		gap: var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
	}

	.who {
		margin: 0;
		padding: var(--space-2);
	}

	.who-text {
		display: grid;
		min-width: 0;
		line-height: 1.3;
	}

	.who-text span {
		overflow: hidden;
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The colour scheme across the whole menu, signing out below it. */
	.settings {
		display: grid;
		justify-items: start;
		gap: var(--space-2);
	}

	.logout {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.logout:hover {
		background: var(--surface-2);
		color: var(--danger);
	}

	@media (max-width: 720px) {
		.panel {
			top: auto;
			right: var(--space-2);
			left: var(--space-2);
			bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom) + var(--space-2));
			width: auto;
			max-height: calc(100dvh - var(--tabbar-height) - var(--header-height));
			padding: var(--space-4);
		}

		.groups {
			gap: var(--space-4);
		}

		.in-tabbar {
			display: none;
		}
	}
</style>

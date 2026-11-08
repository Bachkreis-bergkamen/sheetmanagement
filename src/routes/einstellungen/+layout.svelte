<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import { isActive, settingsSections } from '#lib/nav.ts';
	import Icon from '#lib/components/Icon.svelte';

	/**
	 * Every setting in one place (#185): the orchestra's look and features, the sheet and the
	 * data, and the status, as sections of one page. Each section keeps its own address, so a
	 * notification or a bookmark opens the right one.
	 */
	let { data, children } = $props();

	const sections = $derived(settingsSections({ auth: data.auth, rights: data.rights }));
	// The most specific section: "/einstellungen/status" is the status, not the orchestra.
	const current = $derived(
		sections
			.filter((section) => isActive(section.href, page.url.pathname))
			.sort((a, b) => b.href.length - a.href.length)[0]?.href
	);
</script>

{#if sections.length > 1}
	<nav class="sections no-print" aria-label={t.settings.sections.label}>
		{#each sections as section (section.href)}
			<a href={section.href} class:active={section.href === current} aria-current={section.href === current ? 'page' : undefined}>
				<Icon name={section.icon} size={16} />{section.label}
			</a>
		{/each}
	</nav>
{/if}

{@render children()}

<style>
	/* Like the segmented control: a grey track, the current section raised on it. */
	.sections {
		display: flex;
		gap: var(--space-1);
		width: fit-content;
		max-width: 100%;
		margin-bottom: var(--space-5);
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.sections::-webkit-scrollbar {
		display: none;
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		padding: 0 var(--space-3);
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		transition:
			background var(--fast) var(--ease),
			color var(--fast) var(--ease);
	}

	a:hover {
		color: var(--text);
	}

	a.active {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
	}

	/* On phones the sections share the width, so all of them show without scrolling. */
	@media (max-width: 480px) {
		.sections {
			width: 100%;
		}

		a {
			flex: 1 1 auto;
			justify-content: center;
			gap: var(--space-1);
			padding: 0 var(--space-2);
		}
	}
</style>

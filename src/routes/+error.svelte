<script lang="ts">
	import { page } from '$app/state';
	import * as t from '#lib/i18n/texts.ts';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Title from '#lib/components/Title.svelte';

	// 503: Google didn't answer in time. Usually gone a moment later, so offer to try again.
	const unavailable = $derived(page.status === 503);
	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? t.error.notFound : unavailable ? t.error.unavailableTitle : t.error.title);

	/** A missing page is mostly an old link: the places a member usually wanted instead. */
	const places: { href: string; label: string; icon: IconName }[] = [
		{ href: '/meine-noten', label: t.nav.myParts, icon: 'parts' },
		{ href: '/kalender', label: t.nav.concerts, icon: 'calendar' },
		{ href: '/stuecke', label: t.nav.pieces, icon: 'music' }
	];
</script>

<Title {title} />

<PageHeader {title} lead={notFound ? t.error.notFoundLead : page.error?.message} />

{#if notFound}
	<ul class="ui-list places">
		{#each places as place (place.href)}
			<li>
				<a href={place.href}>
					<span class="badge"><Icon name={place.icon} size={20} /></span>
					<span class="label">{place.label}</span>
					<Icon name="chevron" size={16} />
				</a>
			</li>
		{/each}
	</ul>
{/if}

<div class="actions">
	{#if unavailable}
		<button type="button" class="btn" onclick={() => location.reload()}><Icon name="refresh" size={16} />{t.error.retry}</button>
		<a class="btn ghost" href="/">{t.common.backHome}</a>
	{:else}
		<a class="btn" class:ghost={notFound} href="/"><Icon name="home" size={16} />{t.common.backHome}</a>
	{/if}
</div>

<style>
	.places {
		max-width: 32rem;
		margin-bottom: var(--space-5);
	}

	.places a {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--tap);
		padding: var(--space-3) var(--space-4);
		color: var(--text-muted);
		transition: background var(--fast) var(--ease);
	}

	.places a:hover {
		background: var(--surface-2);
	}

	.badge {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.label {
		flex: 1;
		color: var(--text);
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>

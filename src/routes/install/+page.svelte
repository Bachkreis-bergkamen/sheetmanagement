<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import InstallGuide from '#lib/components/InstallGuide.svelte';
	import Title from '#lib/components/Title.svelte';

	/**
	 * The app on the home screen (#279): why, and how on this device. Open without signing in, so
	 * the link can go round the orchestra's chat before anyone has an account.
	 */
	let { data } = $props();
	const name = $derived(data.orchestraShortName);
	const benefits: { key: keyof typeof t.install.benefits; icon: IconName }[] = [
		{ key: 'parts', icon: 'parts' },
		{ key: 'offline', icon: 'download' },
		{ key: 'reminders', icon: 'bell' }
	];
</script>

<Title title={t.install.pageTitle} />
<svelte:head>
	<!-- The preview in WhatsApp and other chats. -->
	<meta name="description" content={t.install.shareDescription} />
	<meta property="og:title" content={t.install.title(name)} />
	<meta property="og:description" content={t.install.shareDescription} />
	<meta property="og:image" content={new URL(data.logo, page.url.origin).href} />
	<meta property="og:url" content={page.url.href} />
</svelte:head>

<div class="install">
	<header class="intro">
		<span class="app-icon" aria-hidden="true"><img src={data.logo} alt="" width="56" height="56" /></span>
		<h1>{t.install.title(name)}</h1>
		<p class="lead">{t.install.lead(name)}</p>
	</header>

	<ul class="benefits">
		{#each benefits as benefit (benefit.key)}
			<li>
				<span class="mark" aria-hidden="true"><Icon name={benefit.icon} size={18} /></span>
				<span><strong>{t.install.benefits[benefit.key].title}</strong>{t.install.benefits[benefit.key].body}</span>
			</li>
		{/each}
	</ul>

	<InstallGuide {name} logo={data.logo} />
</div>

<style>
	.install {
		display: grid;
		gap: var(--space-6);
		max-width: 560px;
		margin: 0 auto;
	}

	.intro {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	/* The icon as it will sit on the home screen. */
	.app-icon {
		display: grid;
		place-items: center;
		width: 88px;
		height: 88px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-l);
		background: var(--surface);
		box-shadow: var(--shadow-raised);
	}

	h1 {
		margin: var(--space-2) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-display);
		line-height: 1.1;
		text-wrap: balance;
	}

	.lead {
		max-width: 38ch;
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-lg);
		line-height: 1.5;
	}

	.benefits {
		display: grid;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.benefits li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.benefits li > span:last-child {
		display: grid;
		gap: 2px;
		color: var(--text-muted);
		font-size: var(--text-md);
	}

	.benefits strong {
		color: var(--text);
		font-size: var(--text-base);
		font-weight: 600;
	}

	.mark {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-control);
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>

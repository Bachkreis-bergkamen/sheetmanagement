<script lang="ts">
	import { enhance } from '$app/forms';
	import * as t from '#lib/i18n/texts.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const requested = $derived(data.requested || form?.requested);
</script>

<Title title={t.access.title} />

<section class="card">
	<span class="logo"><Icon name="user" size={28} /></span>
	<h1>{t.access.hello(data.user.name)}</h1>
	<p>{t.access.lead}</p>
	<p class="small">{t.auth.signedInAs(data.user.email)}</p>

	{#if requested}
		<p class="ok" role="status"><Icon name="check" size={18} />{t.access.requested}</p>
	{:else if !data.canRequest || form?.failed}
		<p class="error" role="alert">{t.access.unavailable}</p>
	{:else}
		<form class="request" method="POST" use:enhance>
			<label>
				{t.access.nameLabel}
				<input name="name" value={form?.name ?? data.user.name} required maxlength="120" autocomplete="name" />
			</label>
			{#if form?.nameError}<p class="error" role="alert">{form.nameError}</p>{/if}
			<button class="button">{t.access.request}</button>
		</form>
	{/if}

	<form method="POST" action="/auth/logout">
		<button class="link">{t.auth.switchAccount}</button>
	</form>
</section>

<style>
	.card {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		max-width: 440px;
		margin: var(--space-6) auto;
		padding: var(--space-6) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-l);
		background: var(--surface);
		text-align: center;
	}

	.logo {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-m);
		background: var(--accent-soft);
		color: var(--accent);
	}

	p {
		color: var(--text-muted);
	}

	.small {
		font-size: var(--text-sm);
	}

	.request {
		display: grid;
		gap: var(--space-3);
		justify-items: center;
		width: 100%;
	}

	.request label {
		display: grid;
		gap: var(--space-1);
		width: 100%;
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		text-align: left;
	}

	.request input {
		height: 42px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-control);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}

	.button {
		padding: 10px 22px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--accent-contrast);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.link {
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.ok,
	.error {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-3);
		border-radius: var(--radius-m);
		color: var(--text);
		text-align: left;
	}

	.ok {
		background: color-mix(in oklab, var(--ok) 12%, transparent);
	}

	.error {
		background: color-mix(in oklab, var(--danger) 10%, transparent);
	}
</style>

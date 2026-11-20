<script lang="ts">
	import * as t from '#lib/i18n/texts.ts';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
</script>

<Title title={t.accessLink.title} />

<section class="card">
	<img class="logo" src="/logo.svg" alt="" width="88" height="88" />
	{#if data.valid && !form?.invalid}
		<h1>{t.accessLink.hello(data.firstName)}</h1>
		<p>{t.accessLink.lead}</p>
		<form method="POST">
			<button class="btn">{t.accessLink.signIn}</button>
		</form>
		<p class="small">{t.accessLink.keep}</p>
	{:else}
		<h1>{t.accessLink.title}</h1>
		<p class="error" role="alert">{t.accessLink.invalid}</p>
		<a class="link" href="/anmelden">{t.accessLink.toSignIn}</a>
	{/if}
</section>

<style>
	.card {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		max-width: 420px;
		margin: var(--space-6) auto;
		padding: var(--space-6) var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-l);
		background: var(--surface);
		text-align: center;
	}

	.logo {
		width: 88px;
		height: 88px;
	}

	h1 {
		margin: 0;
	}

	p {
		color: var(--text-muted);
	}

	.small {
		font-size: var(--text-xs);
	}

	.error {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--danger) 10%, transparent);
		color: var(--text);
	}

	.link {
		color: var(--accent);
		font-weight: 600;
	}
</style>

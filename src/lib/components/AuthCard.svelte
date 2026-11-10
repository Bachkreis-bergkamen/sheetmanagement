<script lang="ts">
	import type { Snippet } from 'svelte';

	/** The narrow card with the logo that the sign-in pages share. */
	let { children }: { children: Snippet } = $props();
</script>

<section class="auth-card">
	<img class="logo" src="/logo.svg" alt="" width="88" height="88" />
	{@render children()}
</section>

<style>
	.auth-card {
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

	.auth-card :global(h1) {
		margin: 0;
	}

	.auth-card :global(p) {
		color: var(--text-muted);
	}

	.auth-card :global(form.stack) {
		display: grid;
		gap: var(--space-3);
		width: 100%;
		text-align: left;
	}

	.auth-card :global(.msg) {
		width: 100%;
		text-align: left;
	}

	.auth-card :global(.small) {
		font-size: var(--text-xs);
	}

	.auth-card :global(a.link) {
		color: var(--accent);
		font-weight: 600;
	}
</style>

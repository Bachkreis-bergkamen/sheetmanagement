<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n/index.ts';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	let sending = $state(false);
</script>

<Title title={t.auth.title} />

<section class="card">
	<img class="logo" src="/logo.svg" alt="" width="88" height="88" />
	<h1>{t.auth.title}</h1>
	<p>{t.auth.lead}</p>

	{#if data.error}
		<p class="error" role="alert">{t.auth.errors[data.error] ?? t.auth.errors.google}</p>
	{/if}

	{#if data.problems.length}
		<div class="error" role="alert">
			<p>{t.auth.notReady}</p>
			<ul>
				{#each data.problems as problem (problem)}<li>{problem}</li>{/each}
			</ul>
		</div>
	{:else}
		{#if data.accounts.length}
			<!-- Accounts kept on this device (shared device, admin and member account): one tap back in. -->
			<div class="accounts">
				<p class="small">{t.auth.accounts.onDevice}</p>
				{#each data.accounts as account (account.email)}
					<form method="POST" action="/auth/konto">
						<input type="hidden" name="email" value={account.email} />
						<input type="hidden" name="weiter" value={data.returnTo} />
						<button class="account" name="aktion" value="wechseln">
							<strong>{account.name}</strong>
							<span>{account.email}</span>
						</button>
					</form>
				{/each}
			</div>
			<p class="or"><span>{t.email.or}</span></p>
		{/if}
		{#if data.google}
			<!-- First: everyone who signed in with Google before the password sign-in has no password. -->
			<a class="button" href="/auth/login?weiter={encodeURIComponent(data.returnTo)}" data-sveltekit-reload>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.2Z" />
					<path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23Z" />
					<path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2a11 11 0 0 0 0 9.8L5.7 14Z" />
					<path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10C6.6 7.4 9.1 5.4 12 5.4Z" />
				</svg>
				{t.auth.button}
			</a>
			<p class="small">{t.auth.privacy}</p>
			<p class="or"><span>{t.email.or}</span></p>
		{/if}
		<form
			class="password"
			method="POST"
			action="?/password"
			use:enhance={() => {
				sending = true;
				return async ({ update }) => {
					await update({ reset: false });
					sending = false;
				};
			}}
		>
			<label class="field">
				{t.password.email}
				<input name="email" type="email" autocomplete="username" required value={form?.email ?? ''} aria-invalid={!!form?.passwordError} />
			</label>
			<label class="field">
				{t.password.password}
				<input name="password" type="password" autocomplete="current-password" required maxlength="200" aria-invalid={!!form?.passwordError} />
			</label>
			<input type="hidden" name="weiter" value={data.returnTo} />
			{#if form?.passwordError}<p class="msg error" role="alert">{t.password.signInErrors[form.passwordError]}</p>{/if}
			<button class="btn" disabled={sending}>{t.password.signIn}</button>
		</form>
		<p class="small">
			{#if data.mail}
				<a class="link" href="/auth/passwort">{t.password.createOrReset}</a>
			{:else}
				{t.password.noMailHint}
			{/if}
		</p>
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

	p {
		color: var(--text-muted);
	}

	.button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-2);
		padding: 12px 22px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--bg);
		color: var(--text);
		font-weight: 600;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}

	.button:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow);
	}

	.small {
		font-size: var(--text-xs);
	}

	.error {
		width: 100%;
		padding: var(--space-3);
		border-radius: var(--radius-m);
		background: color-mix(in oklab, var(--danger) 10%, transparent);
		color: var(--text);
		text-align: left;
	}

	.or {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		margin: var(--space-2) 0 0;
		font-size: var(--text-xs);
	}

	.or::before,
	.or::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--border);
	}

	.password {
		display: grid;
		gap: var(--space-3);
		width: 100%;
		text-align: left;
	}

	.password .msg {
		width: 100%;
	}

	.link {
		color: var(--accent);
		font-weight: 600;
	}

	.accounts {
		display: grid;
		gap: var(--space-2);
		width: 100%;
	}

	.account {
		display: grid;
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-m);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.account:hover {
		border-color: var(--accent);
	}

	.account span {
		overflow-wrap: anywhere;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.error ul {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-5);
	}
</style>

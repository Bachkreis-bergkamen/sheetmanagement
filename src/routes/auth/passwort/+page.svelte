<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n/index.ts';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	let sending = $state(false);
</script>

<Title title={t.password.requestTitle} />

<AuthCard>
	<h1>{t.password.requestTitle}</h1>
	{#if !data.mail}
		<p class="msg info">{t.password.noMail}</p>
	{:else if form?.mailSent}
		<p class="msg ok" role="status">{t.password.sent(form.mailSent)}</p>
	{:else}
		<p>{t.password.requestLead}</p>
		<form
			class="stack"
			method="POST"
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
				<input name="email" type="email" autocomplete="email" required value={form?.email ?? ''} aria-invalid={!!form?.mailError} />
			</label>
			<button class="btn" disabled={sending}>{t.password.send}</button>
			{#if form?.mailError}<p class="msg error" role="alert">{t.password.mailErrors[form.mailError]}</p>{/if}
		</form>
	{/if}
	<a class="link" href="/anmelden">{t.password.toSignIn}</a>
</AuthCard>

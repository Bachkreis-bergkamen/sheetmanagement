<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import Title from '#lib/components/Title.svelte';
	import PasswordFields from '#lib/components/PasswordFields.svelte';

	let { data, form } = $props();
</script>

<Title title={data.exists ? t.password.resetTitle : t.password.setTitle} />

<AuthCard>
	<h1>{data.exists ? t.password.resetTitle : t.password.setTitle}</h1>
	{#if data.email && !form?.invalid}
		<p>{t.password.setLead(data.email)}</p>
		<form class="stack" method="POST">
			<PasswordFields email={data.email} problem={form?.problem} />
			{#if form?.failed}<p class="msg error" role="alert">{t.password.failed}</p>{/if}
			<button class="btn">{t.password.save}</button>
		</form>
	{:else}
		<p class="msg error" role="alert">{t.password.linkInvalid}</p>
		<a class="link" href="/auth/passwort">{t.password.newLink}</a>
	{/if}
</AuthCard>

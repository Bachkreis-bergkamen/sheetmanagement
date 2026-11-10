<script lang="ts">
	import { enhance } from '$app/forms';
	import { FormState } from '#lib/forms.svelte.ts';
	import { t } from '#lib/i18n/index.ts';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InstrumentPicker from '#lib/components/InstrumentPicker.svelte';
	import PasswordFields from '#lib/components/PasswordFields.svelte';
	import Title from '#lib/components/Title.svelte';

	let { data, form } = $props();
	const joining = new FormState();
	let email = $state('');
	// svelte-ignore state_referenced_locally
	if (form && 'email' in form && form.email) email = form.email;
	const field = $derived(form && 'field' in form ? form.field : null);
</script>

<Title title={t.invite.title} />

<AuthCard>
	<h1>{t.invite.title}</h1>
	{#if data.valid && !form?.invalid}
		<p>{t.invite.lead}</p>
		<form class="stack" method="POST" use:enhance={joining.submit()}>
			<div class="step">
				<h2>{t.invite.aboutYou}</h2>
				<label class="field">
					{t.profile.name}
					<input name="name" autocomplete="name" required maxlength="200" value={form && 'name' in form ? form.name : ''} aria-invalid={field === 'name'} />
				</label>
				<div class="group">
					<span class="caption">{t.profile.instruments}</span>
					<InstrumentPicker instruments={data.instruments} common={data.common} required />
				</div>
				{#if data.orchestras.length > 1}
					<fieldset class="group plain">
						<legend class="caption">{t.profile.orchestras}</legend>
						<div class="checks">
							{#each data.orchestras as orchestra (orchestra)}
								<label class="check"><input type="checkbox" name="orchestra" value={orchestra} />{orchestra}</label>
							{/each}
						</div>
						<span class="hint">{t.profile.orchestrasHint}</span>
					</fieldset>
				{/if}
			</div>

			<div class="step">
				<h2>{t.invite.signIn}</h2>
				<p class="hint">{t.invite.signInLead}</p>
				<label class="field">
					{t.password.email}
					<input name="email" type="email" autocomplete="email" required maxlength="200" bind:value={email} aria-invalid={field === 'email'} />
				</label>
				<PasswordFields {email} />
			</div>

			{#if form && 'message' in form && form.message}
				<p class="msg error" role="alert">
					{form.message}
					{#if 'exists' in form && form.exists}<a class="link" href="/anmelden">{t.password.toSignIn}</a>{/if}
				</p>
			{/if}
			<button class="btn" disabled={joining.busy}><Icon name="check" size={16} />{t.invite.join}</button>
		</form>
	{:else}
		<p class="msg error" role="alert">{t.invite.invalid}</p>
		<a class="link" href="/anmelden">{t.password.toSignIn}</a>
	{/if}
</AuthCard>

<style>
	.step {
		display: grid;
		gap: var(--space-3);
	}

	.step + .step {
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
	}

	.step > h2 {
		margin: 0;
		font-size: var(--text-md);
	}

	.group {
		display: grid;
		gap: var(--space-2);
	}

	.plain {
		margin: 0;
		padding: 0;
		border: 0;
	}

	.caption {
		padding: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.msg .link {
		margin-left: var(--space-1);
	}
</style>

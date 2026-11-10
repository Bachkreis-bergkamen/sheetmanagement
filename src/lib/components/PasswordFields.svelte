<script lang="ts">
	import { MAX_LENGTH, MIN_LENGTH, type PasswordProblem } from '#lib/access/password-rules.ts';
	import { t } from '#lib/i18n/index.ts';

	/** A new password, twice, with the account's email for password managers. */
	let { email, problem }: { email: string; problem?: PasswordProblem | null } = $props();
</script>

<!-- For password managers: which account the new password belongs to. -->
<input type="email" name="username" autocomplete="username" value={email} hidden readonly />
<label class="field">
	{t.password.newPassword}
	<input name="password" type="password" autocomplete="new-password" required minlength={MIN_LENGTH} maxlength={MAX_LENGTH} aria-invalid={!!problem} />
</label>
<label class="field">
	{t.password.repeat}
	<input name="repeat" type="password" autocomplete="new-password" required minlength={MIN_LENGTH} maxlength={MAX_LENGTH} aria-invalid={problem === 'mismatch'} />
</label>
<p class="rule">{t.password.rule(MIN_LENGTH)}</p>
{#if problem}<p class="msg error" role="alert">{t.password.problems[problem]}</p>{/if}

<style>
	.rule {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
